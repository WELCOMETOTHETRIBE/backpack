/** Captured metadata for the clicked DOM element (sent with feedback). */
export interface ElementPinpointData {
  selector: string
  elementId: string | null
  elementClass: string | null
  elementText: string | null
  elementType: string | null
}

export type FeedbackCategory = 'bug' | 'ux' | 'feature' | 'general'
