'use client'

import { useTheme } from '@/context/ThemeContext'

interface SparkleIconProps {
  size?: number
  className?: string
}

export default function SparkleIcon({ size = 32, className = '' }: SparkleIconProps) {
  const { theme } = useTheme()
  const color = theme.color
  const gradId = `sg-${size}`
  const glowId = `gg-${size}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="SPARKLE"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="45%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="1" />
        </linearGradient>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d="M50 2
           C54 30 70 46 98 50
           C70 54 54 70 50 98
           C46 70 30 54 2 50
           C30 46 46 30 50 2Z"
        fill={`url(#${gradId})`}
        filter={`url(#${glowId})`}
      />
    </svg>
  )
}