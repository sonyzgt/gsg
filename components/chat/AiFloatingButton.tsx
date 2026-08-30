'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import SparkleIcon from '@/components/ui/SparkleIcon'
import AiChatWidget from './AiChatWidget'
import { useTheme } from '@/context/ThemeContext'

export default function AiFloatingButton() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const { theme } = useTheme()

  // Hide floating button if already on the dedicated /chat page
  if (pathname === '/chat') {
    return null
  }

  return (
    <>
      {/* Floating Trigger Button */}
      <div className="fixed bottom-5 right-5 z-40 select-none font-mono">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          style={{
            boxShadow: `4px 4px 0px 0px ${theme.color}`,
          }}
          className="flex items-center gap-2 bg-[#0c0f13] hover:bg-black text-white border-2 border-white px-3.5 py-2.5 rounded-xl transition-all cursor-pointer group active:translate-x-0.5 active:translate-y-0.5"
          title="Open AI Trading Assistant"
        >
          <div className="relative">
            <SparkleIcon size={22} className="group-hover:rotate-12 transition-transform" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-black animate-pulse" />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-white">
            AI AGENT
          </span>
        </button>
      </div>

      {/* Floating Modal / Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-fadeIn font-mono">
          <div
            className="fixed inset-0"
            onClick={() => setIsOpen(false)}
          />
          <div className="relative z-10 w-full max-w-xl">
            <AiChatWidget onClose={() => setIsOpen(false)} />
          </div>
        </div>
      )}
    </>
  )
}
