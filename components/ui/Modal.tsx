'use client'

import { useEffect, ReactNode } from 'react'
import { useTheme } from '@/context/ThemeContext'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export default function Modal({ open, onClose, title, children }: ModalProps) {
  const { theme } = useTheme()

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-xl transition-opacity"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="relative w-full max-w-md max-h-[92vh] flex flex-col rounded-3xl liquid-glass shadow-[0_30px_80px_rgba(0,0,0,0.95)] p-5 sm:p-6 overflow-hidden animate-fadeIn">
        {/* Specular accent top line */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] flex-shrink-0 transition-all duration-500"
          style={{ background: `linear-gradient(to right, transparent, ${theme.color}, transparent)` }}
        />
        
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-white drop-shadow-sm">{title}</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors p-1.5 rounded-xl liquid-pill cursor-pointer"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {children}
        </div>
      </div>
    </div>
  )
}
