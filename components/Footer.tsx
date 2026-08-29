'use client'

import { useTheme } from '@/context/ThemeContext'
import SparkleIcon from '@/components/ui/SparkleIcon'

export default function Footer() {
  const { theme } = useTheme()

  return (
    <footer className="w-full border-t-2 border-zinc-800 bg-[#08090a] mt-auto select-none font-mono">
      <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 text-xs">
        {/* Left: Copyright & Network */}
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 sm:gap-3 text-zinc-400">
          <div className="flex items-center gap-2.5">
            <SparkleIcon size={24} className="flex-shrink-0" />
            <span className="font-black text-zinc-200">
              PONSCORE // 2026
            </span>
          </div>
          <span className="hidden sm:inline text-zinc-700">|</span>
          <div className="flex items-center gap-1.5 text-zinc-400">
            <span
              className="w-2 h-2 rounded-none"
              style={{ backgroundColor: theme.color }}
            />
            <span className="text-[11px] font-bold">ROBINHOOD CHAIN [ID: 4663]</span>
          </div>
        </div>

        {/* Right: Social & Community Links */}
        <div className="flex items-center gap-3 text-zinc-400">
          <a
            href="https://x.com/ponscore"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-zinc-200 hover:text-black hover:bg-white px-2.5 py-1 rounded bg-[#121519] border border-zinc-700 hover:border-white shadow-[2px_2px_0px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all font-bold text-xs"
          >
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <span>@ponscore</span>
          </a>
        </div>
      </div>
    </footer>
  )
}
