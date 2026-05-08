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

/** Collapse whitespace and clip long strings for description fields. */
function normalize(text: string | null | undefined, max = 120): string | null {
  if (!text) return null
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return null
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** Best-effort accessible name: aria-label, aria-labelledby, or visible label. */
function accessibleName(el: HTMLElement): string | null {
  const ariaLabel = el.getAttribute('aria-label')
  if (ariaLabel) return normalize(ariaLabel, 80)
  const labelledby = el.getAttribute('aria-labelledby')
  if (labelledby) {
    const labels = labelledby
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .filter(Boolean)
      .join(' ')
    if (labels) return normalize(labels, 80)
  }
  if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
    const id = el.id
    if (id) {
      const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`)
      if (label?.textContent) return normalize(label.textContent, 80)
    }
    const wrappingLabel = el.closest('label')
    if (wrappingLabel?.textContent) return normalize(wrappingLabel.textContent, 80)
    const placeholder = (el as HTMLInputElement).placeholder
    if (placeholder) return normalize(placeholder, 80)
  }
  const title = el.getAttribute('title')
  if (title) return normalize(title, 80)
  return null
}

/** Immediate visible text of this element, excluding descendant block text. */
function ownText(el: HTMLElement): string | null {
  const accessible = accessibleName(el)
  if (accessible) return accessible
  // Prefer the element's direct text content trimmed; this is usually what
  // the user sees on the specific element they clicked.
  return normalize(el.textContent, 160)
}

/**
 * Walks ancestors and returns a breadcrumb of human-readable labels:
 * page landmarks (<main>, <header>, <nav>) → <section>/<article> headings →
 * card/container headings → nearest label for the clicked element.
 *
 * Designed so a reviewer can locate the element without opening DevTools.
 */
function buildSectionTrail(el: HTMLElement): string[] {
  const trail: string[] = []
  const seen = new Set<string>()
  const pushUnique = (label: string | null | undefined) => {
    const clean = normalize(label ?? null, 80)
    if (!clean) return
    if (seen.has(clean)) return
    seen.add(clean)
    trail.push(clean)
  }

  const landmarkFor = (node: HTMLElement): string | null => {
    const tag = node.tagName.toLowerCase()
    const role = node.getAttribute('role')
    if (tag === 'main' || role === 'main') return 'Main content'
    if (tag === 'nav' || role === 'navigation') return `Nav${node.getAttribute('aria-label') ? ` · ${node.getAttribute('aria-label')}` : ''}`
    if (tag === 'aside' || role === 'complementary') return 'Sidebar'
    if (tag === 'header' || role === 'banner') return 'Header'
    if (tag === 'footer' || role === 'contentinfo') return 'Footer'
    if (tag === 'dialog' || role === 'dialog' || node.getAttribute('aria-modal') === 'true') return 'Dialog'
    return null
  }

  /** Nearest heading that semantically labels this container. */
  const nearestHeading = (node: HTMLElement): string | null => {
    // Prefer a heading that is a descendant of the same container, appearing
    // before this node in the DOM — that's the "title" of the card/section.
    const headings = node.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')
    for (const h of Array.from(headings)) {
      if (h.textContent?.trim()) return normalize(h.textContent, 80)
    }
    return null
  }

  let current: HTMLElement | null = el
  let depth = 0
  while (current && depth < 24) {
    if (current !== el) {
      // Container-level labels
      const aria = current.getAttribute('aria-label')
      if (aria) pushUnique(aria)
      const labelledby = current.getAttribute('aria-labelledby')
      if (labelledby) {
        const labelText = labelledby
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .filter(Boolean)
          .join(' ')
        pushUnique(labelText)
      }
      const tag = current.tagName.toLowerCase()
      if (tag === 'section' || tag === 'article' || current.getAttribute('role') === 'region') {
        pushUnique(nearestHeading(current))
      }
      pushUnique(landmarkFor(current))
    }
    current = current.parentElement
    depth++
  }

  // Headings reported bottom-up by our walk; reverse so the trail reads
  // from outermost (Page → Section → Card) to innermost.
  return trail.reverse()
}

function extractElementData(el: HTMLElement): ElementPinpointData {
  const tag = el.tagName.toLowerCase()
  const role = el.getAttribute('role')
  const ariaLabel = accessibleName(el)
  const text = ownText(el)
  const pageTitle = typeof document !== 'undefined' ? normalize(document.title, 120) : null
  const pagePath = typeof window !== 'undefined' ? window.location.pathname + window.location.search : null
  const sectionTrail = buildSectionTrail(el)

  // Compose a verbose, reviewer-friendly location trail. Example:
  //   "Page /dashboard "Trust Codex · Overview" › Main content › "Controls
  //    Adjudicated" › chip <a role="link" aria-label="Inherited">
  //    "Inherited 0""
  const descriptorParts: string[] = []
  if (pagePath) descriptorParts.push(`Page ${pagePath}${pageTitle ? ` "${pageTitle}"` : ''}`)
  if (sectionTrail.length) descriptorParts.push(sectionTrail.join(' › '))
  const elementLabel = [
    `<${tag}${role ? ` role="${role}"` : ''}${ariaLabel ? ` aria-label="${ariaLabel}"` : ''}>`,
    text ? `"${text}"` : '',
  ].filter(Boolean).join(' ')
  descriptorParts.push(elementLabel)
  const elementText = descriptorParts.join(' › ')

  return {
    selector: generateSelector(el),
    elementId: el.id || null,
    elementClass:
      el.className && typeof el.className === 'string'
        ? el.className.trim().split(/\s+/)[0] || null
        : null,
    elementText,
    elementType: tag,
    pageTitle,
    pagePath,
    sectionTrail,
    ownText: text,
    ariaLabel,
    role,
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
        const text = ownText(target)
        const trail = buildSectionTrail(target)
        const trailStr = trail.length ? `${trail.slice(-2).join(' › ')} › ` : ''
        const labelPieces = [
          trailStr + `<${tag}>`,
          text ? `"${text}"` : '',
        ].filter(Boolean)
        setTooltip({
          pos: { x: e.clientX + 14, y: e.clientY + 14 },
          label: labelPieces.join(' '),
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
          className="fixed z-[10000] pointer-events-none rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs font-mono text-white shadow-md max-w-md break-words leading-snug"
          style={{ left: tooltip.pos.x, top: tooltip.pos.y }}
        >
          {tooltip.label}
        </div>
      )}
    </>
  )
}
