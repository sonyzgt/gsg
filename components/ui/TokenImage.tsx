'use client'

import { useState } from 'react'
import SparkleIcon from '@/components/ui/SparkleIcon'

interface TokenImageProps {
  src?: string | null
  alt?: string
  size?: number
  className?: string
  sparkleSize?: number
}

export default function TokenImage({
  src,
  alt = 'Token Logo',
  size = 32,
  className = 'w-full h-full object-cover',
  sparkleSize,
}: TokenImageProps) {
  const [hasError, setHasError] = useState(false)

  // Normalize image source
  const cleanSrc = (() => {
    if (!src || hasError) return null
    const trimmed = src.trim()
    if (!trimmed || trimmed === '/logo.svg' || trimmed === 'null' || trimmed === 'undefined') return null

    // If it points to an /uploads/ path on any host/port, normalize to relative /uploads/
    if (trimmed.includes('/uploads/')) {
      const parts = trimmed.split('/uploads/')
      return `/uploads/${parts[parts.length - 1]}`
    }

    return trimmed
  })()

  if (!cleanSrc) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black/40">
        <SparkleIcon size={sparkleSize || size || 24} />
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cleanSrc}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
      loading="lazy"
    />
  )
}
