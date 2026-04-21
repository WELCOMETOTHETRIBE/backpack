/** Captured metadata for the clicked DOM element (sent with feedback). */
export interface ElementPinpointData {
  selector: string
  elementId: string | null
  elementClass: string | null
  /**
   * Human-readable location trail for the selected element. Encodes enough
   * context — page path, page title, ancestor section headings/landmarks,
   * the element's own role/accessible name and visible text — that a
   * reviewer can unambiguously locate the element without clicking.
   */
  elementText: string | null
  elementType: string | null
  /** Structured pieces that compose elementText, for richer UI rendering. */
  pageTitle?: string | null
  pagePath?: string | null
  sectionTrail?: string[]
  ownText?: string | null
  ariaLabel?: string | null
  role?: string | null
}

export type FeedbackCategory = 'bug' | 'ux' | 'feature' | 'general'
