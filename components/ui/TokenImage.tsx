'use client'

import { useState, useEffect, useMemo } from 'react'
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
  'https://dweb.link/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
]

function extractIpfsCid(url: string): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (trimmed.startsWith('ipfs://')) {
    return trimmed.replace('ipfs://', '').split('/')[0]
  }
  if (trimmed.includes('/ipfs/')) {
    const parts = trimmed.split('/ipfs/')
    const after = parts[parts.length - 1]
    return after.split('/')[0].split('?')[0]
  }
  return null
}

export default function TokenImage({
  src,
  alt = 'Token Logo',
  size = 32,
  className = 'w-full h-full object-cover',
  sparkleSize,
}: TokenImageProps) {
  const [gatewayIndex, setGatewayIndex] = useState(0)
  const [hasError, setHasError] = useState(false)

  // Reset error when src changes
  useEffect(() => {
    setHasError(false)
    setGatewayIndex(0)
  }, [src])

  const ipfsCid = useMemo(() => (src ? extractIpfsCid(src) : null), [src])

  // Normalize image source
  const cleanSrc = useMemo(() => {
    if (!src || hasError) return null
    const trimmed = src.trim()
    if (!trimmed || trimmed === '/logo.svg' || trimmed === 'null' || trimmed === 'undefined') return null

    // Base64 data URL
    if (trimmed.startsWith('data:image/')) {
      return trimmed
    }

    // IPFS CID resolution across multiple gateways
    if (ipfsCid) {
      const gateway = IPFS_GATEWAYS[gatewayIndex] || IPFS_GATEWAYS[0]
      return `${gateway}${ipfsCid}`
    }

    // If it points to an /uploads/ path on any host/port, normalize to relative /uploads/
    if (trimmed.includes('/uploads/')) {
      const parts = trimmed.split('/uploads/')
      return `/uploads/${parts[parts.length - 1]}`
    }

    return trimmed
  }, [src, hasError, ipfsCid, gatewayIndex])

  function handleError() {
    if (ipfsCid && gatewayIndex < IPFS_GATEWAYS.length - 1) {
      // Automatically cycle through next available IPFS gateway
      setGatewayIndex((prev) => prev + 1)
    } else {
      setHasError(true)
    }
  }

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
      onError={handleError}
      loading="lazy"
    />
  )
}
