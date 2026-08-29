'use client'

import { useEffect, useState } from 'react'
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
    <div className="w-full bg-[#0d0f12] border-b-2 border-zinc-800 overflow-hidden py-1.5 px-3 sm:px-6 select-none font-mono">
      <div className="flex items-center justify-start gap-2 w-full overflow-x-auto no-scrollbar">
        <span className="text-[10px] font-black uppercase text-zinc-500 flex-shrink-0 flex items-center gap-1 mr-1">
          <span className="w-1.5 h-1.5 rounded-none bg-[var(--theme-color)]" />
          FEED //
        </span>

        {tokens.map((tok) => {
          return (
            <Link
              key={tok.tokenAddress}
              href={`/token/${tok.tokenAddress}`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#14181d] border border-zinc-700 hover:border-white shadow-[2px_2px_0px_0px_#000000] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all flex-shrink-0 cursor-pointer text-xs"
            >
              <div className="w-4 h-4 rounded-none bg-black border border-zinc-700 overflow-hidden relative flex-shrink-0 flex items-center justify-center">
                <TokenImage
                  src={tok.logo}
                  alt={tok.symbol}
                  size={16}
                  sparkleSize={10}
                  className="w-full h-full object-cover"
                />
              </div>

              <span className="font-black text-white truncate max-w-[80px]">
                ${tok.symbol}
              </span>

              <span className="text-[10px] text-zinc-400 truncate max-w-[65px]">
                {tok.creator ? `${tok.creator.slice(0, 4)}...${tok.creator.slice(-2)}` : '0x00'}
              </span>

              <span
                style={{ backgroundColor: theme.color }}
                className="text-[9px] font-black text-black px-1.5 py-0.2 rounded-none uppercase"
              >
                LIVE
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}