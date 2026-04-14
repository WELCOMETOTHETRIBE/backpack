import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { feedback, users } from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import type { SessionUser } from '@/lib/auth'
import { MessageSquare, Bug, Sparkles, Paintbrush, Target, ExternalLink, Clock, CheckCircle2, Eye } from 'lucide-react'
import FeedbackStatusButtons from './FeedbackStatusButtons'

export const metadata = { title: 'Feedback — Trust Codex' }

const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode; bg: string; text: string }> = {
  bug:     { label: 'Bug',     icon: <Bug className="h-3 w-3" />,         bg: 'bg-red-100',    text: 'text-red-700' },
  ux:      { label: 'UX',      icon: <Paintbrush className="h-3 w-3" />,   bg: 'bg-amber-100',  text: 'text-amber-700' },
  feature: { label: 'Feature', icon: <Sparkles className="h-3 w-3" />,     bg: 'bg-violet-100', text: 'text-violet-700' },
  general: { label: 'General', icon: <MessageSquare className="h-3 w-3" />, bg: 'bg-neutral-100',text: 'text-neutral-600' },
}

const STATUS_META: Record<string, { label: string; icon: React.ReactNode; ring: string }> = {
  pending:  { label: 'Pending',  icon: <Clock className="h-3 w-3" />,        ring: 'ring-amber-300 text-amber-700 bg-amber-50' },
  reviewed: { label: 'Reviewed', icon: <Eye className="h-3 w-3" />,          ring: 'ring-blue-300  text-blue-700  bg-blue-50' },
  resolved: { label: 'Resolved', icon: <CheckCircle2 className="h-3 w-3" />, ring: 'ring-emerald-300 text-emerald-700 bg-emerald-50' },
}

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id || !user?.organizationId) redirect('/auth/signin')
  if (!['Admin', 'Compliance'].includes(user.role ?? '')) redirect('/dashboard')

  const { status: filterStatus } = await searchParams

  const conditions = [eq(feedback.organizationId, user.organizationId!)]
  if (filterStatus && ['pending', 'reviewed', 'resolved'].includes(filterStatus)) {
    conditions.push(eq(feedback.status, filterStatus as 'pending' | 'reviewed' | 'resolved'))
  }

  const rows = await db
    .select({
      id: feedback.id,
      content: feedback.content,
      category: feedback.category,
      status: feedback.status,
      pageUrl: feedback.pageUrl,
      elementSelector: feedback.elementSelector,
      elementText: feedback.elementText,
      elementType: feedback.elementType,
      createdAt: feedback.createdAt,
      submittedBy: users.name,
      submittedByEmail: users.email,
    })
    .from(feedback)
    .leftJoin(users, eq(feedback.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(feedback.createdAt))
    .limit(200)

  // Counts for tab pills
  const allRows = await db
    .select({ status: feedback.status })
    .from(feedback)
    .where(eq(feedback.organizationId, user.organizationId!))

  const counts = allRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, {})
  const totalCount = allRows.length

  const tabs = [
    { key: '', label: 'All', count: totalCount },
    { key: 'pending',  label: 'Pending',  count: counts['pending']  ?? 0 },
    { key: 'reviewed', label: 'Reviewed', count: counts['reviewed'] ?? 0 },
    { key: 'resolved', label: 'Resolved', count: counts['resolved'] ?? 0 },
  ]

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Feedback</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            User-submitted feedback with element pinpoints across Trust Codex
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-2">
          <MessageSquare className="h-4 w-4 text-indigo-500" />
          <span className="text-sm font-semibold text-indigo-700">{counts['pending'] ?? 0} pending</span>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 border-b border-neutral-200">
        {tabs.map((tab) => {
          const active = (filterStatus ?? '') === tab.key
          return (
            <a
              key={tab.key}
              href={tab.key ? `/dashboard/feedback?status=${tab.key}` : '/dashboard/feedback'}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                  active ? 'bg-indigo-100 text-indigo-700' : 'bg-neutral-100 text-neutral-500'
                }`}>
                  {tab.count}
                </span>
              )}
            </a>
          )
        })}
      </div>

      {/* Feedback list */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 mb-3">
            <MessageSquare className="h-5 w-5 text-neutral-400" />
          </div>
          <p className="text-sm font-medium text-neutral-500">No feedback yet</p>
          <p className="text-xs text-neutral-400 mt-1">
            Users can submit feedback via the floating button (Shift+F)
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const cat = CATEGORY_META[row.category] ?? CATEGORY_META.general
            const st = STATUS_META[row.status] ?? STATUS_META.pending
            const date = new Date(row.createdAt).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
            })

            return (
              <div
                key={row.id}
                className="rounded-2xl bg-white border border-neutral-100 shadow-sm p-5 space-y-3 hover:shadow-md transition-shadow"
              >
                {/* Top row: badges + date + author */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cat.bg} ${cat.text}`}>
                      {cat.icon}
                      {cat.label}
                    </span>
                    <span className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${st.ring}`}>
                      {st.icon}
                      {st.label}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-neutral-400">{date}</p>
                    {row.submittedBy && (
                      <p className="text-xs text-neutral-500 font-medium">{row.submittedBy}</p>
                    )}
                  </div>
                </div>

                {/* Content */}
                <p className="text-sm text-neutral-800 leading-relaxed whitespace-pre-wrap">{row.content}</p>

                {/* Element pinpoint */}
                {row.elementSelector && (
                  <div className="flex items-start gap-2 rounded-xl bg-indigo-50 border border-indigo-100 px-3 py-2">
                    <Target className="h-3.5 w-3.5 shrink-0 mt-0.5 text-indigo-400" />
                    <div className="min-w-0 text-xs text-indigo-700 space-y-0.5">
                      {row.elementType && (
                        <span className="font-mono mr-2">&lt;{row.elementType}&gt;</span>
                      )}
                      {row.elementText && (
                        <span className="text-indigo-600">
                          "{row.elementText.length > 60 ? row.elementText.substring(0, 60) + '…' : row.elementText}"
                        </span>
                      )}
                      <p className="font-mono text-[10px] text-indigo-400 break-all">{row.elementSelector}</p>
                    </div>
                  </div>
                )}

                {/* Page URL */}
                {row.pageUrl && (
                  <a
                    href={row.pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-indigo-600 transition-colors truncate"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="truncate">{row.pageUrl}</span>
                  </a>
                )}

                {/* Status actions */}
                <FeedbackStatusButtons id={row.id} currentStatus={row.status} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
