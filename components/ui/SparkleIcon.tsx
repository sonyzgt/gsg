'use client'

import { useTheme } from '@/context/ThemeContext'

interface SparkleIconProps {
  size?: number
  className?: string
  accentColor?: string
}

export default function SparkleIcon({ size = 40, className = '', accentColor }: SparkleIconProps) {
  const { theme } = useTheme()
  const screenColor = accentColor || theme?.color || 'var(--theme-color)'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Top face */}
      <polygon
        points="28,38 61,20 100,41 66,60"
        fill="#2a2e36"
      />

      {/* Left side face */}
      <polygon
        points="28,38 66,60 66,101 28,79"
        fill="#16191f"
      />

      {/* Right side / screen bezel */}
      <polygon
        points="66,60 100,41 100,82 66,101"
        fill="#1e222a"
      />

      {/* Screen - Dynamically reacts to active theme color */}
      <polygon
        points="70,62 94,48 94,76 70,89"
        fill={screenColor}
      />

      {/* Screen detail */}
      <polygon
        points="75,66 89,58 89,70 75,78"
        fill="#0b0d11"
      />
    </svg>
  )
}