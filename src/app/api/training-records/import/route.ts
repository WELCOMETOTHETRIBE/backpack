import { NextResponse } from 'next/server'
import { z } from 'zod'
import JSZip from 'jszip'
import { db } from '@/db'
import {
  trainingRecords,
  governanceRegisters,
  governanceRegisterEntries,
  boundaries,
} from '@/db/schema'
import { eq, and, asc, like } from 'drizzle-orm'
import { requireOrg, requireRole } from '@/lib/auth'
import { ensureEvidenceEngineRegistersForOrg } from '@/lib/evidence-engine/control-dashboard'
import { logEntryEvent } from '@/lib/evidence-engine/entry-events'
import { getStorageService } from '@/lib/storage'

// ── MacTech metadata v2 schema ────────────────────────────────────────────────

export const MactechMetadataSchema = z.object({
  mactech_schema_version: z.literal('2'),
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  user_id: z.string(),
  role: z.string().optional(),
  course_id: z.string().min(1),
  course_name: z.string().min(1),
  at_control: z.enum(['3.2.1', '3.2.2', '3.2.3']),
  training_type: z.enum(['annual', 'role_based', 'insider_threat']),
  completion_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  training_year: z.string().regex(/^\d{4}$/, 'Must be a 4-digit year'),
  delivery_method: z.enum(['lms', 'in_person', 'virtual', 'self_study', 'other']),
  score: z.number().min(0).max(100).optional(),
  assessment_result: z.enum(['Pass', 'Fail']).optional(),
  certificate_id: z.string().min(1),
  file_name: z.string().min(1),
})

export type MactechMetadata = z.infer<typeof MactechMetadataSchema>

// ── Mapping helpers ───────────────────────────────────────────────────────────

const AT_CONTROL_TO_TRAINING_TYPE: Record<string, string> = {
  '3.2.1': 'security_awareness',
  '3.2.2': 'role_based',
  '3.2.3': 'insider_threat',
}

function toEntryType(trainingType: MactechMetadata['training_type']): string {
  return trainingType === 'role_based'
    ? 'role_based_training_completion'
    : 'annual_training_completion'
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const orgId = await requireOrg()
    const user = await requireRole(['Admin', 'Compliance'])

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    if (!file.name.toLowerCase().endsWith('.zip')) {
      return NextResponse.json({ error: 'File must be a .zip export from MacTech Training.' }, { status: 400 })
    }

    // ── Parse ZIP ─────────────────────────────────────────────────────────────
    const buffer = Buffer.from(await file.arrayBuffer())
    const zip = await JSZip.loadAsync(buffer)

    const metaEntry = Object.values(zip.files).find(
      (f) => !f.dir && f.name.endsWith('.metadata.json'),
    )
    if (!metaEntry) {
      return NextResponse.json(
        { error: 'No .metadata.json found in the ZIP. Make sure this is a MacTech Training export.' },
        { status: 400 },
      )
    }

    let metaRaw: unknown
    try {
      metaRaw = JSON.parse(await metaEntry.async('text'))
    } catch {
      return NextResponse.json({ error: 'Failed to parse .metadata.json — invalid JSON.' }, { status: 400 })
    }

    const parsed = MactechMetadataSchema.safeParse(metaRaw)
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors
      const missing = Object.keys(fields).join(', ')
      return NextResponse.json(
        {
          error: `Metadata schema v2 validation failed. Invalid/missing fields: ${missing}`,
          details: fields,
        },
        { status: 422 },
      )
    }
    const meta = parsed.data

    // ── Deduplication ─────────────────────────────────────────────────────────
    // We tag imported records in notes as "mactech:CERT-ID" for dedup.
    const dupCheck = await db
      .select({ id: trainingRecords.id })
      .from(trainingRecords)
      .where(
        and(
          eq(trainingRecords.organizationId, orgId),
          like(trainingRecords.notes, `mactech:${meta.certificate_id}%`),
        ),
      )
      .limit(1)

    if (dupCheck.length > 0) {
      return NextResponse.json(
        { error: `Certificate ${meta.certificate_id} has already been imported.` },
        { status: 409 },
      )
    }

    // ── Upload PDF ────────────────────────────────────────────────────────────
    let evidenceUrl: string | null = null
    const pdfEntry = Object.values(zip.files).find(
      (f) => !f.dir && f.name.toLowerCase().endsWith('.pdf'),
    )
    if (pdfEntry) {
      try {
        const storage = getStorageService()
        const pdfBuffer = Buffer.from(await pdfEntry.async('arraybuffer'))
        const result = await storage.upload(pdfBuffer, {
          organizationId: orgId,
          controlId: meta.at_control,
          fileName: meta.file_name,
          mimeType: 'application/pdf',
        })
        evidenceUrl = result.fileUrl
      } catch {
        // Storage not configured — proceed without PDF; URL will be null
      }
    }

    // ── Training record ───────────────────────────────────────────────────────
    const completedDate = new Date(meta.completion_date)
    const expiresDate = new Date(completedDate)
    expiresDate.setFullYear(expiresDate.getFullYear() + 1)

    const noteTag = `mactech:${meta.certificate_id}` // dedup key; shown as source in UI

    const [row] = await db
      .insert(trainingRecords)
      .values({
        organizationId: orgId,
        personnelName: meta.name,
        personnelEmail: meta.email || null,
        trainingType: AT_CONTROL_TO_TRAINING_TYPE[meta.at_control] ?? 'security_awareness',
        courseTitle: meta.course_name,
        deliveryMethod: 'mactech_training',
        completedAt: meta.completion_date,
        expiresAt: expiresDate.toISOString().slice(0, 10),
        evidenceUrl,
        notes: noteTag,
        createdById: user.id ?? null,
      })
      .returning()

    // ── Register entry ────────────────────────────────────────────────────────
    let registerId: string | null = null

    const [firstBoundary] = await db
      .select({ id: boundaries.id })
      .from(boundaries)
      .where(eq(boundaries.organizationId, orgId))
      .orderBy(asc(boundaries.createdAt))
      .limit(1)

    if (firstBoundary) {
      await ensureEvidenceEngineRegistersForOrg(orgId)

      const [register] = await db
        .select()
        .from(governanceRegisters)
        .where(
          and(
            eq(governanceRegisters.organizationId, orgId),
            eq(governanceRegisters.registerKey, 'training_completion'),
          ),
        )

      if (register) {
        const entryType = toEntryType(meta.training_type)

        const entryData: Record<string, unknown> = {
          subject_user: meta.name,
          training_name: meta.course_name,
          completed_at: meta.completion_date,
          delivery_method: meta.delivery_method,
          training_year: meta.training_year,
          certificate_id: meta.certificate_id,
          course_id: meta.course_id,
          at_control: meta.at_control,
          source: 'mactech_import',
        }

        if (meta.score !== undefined) entryData.score = String(meta.score)
        if (meta.assessment_result) entryData.assessment_result = meta.assessment_result
        if (meta.role) entryData.user_role = meta.role

        if (meta.training_type === 'role_based') {
          entryData.role = meta.role ?? 'privileged_user'
          entryData.required_by = `CMMC ${meta.at_control}`
        }

        if (evidenceUrl) entryData.certificate_url = evidenceUrl

        const [entry] = await db
          .insert(governanceRegisterEntries)
          .values({
            registerId: register.id,
            boundaryId: firstBoundary.id,
            entryType,
            status: 'final', // imported certs are immediately final evidence
            entryData,
            createdById: user.id ?? null,
            hold: 0,
          })
          .returning()

        registerId = entry?.id ?? null

        if (entry?.id) {
          await logEntryEvent(
            orgId,
            entry.id,
            firstBoundary.id,
            'created',
            user.id ?? null,
            {
              entry_type: entryType,
              source: 'mactech_certificate_import',
              at_control: meta.at_control,
              certificate_id: meta.certificate_id,
              course_id: meta.course_id,
            },
          )
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,
        trainingRecord: row,
        registerId,
        atControl: meta.at_control,
        certificateId: meta.certificate_id,
        pdfUploaded: !!evidenceUrl,
      },
      { status: 201 },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Import failed'
    const status =
      msg.includes('Unauthorized') ? 401
      : msg.includes('Forbidden') ? 403
      : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
