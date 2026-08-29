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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-16 md:pt-20 p-3 sm:p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      {/* Brutalist Modal Panel */}
      <div
        style={{
          boxShadow: `6px 6px 0px 0px ${theme.color}`,
        }}
        className="relative w-full max-w-md max-h-[85vh] flex flex-col rounded-xl bg-[#0e1115] border-2 border-white p-5 sm:p-6 overflow-hidden animate-fadeIn select-none"
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b-2 border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-none border border-black shadow-[1px_1px_0px_0px_#ffffff]"
              style={{ backgroundColor: theme.color }}
            />
            <h2 className="text-sm sm:text-base font-black font-mono tracking-tight uppercase text-white">
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-md border border-zinc-700 bg-zinc-900 hover:border-white transition-all cursor-pointer shadow-[2px_2px_0px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
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
