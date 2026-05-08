'use client'

import dynamic from 'next/dynamic'

// Lazy-load so it never blocks SSR / initial paint
const FeedbackButton = dynamic(() => import('./FeedbackButton'), { ssr: false })

export default function FeedbackWidget() {
  return <FeedbackButton visible />
}
