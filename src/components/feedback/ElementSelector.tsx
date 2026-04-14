'use client'

import { useEffect, useRef, useState } from 'react'
import type { ElementPinpointData } from './types'

export interface ElementSelectorProps {
  isActive: boolean
  onElementSelected: (elementData: ElementPinpointData) => void
  onCancel: () => void
}

/** Prefer data-testid → aria-label → id → first class → path */
function generatePathSelector(el: HTMLElement): string {
  const path: string[] = []
  let current: HTMLElement | null = el

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.nodeName.toLowerCase()

    if (current.id) {
      selector += `#${current.id}`
      path.unshift(selector)
      break
    }

    if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).filter(Boolean)
      if (classes.length > 0) {
        selector += `.${classes[0].replace(/[.#:[\]]/g, '\\$&')}`
      }
    }

    const parent = current.parentElement
    if (parent) {
      const siblings = Array.from(parent.children)
      const idx = siblings.indexOf(current) + 1
      if (siblings.length > 1) selector += `:nth-child(${idx})`
    }

    path.unshift(selector)
    current = current.parentElement
  }

  return path.join(' > ')
}

function generateSelector(el: HTMLElement): string {
  const testId = el.getAttribute('data-testid')
  if (testId) return `[data-testid="${testId}"]`

  const ariaLabel = el.getAttribute('aria-label')
  if (ariaLabel) return `[aria-label="${ariaLabel}"]`

  if (el.id) return `#${el.id}`

  if (el.className && typeof el.className === 'string') {
    const classes = el.className.trim().split(/\s+/).filter(Boolean)
    if (classes.length > 0) return `.${classes[0].replace(/[.#:[\]]/g, '\\$&')}`
  }

  return generatePathSelector(el)
}

function extractElementData(el: HTMLElement): ElementPinpointData {
  return {
    selector: generateSelector(el),
    elementId: el.id || null,
    elementClass:
      el.className && typeof el.className === 'string'
        ? el.className.trim().split(/\s+/)[0] || null
        : null,
    elementText: el.textContent?.trim().substring(0, 100) || null,
    elementType: el.tagName.toLowerCase(),
  }
}

interface TooltipPos { x: number; y: number }

export default function ElementSelector({ isActive, onElementSelected, onCancel }: ElementSelectorProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const highlightedRef = useRef<HTMLElement | null>(null)
  const [tooltip, setTooltip] = useState<{ pos: TooltipPos; label: string } | null>(null)

  const removeHighlight = (el: HTMLElement | null) => {
    if (!el) return
    el.style.outline = ''
    el.style.outlineOffset = ''
    el.style.backgroundColor = ''
    el.style.cursor = ''
  }

  const addHighlight = (el: HTMLElement, selected = false) => {
    el.style.outline = selected ? '3px solid rgb(34,197,94)' : '2px solid rgb(99,102,241)'
    el.style.outlineOffset = '2px'
    el.style.backgroundColor = selected ? 'rgba(34,197,94,0.08)' : 'rgba(99,102,241,0.08)'
    el.style.cursor = 'pointer'
  }

  useEffect(() => {
    if (!isActive) {
      removeHighlight(highlightedRef.current)
      highlightedRef.current = null
      setTooltip(null)
      return
    }

    const isFeedbackOwned = (el: HTMLElement) =>
      !!el.closest('[data-feedback-button]') ||
      !!el.closest('[data-feedback-modal]') ||
      !!el.closest('[data-feedback-instruction]')

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target || target === overlayRef.current || isFeedbackOwned(target)) {
        removeHighlight(highlightedRef.current)
        highlightedRef.current = null
        setTooltip(null)
        return
      }

      if (highlightedRef.current && highlightedRef.current !== target) {
        removeHighlight(highlightedRef.current)
      }

      if (target !== highlightedRef.current) {
        addHighlight(target)
        highlightedRef.current = target
        const tag = target.tagName.toLowerCase()
        const text = target.textContent?.trim().substring(0, 30) || ''
        setTooltip({
          pos: { x: e.clientX + 14, y: e.clientY + 14 },
          label: text ? `<${tag}> "${text}"` : `<${tag}>`,
        })
      } else {
        setTooltip((prev) =>
          prev ? { ...prev, pos: { x: e.clientX + 14, y: e.clientY + 14 } } : null
        )
      }
    }

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target || target === overlayRef.current || isFeedbackOwned(target)) return

      e.preventDefault()
      e.stopPropagation()

      addHighlight(target, true)
      const data = extractElementData(target)
      onElementSelected(data)

      setTimeout(() => {
        removeHighlight(target)
        highlightedRef.current = null
      }, 300)
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        removeHighlight(highlightedRef.current)
        highlightedRef.current = null
        setTooltip(null)
        onCancel()
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('click', handleClick, true)
    document.addEventListener('keydown', handleEscape)
    document.body.style.cursor = 'crosshair'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('keydown', handleEscape)
      document.body.style.cursor = ''
      removeHighlight(highlightedRef.current)
      highlightedRef.current = null
    }
  }, [isActive, onElementSelected, onCancel])

  if (!isActive) return null

  return (
    <>
      {/* Dim overlay — pointer-events-none so clicks reach the real elements */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-[9998] bg-black/20 pointer-events-none"
        style={{ cursor: 'crosshair' }}
      />

      {/* Instruction banner */}
      <div
        data-feedback-instruction
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 rounded-xl bg-white px-5 py-2.5 shadow-lg border border-indigo-200 pointer-events-auto"
      >
        <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
        <p className="text-sm font-medium text-neutral-800">
          Click any element to attach it to your feedback
        </p>
        <button
          onClick={onCancel}
          className="ml-2 rounded-md px-2.5 py-1 text-xs font-semibold text-neutral-500 hover:bg-neutral-100 transition-colors"
        >
          ESC to cancel
        </button>
      </div>

      {/* Hover tooltip */}
      {tooltip && (
        <div
          className="fixed z-[10000] pointer-events-none rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-mono text-white shadow-md max-w-xs truncate"
          style={{ left: tooltip.pos.x, top: tooltip.pos.y }}
        >
          {tooltip.label}
        </div>
      )}
    </>
  )
}
