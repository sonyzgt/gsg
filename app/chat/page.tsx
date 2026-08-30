'use client'

export const dynamic = 'force-dynamic'

import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import AiChatWidget from '@/components/chat/AiChatWidget'
import SparkleIcon from '@/components/ui/SparkleIcon'
import { useTheme } from '@/context/ThemeContext'

export default function ChatPage() {
  const { theme } = useTheme()

  return (
    <div className="flex flex-col min-h-screen bg-transparent text-zinc-100 animate-fadeIn font-mono">
      {/* Navigation */}
      <Navbar />

      {/* Main Terminal Container */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-6 py-6 sm:py-10 flex flex-col gap-6">
        {/* Terminal Title Banner */}
        <div
          style={{
            boxShadow: `4px 4px 0px 0px ${theme.color}`,
          }}
          className="bg-[#0e1115] border-2 border-white rounded-xl p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 select-none"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-black border-2 border-white rounded-lg shadow-[2px_2px_0px_0px_#000000] flex-shrink-0">
              <SparkleIcon size={32} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-xl font-black uppercase text-white tracking-tight">
                  AI DEFI TRADING TERMINAL
                </h1>
                <span className="text-[10px] font-black bg-[var(--theme-color)] text-black px-2 py-0.5 border border-black shadow-[1px_1px_0px_0px_#000000]">
                  LIVE AGENT
                </span>
              </div>
              <p className="text-xs text-zinc-400 font-sans mt-0.5">
                Chat with AI to execute buy orders, sell full balances (swap all), check wallet holdings, and deploy tokens directly on Robinhood Chain.
              </p>
            </div>
          </div>

          {/* Quick Examples Pills */}
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            <span className="text-zinc-500 font-bold">// COMMANDS:</span>
            <span className="bg-black text-theme-light border border-zinc-700 px-2 py-1 rounded">
              buy 10$ 0x...
            </span>
            <span className="bg-black text-rose-400 border border-zinc-700 px-2 py-1 rounded">
              swap all 0x...
            </span>
          </div>
        </div>

        {/* AI Chat Widget */}
        <div className="w-full flex-1 flex flex-col">
          <AiChatWidget fullScreen={true} />
        </div>
      </main>

      <Footer />
    </div>
  )
}
