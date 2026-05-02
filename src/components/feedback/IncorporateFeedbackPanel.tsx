'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Bot, X, GitCommit, Loader2, CheckCircle2, AlertCircle, FileCode, Search, FolderSearch, FilePen, ChevronRight, ExternalLink, Sparkles } from 'lucide-react'

type EventType = 'log' | 'thinking' | 'tool' | 'change' | 'commit' | 'done' | 'error'

interface AgentEvent {
  type: EventType
  message?: string
  name?: string
  path?: string
  sha?: string
  fullSha?: string
  url?: string
  changes?: number
}

const TOOL_ICONS: Record<string, React.ReactNode> = {
  read_file: <FileCode className="h-3 w-3" />,
  list_files: <FolderSearch className="h-3 w-3" />,
  search_code: <Search className="h-3 w-3" />,
  write_file: <FilePen className="h-3 w-3" />,
}

// Match http(s) URLs up to the first whitespace or trailing punctuation
// (the closing `.,)]}>"'` characters that are almost always sentence terminators
// rather than part of the URL).
const URL_REGEX = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]}])/g

function renderMessageWithLinks(message: string | undefined, linkClassName: string) {
  if (!message) return null
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  URL_REGEX.lastIndex = 0
  while ((match = URL_REGEX.exec(message)) !== null) {
    if (match.index > lastIndex) {
      parts.push(message.slice(lastIndex, match.index))
    }
    const url = match[0]
    parts.push(
      <a
        key={`url-${match.index}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
      >
        {url}
      </a>,
    )
    lastIndex = match.index + url.length
  }
  if (lastIndex < message.length) parts.push(message.slice(lastIndex))
  return parts.length > 0 ? parts : message
}

function EventRow({ ev, idx }: { ev: AgentEvent; idx: number }) {
  if (ev.type === 'log') {
    return (
      <div key={idx} className="flex items-start gap-2 text-neutral-400">
        <ChevronRight className="h-3 w-3 shrink-0 mt-0.5 text-neutral-600" />
        <span className="break-all">
          {renderMessageWithLinks(ev.message, 'text-indigo-300 underline underline-offset-2 hover:text-indigo-200')}
        </span>
      </div>
    )
  }
  if (ev.type === 'thinking') {
    return (
      <div key={idx} className="flex items-start gap-2 text-indigo-300 italic">
        <Bot className="h-3 w-3 shrink-0 mt-0.5 text-indigo-400" />
        <span className="opacity-80 break-all">
          {renderMessageWithLinks(ev.message, 'not-italic underline underline-offset-2 hover:text-indigo-200')}
        </span>
      </div>
    )
  }
  if (ev.type === 'tool') {
    const icon = TOOL_ICONS[ev.name ?? ''] ?? <ChevronRight className="h-3 w-3" />
    const label = ev.name === 'write_file' ? (
      <span className="text-amber-300">{ev.name}(<span className="text-amber-200">{ev.path}</span>)</span>
    ) : (
      <span className="text-sky-300">{ev.name}(<span className="text-sky-200">{ev.path}</span>)</span>
    )
    return (
      <div key={idx} className="flex items-center gap-2 text-xs font-mono">
        <span className="text-neutral-600">{icon}</span>
        {label}
      </div>
    )
  }
  if (ev.type === 'change') {
    return (
      <div key={idx} className="flex items-center gap-2 text-emerald-400 font-mono text-xs">
        <span className="text-emerald-600">+</span>
        <span>{ev.path}</span>
        <span className="text-emerald-600 text-[10px] font-sans">staged</span>
      </div>
    )
  }
  if (ev.type === 'commit') {
    return (
      <div key={idx} className="flex items-center gap-2 text-emerald-300 font-mono text-xs">
        <GitCommit className="h-3 w-3 text-emerald-400" />
        <a
          href={ev.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline flex items-center gap-1"
        >
          {ev.sha}
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
        <span className="text-emerald-500 font-sans">{ev.changes} file(s) committed</span>
      </div>
    )
  }
  if (ev.type === 'error') {
    return (
      <div key={idx} className="flex items-start gap-2 text-red-400">
        <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
        <span className="break-all">
          {renderMessageWithLinks(ev.message, 'underline underline-offset-2 hover:text-red-300')}
        </span>
      </div>
    )
  }
  return null
}

export default function IncorporateFeedbackPanel({ pendingCount }: { pendingCount: number }) {
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [commitInfo, setCommitInfo] = useState<{ sha: string; url: string; changes: number } | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const runIdRef = useRef<string | null>(null)
  const lastSeqRef = useRef<number>(0)
  const failedPollsRef = useRef<number>(0)
  const MAX_CONSECUTIVE_POLL_FAILURES = 30 // ~60s of outage tolerated

  const addEvents = useCallback((newEvents: AgentEvent[]) => {
    setEvents(prev => {
      const next = [...prev, ...newEvents]
      setTimeout(() => {
        logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
      }, 0)
      return next
    })
  }, [])

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const poll = useCallback(async () => {
    const runId = runIdRef.current
    if (!runId) return

    try {
      const res = await fetch(
        `/api/ai/incorporate-feedback?runId=${runId}&after=${lastSeqRef.current}`,
        { cache: 'no-store' },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(body.error ?? 'Poll failed')
      }

      // Poll succeeded — reset the transient-failure counter
      failedPollsRef.current = 0

      const data: { status: string; events: Array<{ seq: number } & AgentEvent>; lastSeq: number } =
        await res.json()

      if (data.events.length > 0) {
        const payloads: AgentEvent[] = data.events.map(({ seq: _seq, ...ev }) => ev as AgentEvent)
        lastSeqRef.current = data.lastSeq
        addEvents(payloads)

        for (const ev of payloads) {
          if (ev.type === 'commit') {
            setCommitInfo({ sha: ev.sha!, url: ev.url!, changes: ev.changes! })
          }
          if (ev.type === 'done') {
            setDone(true)
            setRunning(false)
            stopPolling()
          }
          if (ev.type === 'error') {
            setError(ev.message ?? 'Unknown error')
            setRunning(false)
            stopPolling()
          }
        }
      }

      // Also stop if the run itself is marked done/error in DB
      if (data.status === 'done' || data.status === 'error') {
        if (data.status === 'done') setDone(true)
        if (data.status === 'error') setError(prev => prev ?? 'Agent run ended with error')
        setRunning(false)
        stopPolling()
      }
    } catch (err) {
      // Transient network failures (ERR_NETWORK_CHANGED, offline blips, Railway
      // edge hiccups) should NOT kill the run — the agent keeps working in the
      // background regardless. Only give up after a sustained outage.
      failedPollsRef.current += 1
      const count = failedPollsRef.current

      if (count === 1) {
        addEvents([{
          type: 'log',
          message: `Poll transient error: ${err instanceof Error ? err.message : String(err)} — retrying…`,
        }])
      }

      if (count >= MAX_CONSECUTIVE_POLL_FAILURES) {
        const msg = err instanceof Error ? err.message : 'Polling gave up after repeated errors'
        setError(`${msg} (agent may still be running — check git for commits)`)
        setRunning(false)
        stopPolling()
      }
    }
  }, [addEvents, stopPolling])

  const run = useCallback(async () => {
    stopPolling()
    setRunning(true)
    setDone(false)
    setError(null)
    setEvents([])
    setCommitInfo(null)
    runIdRef.current = null
    lastSeqRef.current = 0
    failedPollsRef.current = 0
    setOpen(true)

    try {
      const res = await fetch('/api/ai/incorporate-feedback', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(body.error ?? 'Request failed')
      }

      const { runId } = await res.json()
      runIdRef.current = runId
      addEvents([{ type: 'log', message: `Run started — id: ${runId}` }])

      // Start polling every 2s
      pollRef.current = setInterval(poll, 2000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start agent'
      setError(msg)
      setRunning(false)
    }
  }, [addEvents, poll, stopPolling])

  // Clean up interval on unmount
  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  const close = () => {
    if (running) return
    setOpen(false)
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={run}
        disabled={running || pendingCount === 0}
        title={pendingCount === 0 ? 'No pending or reviewed feedback to incorporate' : `Incorporate ${pendingCount} feedback item(s) into the codebase`}
        className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-300 disabled:text-neutral-500 disabled:cursor-not-allowed text-white px-4 py-2 text-sm font-semibold shadow-sm transition-colors"
      >
        {running ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {running ? 'Running agent…' : 'Incorporate Feedback'}
      </button>

      {/* Slide-over drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-4 pointer-events-none">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 pointer-events-auto"
            onClick={close}
          />

          {/* Panel */}
          <div className="relative pointer-events-auto w-full max-w-2xl h-[80vh] flex flex-col rounded-2xl bg-neutral-950 border border-neutral-800 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800 shrink-0">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-indigo-400" />
                <span className="text-sm font-semibold text-white">Incorporate Feedback Agent</span>
                {running && (
                  <span className="flex items-center gap-1 text-xs text-indigo-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    running
                  </span>
                )}
                {done && !error && (
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    done
                  </span>
                )}
                {error && (
                  <span className="flex items-center gap-1 text-xs text-red-400">
                    <AlertCircle className="h-3 w-3" />
                    error
                  </span>
                )}
              </div>
              <button
                onClick={close}
                disabled={running}
                className="text-neutral-500 hover:text-neutral-300 disabled:opacity-30 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Log body */}
            <div
              ref={logRef}
              className="flex-1 overflow-y-auto px-5 py-4 font-mono text-xs leading-relaxed space-y-1.5 text-neutral-300"
            >
              {events.length === 0 && running && (
                <div className="text-neutral-600 animate-pulse">Initializing…</div>
              )}
              {events.map((ev, i) => (
                <EventRow key={i} ev={ev} idx={i} />
              ))}
              {running && (
                <div className="flex items-center gap-2 text-neutral-600">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="animate-pulse">agent is thinking…</span>
                </div>
              )}
            </div>

            {/* Footer — commit result */}
            {(commitInfo || error) && (
              <div className={`shrink-0 px-5 py-3 border-t text-sm font-medium flex items-center gap-3 ${
                error
                  ? 'border-red-900 bg-red-950/50 text-red-400'
                  : 'border-emerald-900 bg-emerald-950/50 text-emerald-300'
              }`}>
                {error ? (
                  <>
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </>
                ) : commitInfo ? (
                  <>
                    <GitCommit className="h-4 w-4 shrink-0" />
                    <span>{commitInfo.changes} file(s) committed</span>
                    <a
                      href={commitInfo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto flex items-center gap-1 font-mono text-xs text-emerald-400 hover:underline"
                    >
                      {commitInfo.sha}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <span className="text-emerald-600 text-xs">Railway redeploying…</span>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
