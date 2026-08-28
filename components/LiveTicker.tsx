'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import type { PonsV2TokenInfo } from '@/lib/pons-v2'
import { useTheme } from '@/context/ThemeContext'
import TokenImage from '@/components/ui/TokenImage'

export interface TickerLaunchEvent {
  tokenAddress: string
  symbol: string
  name: string
  logo?: string
  creator: string
}

export default function LiveTicker() {
  const { theme } = useTheme()
  const [tokens, setTokens] = useState<TickerLaunchEvent[]>([])

  useEffect(() => {
    // Clear any old ticker local storage cache from previous versions
    try {
      localStorage.removeItem('sparkle_live_ticker_events_v4')
      localStorage.removeItem('sparkle_live_ticker_events_v3')
      localStorage.removeItem('sparkle_live_ticker_events')
    } catch { /* ignore */ }

    async function fetchLaunchedTokens() {
      try {
        const res = await fetch('/api/launchpad/tokens')
        if (!res.ok) return
        const data = await res.json()
        if (data.tokens && Array.isArray(data.tokens)) {
          const list: TickerLaunchEvent[] = data.tokens.map((t: PonsV2TokenInfo) => ({
            tokenAddress: t.tokenAddress,
            symbol: t.symbol,
            name: t.name,
            logo: t.logo,
            creator: t.creatorAddress,
          }))
          setTokens(list)
        }
      } catch (err) {
        console.error('Failed to load ticker tokens:', err)
      }
    }

    fetchLaunchedTokens()
    const interval = setInterval(fetchLaunchedTokens, 4000)
    return () => clearInterval(interval)
  }, [])

  if (tokens.length === 0) return null

  return (
    <div className="w-full bg-[#030604]/85 backdrop-blur-xl border-b border-white/[0.08] overflow-hidden py-1.5 px-2.5 sm:px-6 select-none">
      <div className="flex items-center justify-start gap-2 sm:gap-2.5 w-full overflow-x-auto no-scrollbar">
        {tokens.map((tok) => {
          return (
            <Link
              key={tok.tokenAddress}
              href={`/token/${tok.tokenAddress}`}
              style={{
                borderColor: `${theme.primary}40`,
                boxShadow: `0 2px 10px ${theme.glow}`,
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-black/50 backdrop-blur-xl transition-all hover:scale-105 hover:brightness-110 flex-shrink-0 cursor-pointer shadow-lg select-none group"
            >
              {/* Token Image with safe fallback */}
              <div className="w-5 h-5 rounded-full bg-black border border-white/20 overflow-hidden relative flex-shrink-0 flex items-center justify-center shadow-inner">
                <TokenImage
                  src={tok.logo}
                  alt={tok.symbol}
                  size={20}
                  sparkleSize={14}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex items-baseline gap-1.5 text-[11px] font-mono leading-none">
                <span className="font-extrabold text-white truncate max-w-[80px] drop-shadow-sm group-hover:text-theme-light transition-colors">
                  {tok.symbol}
                </span>
                <span className="text-[10px] text-zinc-400 truncate max-w-[65px]">
                  {tok.creator ? `${tok.creator.slice(0, 4)}...${tok.creator.slice(-2)}` : '0x00...00'}
                </span>
                <span
                  style={{
                    color: theme.color,
                    textShadow: `0 0 8px ${theme.glow}`,
                  }}
                  className="text-[10px] font-black tracking-tight"
                >
                  Launched
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}