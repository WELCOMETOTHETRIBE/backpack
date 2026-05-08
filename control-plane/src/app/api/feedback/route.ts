import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/db'
import { feedback } from '@/db/schema'
import { eq, and, desc, count } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/lib/auth'

// Element fields can arrive as null (from JSON.stringify of null values) or
// undefined (when omitted). Both are valid — normalise to string | undefined.
const nullableStr = z.string().nullable().optional().transform((v) => v ?? undefined)

const feedbackSchema = z.object({
  content: z.string().min(1).max(5000),
  category: z.enum(['bug', 'ux', 'feature', 'general']).optional().default('general'),
  pageUrl: nullableStr,
  elementSelector: nullableStr,
  elementId: nullableStr,
  elementClass: nullableStr,
  elementText: nullableStr,
  elementType: nullableStr,
})

const patchSchema = z.object({
  status: z.enum(['pending', 'reviewed', 'resolved']),
})

async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth()
  return (session?.user as SessionUser) ?? null
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user?.id || !user?.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = feedbackSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { content, category, pageUrl, elementSelector, elementId, elementClass, elementText, elementType } =
      parsed.data

    const [created] = await db
      .insert(feedback)
      .values({
        organizationId: user.organizationId!,
        userId: user.id,
        content: content.trim(),
        category,
        pageUrl: pageUrl?.trim() || null,
        elementSelector: elementSelector?.trim() || null,
        elementId: elementId?.trim() || null,
        elementClass: elementClass?.trim() || null,
        elementText: elementText?.trim() || null,
        elementType: elementType?.trim() || null,
      })
      .returning({ id: feedback.id })

    return NextResponse.json({ success: true, id: created.id }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to submit feedback'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user?.id || !user?.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!['Admin', 'Compliance'].includes(user.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') as 'pending' | 'reviewed' | 'resolved' | null
    const countOnly = searchParams.get('count') === '1'

    const conditions = [eq(feedback.organizationId, user.organizationId!)]
    if (status) conditions.push(eq(feedback.status, status))

    if (countOnly) {
      const [row] = await db
        .select({ total: count() })
        .from(feedback)
        .where(and(...conditions))
      return NextResponse.json({ count: row?.total ?? 0 })
    }

    const rows = await db
      .select()
      .from(feedback)
      .where(and(...conditions))
      .orderBy(desc(feedback.createdAt))
      .limit(200)

    return NextResponse.json({ feedback: rows })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch feedback'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user?.id || !user?.organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!['Admin', 'Compliance'].includes(user.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const body = await req.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
    }

    const now = new Date()
    const updates: Record<string, unknown> = {
      status: parsed.data.status,
      updatedAt: now,
    }
    if (parsed.data.status === 'reviewed') updates.reviewedAt = now
    if (parsed.data.status === 'resolved') updates.resolvedAt = now

    await db
      .update(feedback)
      .set(updates)
      .where(and(eq(feedback.id, id), eq(feedback.organizationId, user.organizationId!)))

    return NextResponse.json({ success: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to update feedback'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
