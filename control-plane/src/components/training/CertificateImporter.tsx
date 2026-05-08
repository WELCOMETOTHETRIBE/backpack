'use client'

import { useCallback, useRef, useState } from 'react'
import JSZip from 'jszip'
import {
  Upload,
  FileCheck2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ExternalLink,
  X,
  Award,
  User,
  BookOpen,
  Calendar,
  Star,
  ShieldCheck,
} from 'lucide-react'
import type { MactechMetadata } from '@/app/api/training-records/import/route'

// ── AT control display helpers ────────────────────────────────────────────────

const AT_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  '3.2.1': { label: 'Security Awareness Training', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  '3.2.2': { label: 'Role-Based Training', color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200' },
  '3.2.3': { label: 'Insider Threat Awareness', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ImportResult {
  ok: true
  trainingRecord: { id: string; personnelName: string; courseTitle: string }
  registerId: string | null
  atControl: string
  certificateId: string
  pdfUploaded: boolean
  pdfWarning: string | null
}

type State =
  | { phase: 'idle' }
  | { phase: 'preview'; meta: MactechMetadata; file: File }
  | { phase: 'uploading'; meta: MactechMetadata }
  | { phase: 'success'; result: ImportResult; meta: MactechMetadata }
  | { phase: 'error'; message: string }

// ── Client-side metadata parser ───────────────────────────────────────────────

async function parseZip(file: File): Promise<MactechMetadata> {
  const buf = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(buf)

  const metaEntry = Object.values(zip.files).find(
    (f) => !f.dir && f.name.endsWith('.metadata.json'),
  )
  if (!metaEntry) throw new Error('No .metadata.json found in ZIP. Make sure this is a MacTech Training export.')

  const raw = JSON.parse(await metaEntry.async('text')) as Record<string, unknown>

  // Basic client-side checks before sending to server
  if (raw.mactech_schema_version !== '2') {
    throw new Error(
      `Unsupported schema version "${raw.mactech_schema_version}". Update the MacTech export template to version 2.`,
    )
  }
  if (!raw.at_control || !raw.certificate_id || !raw.course_name) {
    throw new Error('Missing required fields: at_control, certificate_id, or course_name. Check the export template.')
  }

  return raw as MactechMetadata
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  /** If provided, validates that the dropped cert matches this AT control */
  atControl?: '3.2.1' | '3.2.2' | '3.2.3'
  onImported?: (result: ImportResult) => void
}

export default function CertificateImporter({ atControl, onImported }: Props) {
  const [state, setState] = useState<State>({ phase: 'idle' })
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.zip')) {
        setState({ phase: 'error', message: 'Drop a .zip file exported from training.mactechsolutionsllc.com' })
        return
      }
      setState({ phase: 'uploading', meta: {} as MactechMetadata }) // brief spinner while parsing

      try {
        const meta = await parseZip(file)

        if (atControl && meta.at_control !== atControl) {
          setState({
            phase: 'error',
            message: `This certificate is for AT ${meta.at_control} (${AT_META[meta.at_control]?.label ?? meta.at_control}), not AT ${atControl}. Drop it in the correct section.`,
          })
          return
        }

        setState({ phase: 'preview', meta, file })
      } catch (err) {
        setState({ phase: 'error', message: err instanceof Error ? err.message : 'Failed to parse ZIP' })
      }
    },
    [atControl],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) processFile(file)
    },
    [processFile],
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) processFile(file)
      e.target.value = ''
    },
    [processFile],
  )

  const confirmImport = useCallback(async () => {
    if (state.phase !== 'preview') return
    const { meta, file } = state
    setState({ phase: 'uploading', meta })

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/training-records/import', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (!res.ok) {
        setState({ phase: 'error', message: data.error ?? `Server error ${res.status}` })
        return
      }

      const result = data as ImportResult
      setState({ phase: 'success', result, meta })
      onImported?.(result)
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : 'Network error' })
    }
  }, [state, onImported])

  const reset = () => setState({ phase: 'idle' })

  // ── Idle drop zone ────────────────────────────────────────────────────────

  if (state.phase === 'idle') {
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`group relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 transition-all duration-200 ${
          dragging
            ? 'border-[#00A882] bg-[#00A882]/5 scale-[1.01]'
            : 'border-neutral-300 bg-neutral-50 hover:border-[#00A882]/60 hover:bg-[#00A882]/5'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
          dragging ? 'bg-[#00A882]/20' : 'bg-neutral-200 group-hover:bg-[#00A882]/15'
        }`}>
          <Upload className={`h-5 w-5 transition-colors ${dragging ? 'text-[#00A882]' : 'text-neutral-400 group-hover:text-[#00A882]'}`} />
        </div>

        <div className="text-center">
          <p className="text-sm font-semibold text-neutral-700">
            Drop MacTech certificate ZIP
          </p>
          <p className="mt-0.5 text-xs text-neutral-400">
            Exported from{' '}
            <span className="font-medium text-[#00A882]">training.mactechsolutionsllc.com</span>
          </p>
        </div>

        {atControl && (
          <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${AT_META[atControl]?.bg} ${AT_META[atControl]?.color} ${AT_META[atControl]?.border} border`}>
            <ShieldCheck className="h-3 w-3" />
            Satisfies NIST {atControl} · {AT_META[atControl]?.label}
          </div>
        )}
      </div>
    )
  }

  // ── Uploading / parsing spinner ───────────────────────────────────────────

  if (state.phase === 'uploading') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-6 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-[#00A882]" />
        <p className="text-sm font-medium text-neutral-600">Processing certificate…</p>
      </div>
    )
  }

  // ── Preview ───────────────────────────────────────────────────────────────

  if (state.phase === 'preview') {
    const { meta } = state
    const atMeta = AT_META[meta.at_control]
    const scoreNum = meta.score
    const passed = meta.assessment_result === 'Pass'

    return (
      <div className="rounded-xl border border-[#00A882]/30 bg-white shadow-sm overflow-hidden">
        {/* MacTech header bar */}
        <div className="flex items-center gap-3 bg-[#00A882] px-5 py-3">
          <Award className="h-5 w-5 text-white" />
          <span className="text-sm font-bold text-white">MacTech Training Certificate</span>
          <button onClick={reset} className="ml-auto text-white/70 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Fields */}
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-start gap-2">
              <User className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Name</p>
                <p className="text-sm font-semibold text-neutral-900">{meta.name}</p>
                {meta.email && <p className="text-xs text-neutral-500">{meta.email}</p>}
              </div>
            </div>

            <div className="flex items-start gap-2">
              <BookOpen className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Course</p>
                <p className="text-sm font-semibold text-neutral-900">{meta.course_name}</p>
                <p className="text-xs text-neutral-400 font-mono">{meta.course_id}</p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Completed</p>
                <p className="text-sm font-semibold text-neutral-900">
                  {new Date(meta.completion_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                <p className="text-xs text-neutral-400">Training Year {meta.training_year}</p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Star className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Result</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {passed ? (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> Pass
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                      <AlertCircle className="h-3 w-3" /> Fail
                    </span>
                  )}
                  {scoreNum !== undefined && (
                    <span className="text-sm font-bold text-neutral-700">{scoreNum}%</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* AT control badge */}
          {atMeta && (
            <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${atMeta.bg} ${atMeta.border}`}>
              <ShieldCheck className={`h-4 w-4 shrink-0 ${atMeta.color}`} />
              <div>
                <p className={`text-xs font-semibold ${atMeta.color}`}>
                  Satisfies NIST {meta.at_control} · {atMeta.label}
                </p>
                <p className="text-[10px] text-neutral-500">
                  Creates a training record + evidence register entry
                </p>
              </div>
            </div>
          )}

          {/* Cert ID */}
          <p className="font-mono text-[10px] text-neutral-400 truncate">
            ID: {meta.certificate_id}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-neutral-100 px-5 py-3">
          <button
            onClick={reset}
            className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={confirmImport}
            className="flex items-center gap-2 rounded-lg bg-[#00A882] hover:bg-[#008f6e] text-white px-4 py-1.5 text-sm font-semibold shadow-sm transition-colors"
          >
            <FileCheck2 className="h-4 w-4" />
            Import Certificate
          </button>
        </div>
      </div>
    )
  }

  // ── Success ───────────────────────────────────────────────────────────────

  if (state.phase === 'success') {
    const { result, meta } = state
    const atMeta = AT_META[result.atControl]

    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 overflow-hidden">
        <div className="flex items-start gap-3 px-5 py-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-emerald-800">Certificate imported</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              {meta.name} · {meta.course_name}
            </p>
            {atMeta && (
              <p className="text-xs text-emerald-600 mt-1">
                NIST {result.atControl} ({atMeta.label}) satisfied
                {result.pdfUploaded && ' · PDF uploaded'}
              </p>
            )}
            {result.pdfWarning && (
              <p className="text-xs text-amber-600 mt-1">
                {result.pdfWarning}
              </p>
            )}
            {result.registerId && (
              <a
                href="/dashboard/evidence-engine/registers/training_completion"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
              >
                View in Training Completion Register
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <button onClick={reset} className="text-emerald-400 hover:text-emerald-600 transition-colors shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 overflow-hidden">
      <div className="flex items-start gap-3 px-5 py-4">
        <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-red-800">Import failed</p>
          <p className="text-xs text-red-700 mt-0.5 leading-relaxed">{state.message}</p>
        </div>
        <button onClick={reset} className="text-red-400 hover:text-red-600 transition-colors shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
