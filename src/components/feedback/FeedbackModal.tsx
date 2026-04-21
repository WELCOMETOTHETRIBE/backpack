'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Bug, Sparkles, Paintbrush, MessageSquare, Target, CheckCircle2 } from 'lucide-react'
import type { ElementPinpointData, FeedbackCategory } from './types'

export interface FeedbackModalProps {
  isOpen: boolean
  onClose: () => void
  selectedElement?: ElementPinpointData | null
  apiEndpoint?: string
  onSuccess?: () => void
}

const CATEGORIES: { value: FeedbackCategory; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'bug',     label: 'Bug',     icon: <Bug className="h-3.5 w-3.5" />,        color: 'border-red-300    bg-red-50    text-red-700    data-[selected]:bg-red-600    data-[selected]:text-white data-[selected]:border-red-600' },
  { value: 'ux',      label: 'UX',      icon: <Paintbrush className="h-3.5 w-3.5" />,  color: 'border-amber-300  bg-amber-50  text-amber-700  data-[selected]:bg-amber-500  data-[selected]:text-white data-[selected]:border-amber-500' },
  { value: 'feature', label: 'Feature', icon: <Sparkles className="h-3.5 w-3.5" />,    color: 'border-violet-300 bg-violet-50 text-violet-700 data-[selected]:bg-violet-600 data-[selected]:text-white data-[selected]:border-violet-600' },
  { value: 'general', label: 'General', icon: <MessageSquare className="h-3.5 w-3.5" />, color: 'border-neutral-300 bg-neutral-50 text-neutral-700 data-[selected]:bg-neutral-700 data-[selected]:text-white data-[selected]:border-neutral-700' },
]

export default function FeedbackModal({
  isOpen,
  onClose,
  selectedElement = null,
  apiEndpoint = '/api/feedback',
  onSuccess,
}: FeedbackModalProps) {
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<FeedbackCategory>('general')
  const [elementData, setElementData] = useState<ElementPinpointData | null>(selectedElement)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const pageUrl = typeof window !== 'undefined' ? window.location.href : undefined

  useEffect(() => { if (selectedElement) setElementData(selectedElement) }, [selectedElement])

  useEffect(() => {
    if (isOpen) setTimeout(() => textareaRef.current?.focus(), 50)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      setContent('')
      setCategory('general')
      setError(null)
      setSuccess(false)
      setElementData(null)
    }
  }, [isOpen])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, isSubmitting, onClose])

  const handleSubmit = async () => {
    if (!content.trim()) { setError('Please enter your feedback'); return }
    if (content.trim().length > 5000) { setError('Feedback must be under 5000 characters'); return }

    setIsSubmitting(true)
    setError(null)

    try {
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content.trim(),
          category,
          pageUrl,
          elementSelector: elementData?.selector,
          elementId: elementData?.elementId,
          elementClass: elementData?.elementClass,
          elementText: elementData?.elementText,
          elementType: elementData?.elementType,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit feedback')

      setSuccess(true)
      onSuccess?.()
      setTimeout(onClose, 1800)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        data-feedback-modal
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl ring-1 ring-black/5 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-neutral-100">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50">
              <MessageSquare className="h-4 w-4 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-900 leading-tight">Submit Feedback</h2>
              <p className="text-xs text-neutral-400">Your input helps improve Trust Codex</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {success ? (
          /* Success state */
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 mb-4">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold text-neutral-900 mb-1">Thanks for the feedback!</h3>
            <p className="text-sm text-neutral-500">It has been logged and will be reviewed shortly.</p>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">
            {/* Category pills */}
            <div>
              <p className="text-xs font-medium text-neutral-500 mb-2 uppercase tracking-wide">Category</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    data-selected={category === cat.value ? '' : undefined}
                    onClick={() => setCategory(cat.value)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${cat.color}`}
                  >
                    {cat.icon}
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Pinned element chip */}
            {elementData && (
              <div className="flex items-start gap-3 rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-2.5">
                <Target className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-xs font-semibold text-indigo-800">Pinned element</p>

                  {/* Page + breadcrumb */}
                  {(elementData.pagePath || elementData.pageTitle) && (
                    <p className="text-[11px] text-indigo-700">
                      <span className="font-medium">Page:</span>{' '}
                      {elementData.pageTitle ? (
                        <span>
                          <span className="font-mono">{elementData.pagePath}</span>
                          <span className="text-indigo-500"> — {elementData.pageTitle}</span>
                        </span>
                      ) : (
                        <span className="font-mono">{elementData.pagePath}</span>
                      )}
                    </p>
                  )}
                  {elementData.sectionTrail && elementData.sectionTrail.length > 0 && (
                    <p className="text-[11px] text-indigo-700">
                      <span className="font-medium">Section:</span>{' '}
                      {elementData.sectionTrail.join(' › ')}
                    </p>
                  )}

                  {/* Element tag + accessible name + own text */}
                  <div className="text-[11px] text-indigo-700">
                    <span className="font-medium">Element:</span>{' '}
                    {elementData.elementType && (
                      <span className="mr-1 font-mono">
                        &lt;{elementData.elementType}
                        {elementData.role ? ` role="${elementData.role}"` : ''}
                        {elementData.ariaLabel ? ` aria-label="${elementData.ariaLabel}"` : ''}
                        &gt;
                      </span>
                    )}
                    {elementData.ownText && (
                      <span className="text-indigo-600">
                        "{elementData.ownText.length > 80
                          ? elementData.ownText.substring(0, 80) + '…'
                          : elementData.ownText}"
                      </span>
                    )}
                  </div>

                  {/* Raw selector — mechanical debug aid */}
                  <p className="font-mono text-indigo-500 break-all text-[10px]">{elementData.selector}</p>
                </div>
                <button
                  onClick={() => setElementData(null)}
                  className="shrink-0 text-indigo-400 hover:text-indigo-700 transition-colors"
                  type="button"
                  aria-label="Remove pinned element"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Textarea */}
            <div>
              <label htmlFor="feedback-content" className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2 block">
                Your feedback
              </label>
              <textarea
                id="feedback-content"
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe what you noticed, what you expected, or what you'd like to see…"
                className="w-full rounded-xl border border-neutral-200 px-3.5 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-shadow"
                rows={5}
                disabled={isSubmitting}
                maxLength={5000}
              />
              <div className="flex justify-between text-[11px] text-neutral-400 mt-1 px-0.5">
                <span>{content.length} / 5000</span>
                <span>⌘↵ to submit</span>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 bg-neutral-100 hover:bg-neutral-200 disabled:opacity-40 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !content.trim()}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? 'Sending…' : 'Send Feedback'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
