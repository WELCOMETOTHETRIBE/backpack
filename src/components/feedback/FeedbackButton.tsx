'use client'

import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, Crosshair, X } from 'lucide-react'
import FeedbackModal from './FeedbackModal'
import ElementSelector from './ElementSelector'
import type { ElementPinpointData } from './types'

export interface FeedbackButtonProps {
  visible?: boolean
  apiEndpoint?: string
  className?: string
}

export default function FeedbackButton({
  visible = true,
  apiEndpoint,
  className,
}: FeedbackButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedElement, setSelectedElement] = useState<ElementPinpointData | null>(null)

  // Keyboard shortcut: Shift+F
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'F' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        if (isSelectionMode) {
          setIsSelectionMode(false)
        } else if (isModalOpen) {
          // do nothing
        } else {
          setMenuOpen((prev) => !prev)
        }
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isSelectionMode, isModalOpen])

  const openDirectly = () => {
    setMenuOpen(false)
    setSelectedElement(null)
    setIsModalOpen(true)
  }

  const startSelection = () => {
    setMenuOpen(false)
    setIsSelectionMode(true)
    setSelectedElement(null)
  }

  const handleElementSelected = useCallback((data: ElementPinpointData) => {
    setSelectedElement(data)
    setIsSelectionMode(false)
    setIsModalOpen(true)
  }, [])

  const handleCancelSelection = useCallback(() => {
    setIsSelectionMode(false)
    setSelectedElement(null)
  }, [])

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false)
    setSelectedElement(null)
  }, [])

  if (!visible) return null

  const fabBase =
    'fixed bottom-6 right-6 z-[10000] flex h-12 w-12 items-center justify-center rounded-full shadow-lg ring-1 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2'

  return (
    <>
      {/* FAB */}
      {isSelectionMode ? (
        /* While selecting: show a cancel button */
        <button
          data-feedback-button
          type="button"
          onClick={handleCancelSelection}
          className={`${fabBase} bg-indigo-600 ring-indigo-700/30 hover:bg-indigo-700 animate-pulse text-white ${className ?? ''}`}
          aria-label="Cancel element selection"
          title="Cancel selection (or press ESC)"
        >
          <X className="h-5 w-5" />
        </button>
      ) : (
        <button
          data-feedback-button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          className={`${fabBase} bg-indigo-600 ring-indigo-700/30 hover:bg-indigo-700 text-white ${className ?? ''}`}
          aria-label="Feedback"
          title="Submit feedback (Shift+F)"
        >
          <MessageSquare className="h-5 w-5" />
        </button>
      )}

      {/* Mini menu */}
      {menuOpen && !isSelectionMode && (
        <>
          {/* backdrop */}
          <div
            className="fixed inset-0 z-[9997]"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <div
            data-feedback-button
            className="fixed bottom-20 right-6 z-[9998] w-52 rounded-2xl bg-white shadow-xl ring-1 ring-black/8 overflow-hidden"
          >
            <button
              type="button"
              onClick={openDirectly}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              <MessageSquare className="h-4 w-4 text-indigo-500 shrink-0" />
              <span>Write feedback</span>
            </button>
            <div className="h-px bg-neutral-100 mx-3" />
            <button
              type="button"
              onClick={startSelection}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              <Crosshair className="h-4 w-4 text-indigo-500 shrink-0" />
              <span>Pinpoint an element</span>
            </button>
            <div className="px-4 pb-2.5 pt-1">
              <p className="text-[10px] text-neutral-400">Shift+F to toggle</p>
            </div>
          </div>
        </>
      )}

      <ElementSelector
        isActive={isSelectionMode}
        onElementSelected={handleElementSelected}
        onCancel={handleCancelSelection}
      />

      <FeedbackModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        selectedElement={selectedElement}
        apiEndpoint={apiEndpoint}
      />
    </>
  )
}
