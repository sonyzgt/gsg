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

const IPFS_GATEWAYS = [
  '/api/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
]

export default function TokenImage({
  src,
  alt = 'Token Logo',
  size = 32,
  className = 'w-full h-full object-cover',
  sparkleSize,
}: TokenImageProps) {
  const [gatewayIndex, setGatewayIndex] = useState(0)
  const [hasError, setHasError] = useState(false)

  // Normalize image source
  const cleanSrc = (() => {
    if (!src || hasError) return null
    const trimmed = src.trim()
    if (!trimmed || trimmed === '/logo.svg' || trimmed === 'null' || trimmed === 'undefined') return null

    // IPFS URI resolution (e.g. ipfs://Qm... or ipfs://bafy...)
    if (trimmed.startsWith('ipfs://')) {
      const cid = trimmed.replace('ipfs://', '')
      const gateway = IPFS_GATEWAYS[gatewayIndex] || IPFS_GATEWAYS[0]
      return `${gateway}${cid}`
    }

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

  function handleError() {
    if (src && src.trim().startsWith('ipfs://') && gatewayIndex < IPFS_GATEWAYS.length - 1) {
      // Try next IPFS gateway before giving up
      setGatewayIndex((prev) => prev + 1)
    } else {
      setHasError(true)
    }
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cleanSrc}
      alt={alt}
      className={className}
      onError={handleError}
      loading="lazy"
    />
  )
}
