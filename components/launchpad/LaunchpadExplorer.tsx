'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { PonsV2TokenInfo, getPonsTokenInfo } from '@/lib/pons-v2'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { isAddress } from 'viem'
import toast from 'react-hot-toast'
import { useTheme } from '@/context/ThemeContext'
import SparkleIcon from '@/components/ui/SparkleIcon'
import TokenImage from '@/components/ui/TokenImage'

interface LaunchpadExplorerProps {
  onOpenCreateToken: () => void
  onOpenClaimFees: () => void
  onOpenSwap: (tokenCa: string) => void
  onSelectTokenDetail: (token: PonsV2TokenInfo) => void
}

type TabType = 'all' | 'new' | 'graduated' | 'mine'

export default function LaunchpadExplorer({
  onOpenCreateToken,
  onOpenClaimFees,
  onOpenSwap,
  onSelectTokenDetail,
}: LaunchpadExplorerProps) {
  const { address } = useWallet()
  const { theme } = useTheme()
  const [tokens, setTokens] = useState<PonsV2TokenInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [customCaInput, setCustomCaInput] = useState('')
  const [lookingUpCa, setLookingUpCa] = useState(false)

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem('pons_tokens_cache')
      if (cached) {
        const parsed = JSON.parse(cached)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTokens(parsed)
          setLoading(false)
        }
      }
    } catch { /* ignore */ }
  }, [])

  const fetchTokens = useCallback(async (showSpinner = false) => {
    if (showSpinner && tokens.length === 0) setLoading(true)
    try {
      const res = await fetch('/api/launchpad/tokens')
      if (res.ok) {
        const data = await res.json()
        if (data.tokens && Array.isArray(data.tokens)) {
          setTokens(data.tokens)
          try {
            sessionStorage.setItem('pons_tokens_cache', JSON.stringify(data.tokens))
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      console.error('Failed to fetch launchpad tokens:', err)
    } finally {
      setLoading(false)
    }
  }, [tokens.length])

  useEffect(() => {
    fetchTokens(false)
    const interval = setInterval(() => fetchTokens(false), 5000)
    return () => clearInterval(interval)
  }, [fetchTokens])

  async function handleLookupCustomCa(e: React.FormEvent) {
    e.preventDefault()
    const clean = customCaInput.trim()
    if (!clean || !isAddress(clean)) {
      toast.error('Please enter a valid contract address (0x...)')
      return
    }

    setLookingUpCa(true)
    try {
      const info = await getPonsTokenInfo(clean)
      if (info) {
        onSelectTokenDetail(info)
        toast.success(`Found $${info.symbol} on Robinhood Chain!`)
      } else {
        toast.error('Token not found on Pons v2 factory.')
      }
    } catch (err) {
      console.error('Error looking up token:', err)
      toast.error('Failed to query token contract address.')
    } finally {
      setLookingUpCa(false)
    }
  }

  function copyToClipboard(text: string, e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    toast.success('Contract address copied!')
  }

  const filteredTokens = useMemo(() => {
    const list = tokens.filter((t) => {
      if (activeTab === 'new' && t.graduated) return false
      if (activeTab === 'graduated' && !t.graduated) return false
      if (activeTab === 'mine') {
        if (!address) return false
        if (t.creatorAddress.toLowerCase() !== address.toLowerCase()) return false
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const matchName = t.name.toLowerCase().includes(q)
        const matchSymbol = t.symbol.toLowerCase().includes(q)
        const matchAddr = t.tokenAddress.toLowerCase().includes(q)
        if (!matchName && !matchSymbol && !matchAddr) return false
      }

      return true
    })

    if (activeTab === 'graduated') {
      list.sort((a, b) => {
        const mcapA = (a.priceUsd || (a.priceNative * 2500) || 0) * 1000000000 + a.progress * 10000
        const mcapB = (b.priceUsd || (b.priceNative * 2500) || 0) * 1000000000 + b.progress * 10000
        return mcapB - mcapA
      })
    }

    return list
  }, [tokens, activeTab, searchQuery, address])

  const newCount = tokens.filter((t) => !t.graduated).length
  const graduatedCount = tokens.filter((t) => t.graduated).length
  const myCount = address ? tokens.filter((t) => t.creatorAddress.toLowerCase() === address.toLowerCase()).length : 0

  const topMcapTokens = useMemo(() => {
    if (tokens.length === 0) return []
    return [...tokens].sort((a, b) => {
      const mcapA = (a.priceUsd || (a.priceNative * 2500) || 0) * 1000000000 + a.progress * 10000
      const mcapB = (b.priceUsd || (b.priceNative * 2500) || 0) * 1000000000 + b.progress * 10000
      return mcapB - mcapA
    })
  }, [tokens])

  const [deckOffset, setDeckOffset] = useState(0)

  useEffect(() => {
    if (topMcapTokens.length <= 1) return
    const interval = setInterval(() => {
      setDeckOffset((prev) => (prev + 1) % topMcapTokens.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [topMcapTokens.length])

  return (
    <div className="flex flex-col gap-6 w-full animate-fadeIn font-mono">
      {/* Top Header Row: Left Box + Right Billboard */}
      <div className="flex flex-col lg:flex-row gap-3.5 items-stretch w-full">
        {/* Left Box: Title, Search & Filter Tabs */}
        <div
          style={{
            boxShadow: `4px 4px 0px 0px ${theme.color}`,
          }}
          className="flex-1 w-full bg-[#0e1115] border-2 border-white rounded-xl p-3 sm:p-3.5 flex flex-col justify-between gap-2.5"
        >
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <SparkleIcon size={22} className="flex-shrink-0" />
              <h1 className="text-sm sm:text-base font-black text-white uppercase tracking-tight">
                Pons v2 Launchpad
              </h1>
              <span className="text-[9px] font-black px-1.5 py-0.2 bg-[var(--theme-color)] text-black border border-black uppercase">
                [RH-4663]
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1 font-sans leading-tight">
              Fair-launch tokens with automated anti-snipe bonding curves & Uniswap v4 locked liquidity.
            </p>
          </div>

          {/* Search Bar */}
          <div className="relative w-full">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-xs pointer-events-none font-mono">
              //
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="SEARCH NAME, SYMBOL, OR 0x ADDRESS..."
              className="w-full bg-[#121519] border-2 border-zinc-700 focus:border-white pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 font-mono rounded-lg shadow-[2px_2px_0px_0px_#000000] focus:shadow-[3px_3px_0px_0px_#ffffff] focus:outline-none transition-all"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-2.5 py-1 rounded text-[11px] font-black transition-all cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-[var(--theme-color)] text-black border-2 border-white shadow-[1px_1px_0px_0px_#ffffff]'
                  : 'bg-[#15191f] text-zinc-300 border-2 border-zinc-700 hover:border-white shadow-[1px_1px_0px_0px_#000000]'
              }`}
            >
              ALL ({tokens.length})
            </button>
            <button
              onClick={() => setActiveTab('new')}
              className={`px-2.5 py-1 rounded text-[11px] font-black transition-all cursor-pointer ${
                activeTab === 'new'
                  ? 'bg-[var(--theme-color)] text-black border-2 border-white shadow-[1px_1px_0px_0px_#ffffff]'
                  : 'bg-[#15191f] text-zinc-300 border-2 border-zinc-700 hover:border-white shadow-[1px_1px_0px_0px_#000000]'
              }`}
            >
              NEW ({newCount})
            </button>
            <button
              onClick={() => setActiveTab('graduated')}
              className={`px-2.5 py-1 rounded text-[11px] font-black transition-all cursor-pointer ${
                activeTab === 'graduated'
                  ? 'bg-[var(--theme-color)] text-black border-2 border-white shadow-[1px_1px_0px_0px_#ffffff]'
                  : 'bg-[#15191f] text-zinc-300 border-2 border-zinc-700 hover:border-white shadow-[1px_1px_0px_0px_#000000]'
              }`}
            >
              GRADUATED ({graduatedCount})
            </button>
            <button
              onClick={() => setActiveTab('mine')}
              className={`px-2.5 py-1 rounded text-[11px] font-black transition-all cursor-pointer ${
                activeTab === 'mine'
                  ? 'bg-[var(--theme-color)] text-black border-2 border-white shadow-[1px_1px_0px_0px_#ffffff]'
                  : 'bg-[#15191f] text-zinc-300 border-2 border-zinc-700 hover:border-white shadow-[1px_1px_0px_0px_#000000]'
              }`}
            >
              MY TOKENS {myCount > 0 ? `(${myCount})` : ''}
            </button>
          </div>
        </div>

        {/* Right: Digital Billboard Marquee (Papan Iklan) */}
        <div
          style={{
            boxShadow: `4px 4px 0px 0px #000000`,
          }}
          className="w-full lg:w-[320px] xl:w-[360px] bg-[#0e1115] border-2 border-white rounded-xl overflow-hidden flex flex-col justify-between select-none relative group flex-shrink-0"
        >
          {/* Billboard Top Roof Bar */}
          <div className="flex items-center justify-between px-3 py-1 bg-[#14171d] border-b-2 border-zinc-800 text-[10px] font-black text-white">
            <div className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ backgroundColor: theme.color }}
              />
              <span className="tracking-wider uppercase">// BILLBOARD_HOT</span>
            </div>
            <span className="text-[9px] font-black font-mono px-1 py-0.2 bg-zinc-800 border border-zinc-700 text-zinc-300 uppercase">
              LIVE
            </span>
          </div>

          {/* Billboard Screen Face */}
          {topMcapTokens.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-4 text-center gap-1.5 min-h-[110px]">
              <SparkleIcon size={24} />
              <span className="text-[11px] font-black text-theme-light uppercase">[PONS V2 BILLBOARD]</span>
            </div>
          ) : (() => {
            const featuredToken = topMcapTokens[deckOffset % topMcapTokens.length]
            const mcapUsd = featuredToken.priceUsd * 1000000000
            const mcapStr = mcapUsd >= 1000 ? `$${(mcapUsd / 1000).toFixed(1)}k` : `$${mcapUsd.toFixed(1)}`

            return (
              <div
                key={featuredToken.tokenAddress}
                onClick={() => onSelectTokenDetail(featuredToken)}
                className="p-3 flex flex-col justify-between gap-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors relative animate-fadeIn flex-1"
              >
                {/* Main Ad Presentation */}
                <div className="flex items-center gap-2.5">
                  {/* Billboard Thumbnail with Brutalist Border */}
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-black border-2 border-white overflow-hidden shadow-[2px_2px_0px_0px_#000000] flex-shrink-0 relative group-hover:scale-105 transition-transform">
                    <TokenImage
                      src={featuredToken.logo}
                      alt={featuredToken.symbol}
                      size={56}
                      sparkleSize={28}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Billboard Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 flex-wrap mb-0.5">
                      <span className="text-[10px] font-black text-black bg-[var(--theme-color)] px-1 py-0.2 border border-black shadow-[1px_1px_0px_0px_#000000]">
                        ${featuredToken.symbol}
                      </span>
                      <span className="text-[9px] font-black text-white bg-black border border-zinc-700 px-1 py-0.2">
                        {mcapStr} MCAP
                      </span>
                    </div>

                    <h3 className="text-xs sm:text-sm font-black text-white truncate leading-tight uppercase">
                      {featuredToken.name}
                    </h3>

                    {/* Progress indicator */}
                    <div className="mt-1 flex flex-col gap-0.5">
                      <div className="flex justify-between text-[9px] font-mono text-zinc-400">
                        <span>CURVE PROGRESS</span>
                        <span className="text-white font-bold">{featuredToken.progress.toFixed(1)}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-black border border-zinc-700 rounded-none overflow-hidden p-[0.5px]">
                        <div
                          className="h-full bg-[var(--theme-color)] transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(2, featuredToken.progress))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Billboard Action Stripe */}
                <div className="flex items-center justify-between pt-1.5 border-t border-zinc-800/80 text-[9px] font-mono">
                  <span className="text-zinc-400 uppercase tracking-tight">
                    TRADE ON RH CHAIN
                  </span>
                  <span className="font-black text-black bg-white px-1.5 py-0.5 border border-black shadow-[1px_1px_0px_0px_#000000] group-hover:bg-[var(--theme-color)] transition-colors uppercase">
                    TRADE NOW ↗
                  </span>
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Main Token Grid Box */}
      <div
        style={{
          boxShadow: `4px 4px 0px 0px #000000`,
        }}
        className="flex flex-col bg-[#0e1115] border-2 border-white rounded-xl overflow-hidden h-[640px] sm:h-[680px] w-full flex-shrink-0"
      >
        {/* Frame Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b-2 border-zinc-800 bg-[#12151a] flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xs sm:text-sm font-black uppercase text-white flex items-center gap-2">
              <span>// ACTIVE_TOKENS</span>
              <span className="text-[10px] font-black px-2 py-0.5 bg-zinc-800 border border-zinc-700 text-theme-light rounded-none">
                [{filteredTokens.length} ITEMS]
              </span>
            </h2>
          </div>

          <button
            onClick={() => fetchTokens(true)}
            className="text-xs text-zinc-300 hover:text-black hover:bg-white transition-all font-bold cursor-pointer flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 border border-zinc-700 hover:border-white shadow-[2px_2px_0px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none rounded"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>REFRESH</span>
          </button>
        </div>

        {/* Token Grid Content */}
        <div className="flex-1 min-h-0 p-3 sm:p-5 overflow-y-auto">
          {loading && tokens.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[360px] gap-3">
              <Spinner size="lg" />
              <p className="text-xs text-zinc-300 font-mono">[SYNCING PONS V2 FACTORY...]</p>
            </div>
          ) : filteredTokens.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[360px] p-6 text-center gap-4">
              <SparkleIcon size={36} className="flex-shrink-0" />
              <div className="max-w-md">
                <p className="text-base font-black uppercase text-white">
                  {activeTab === 'mine'
                    ? 'NO CREATED TOKENS FOUND'
                    : 'NO MATCHING TOKENS'}
                </p>
                <p className="text-xs text-zinc-400 mt-1 font-sans leading-relaxed">
                  {activeTab === 'mine'
                    ? 'Deploy your first token to the bonding curve with 100% fair launch and automated graduation.'
                    : 'Be the first creator to deploy a token on Robinhood Chain using the Pons v2 launchpad!'}
                </p>
              </div>
              <Button
                size="sm"
                onClick={onOpenCreateToken}
                variant="primary"
                className="gap-2 px-5 py-2.5 text-xs font-black"
              >
                + LAUNCH TOKEN NOW
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
              {filteredTokens.map((token) => {
                const progressPct = (token.progress * 100).toFixed(1)
                const isMyToken = !!address && token.creatorAddress.toLowerCase() === address.toLowerCase()
                const marketCapUsd = token.priceUsd * 1000000000
                const marketCapFormatted =
                  marketCapUsd >= 1000000
                    ? `${(marketCapUsd / 1000000).toFixed(2)}M`
                    : marketCapUsd >= 1000
                    ? `${(marketCapUsd / 1000).toFixed(1)}k`
                    : marketCapUsd.toFixed(2)

                return (
                  <div
                    key={token.tokenAddress}
                    onClick={() => onSelectTokenDetail(token)}
                    className="flex flex-row gap-3 p-3.5 rounded-lg bg-[#111419] border-2 border-zinc-800 hover:border-white shadow-[3px_3px_0px_0px_#000000] hover:shadow-[4px_4px_0px_0px_var(--theme-color)] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all cursor-pointer group relative overflow-hidden"
                  >
                    {/* Left: Square Token Thumbnail */}
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-md bg-black border-2 border-zinc-700 overflow-hidden relative flex-shrink-0 flex items-center justify-center shadow-md group-hover:border-white transition-colors">
                      <TokenImage
                        src={token.logo}
                        alt={token.symbol}
                        size={72}
                        sparkleSize={48}
                        className="w-full h-full object-cover"
                      />

                      {/* Creator badge */}
                      {isMyToken && (
                        <span className="absolute top-1 left-1 text-[8px] font-black text-black bg-amber-400 px-1 py-0.2 border border-black shadow-[1px_1px_0px_0px_#000000]">
                          YOU
                        </span>
                      )}
                    </div>

                    {/* Right: Info Column */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between gap-1">
                      {/* Top row: Creator & Badge */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 text-[10px] text-zinc-400 truncate">
                          <span className="text-zinc-600">BY:</span>
                          <span className="text-zinc-300 font-bold">
                            {token.creatorAddress.slice(0, 4)}...{token.creatorAddress.slice(-4)}
                          </span>
                        </div>

                        <span
                          className={`text-[9px] font-black px-1.5 py-0.2 border border-black ${
                            token.graduated
                              ? 'bg-[var(--theme-color)] text-black'
                              : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                          }`}
                        >
                          {token.phase === 2 ? 'UNIV4' : 'CURVE'}
                        </span>
                      </div>

                      {/* Name & Ticker */}
                      <div>
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-sm font-black text-white group-hover:text-theme-light transition-colors truncate">
                            {token.name}
                          </span>
                          <span className="text-xs font-black text-theme-light">
                            ${token.symbol}
                          </span>
                        </div>

                        {token.description && (
                          <p className="text-[11px] text-zinc-400 line-clamp-1 font-sans leading-tight">
                            {token.description}
                          </p>
                        )}
                      </div>

                      {/* Market Cap & Progress */}
                      <div className="flex flex-col gap-1 text-[11px] pt-1">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-xs text-white">
                            MCAP: ${marketCapFormatted}
                          </span>
                          <span className="text-zinc-400 text-[10px]">
                            CURVE: <strong className="text-theme-light">{progressPct}%</strong>
                          </span>
                        </div>

                        {/* Brutalist Progress Bar */}
                        <div className="w-full h-2 bg-black rounded-none overflow-hidden border border-zinc-700">
                          <div
                            className="h-full rounded-none transition-all duration-300"
                            style={{
                              width: `${Math.max(2, parseFloat(progressPct))}%`,
                              backgroundColor: theme.color,
                            }}
                          />
                        </div>
                      </div>

                      {/* Card Footer: CA & Quick Swap Action */}
                      <div className="flex items-center justify-between pt-1 border-t border-zinc-800 text-[10px]">
                        <div className="flex items-center gap-1 text-zinc-500">
                          <span>CA: {token.tokenAddress.slice(0, 4)}...{token.tokenAddress.slice(-4)}</span>
                          <button
                            onClick={(e) => copyToClipboard(token.tokenAddress, e)}
                            className="hover:text-white p-0.5 transition-colors cursor-pointer"
                            title="Copy CA"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onOpenSwap(token.tokenAddress)
                          }}
                          className="px-2.5 py-0.5 rounded bg-[var(--theme-color)] text-black border border-black shadow-[1px_1px_0px_0px_#ffffff] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none text-[10px] font-black transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <span>SWAP</span>
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
