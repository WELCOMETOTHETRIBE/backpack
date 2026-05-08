'use client'

import { useState, useTransition } from 'react'
import { Eye, CheckCircle2, RotateCcw } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function FeedbackStatusButtons({
  id,
  currentStatus,
}: {
  id: string
  currentStatus: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const updateStatus = (status: string) => {
    setError(null)
    startTransition(async () => {
      const res = await fetch(`/api/feedback?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        setError('Failed to update status')
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2 pt-1">
      {currentStatus !== 'reviewed' && currentStatus !== 'resolved' && (
        <button
          onClick={() => updateStatus('reviewed')}
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors disabled:opacity-50"
        >
          <Eye className="h-3 w-3" />
          Mark reviewed
        </button>
      )}
      {currentStatus !== 'resolved' && (
        <button
          onClick={() => updateStatus('resolved')}
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-50"
        >
          <CheckCircle2 className="h-3 w-3" />
          Resolve
        </button>
      )}
      {currentStatus === 'resolved' && (
        <button
          onClick={() => updateStatus('pending')}
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-neutral-600 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 transition-colors disabled:opacity-50"
        >
          <RotateCcw className="h-3 w-3" />
          Reopen
        </button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
