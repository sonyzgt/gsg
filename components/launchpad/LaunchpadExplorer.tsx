'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { useWallet } from '@/hooks/useWallet'
import { PonsV2TokenInfo, getPonsTokenInfo } from '@/lib/pons-v2'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { formatEther, isAddress } from 'viem'
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

  // Load cached tokens immediately for instant 0ms initial render
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

  // Fetch tokens from API
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

  // Custom CA lookup directly on-chain
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

  // Copy helper
  function copyToClipboard(text: string, e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    toast.success('Contract address copied!')
  }

  // Filter Tokens & Sort by Highest Market Cap (FDV)
  const filteredTokens = useMemo(() => {
    const list = tokens.filter((t) => {
      // Tab filter
      if (activeTab === 'new' && t.graduated) return false
      if (activeTab === 'graduated' && !t.graduated) return false
      if (activeTab === 'mine') {
        if (!address) return false
        if (t.creatorAddress.toLowerCase() !== address.toLowerCase()) return false
      }

      // Search Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const matchName = t.name.toLowerCase().includes(q)
        const matchSymbol = t.symbol.toLowerCase().includes(q)
        const matchAddr = t.tokenAddress.toLowerCase().includes(q)
        if (!matchName && !matchSymbol && !matchAddr) return false
      }

      return true
    })

    // For 'graduated' tab, sort by MCAP descending. For other tabs, preserve exact order (newest on top/left)
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

  // Filter & sort tokens specifically with the HIGHEST Market Cap (FDV) for the Playing Cards fan deck
  const topMcapTokens = useMemo(() => {
    if (tokens.length === 0) return []
    return [...tokens].sort((a, b) => {
      const mcapA = (a.priceUsd || (a.priceNative * 2500) || 0) * 1000000000 + a.progress * 10000
      const mcapB = (b.priceUsd || (b.priceNative * 2500) || 0) * 1000000000 + b.progress * 10000
      return mcapB - mcapA
    })
  }, [tokens])

  const [deckOffset, setDeckOffset] = useState(0)
  const [isHovered, setIsHovered] = useState(false)

  // Cycle / Shuffle cards every 3.2 seconds
  useEffect(() => {
    if (topMcapTokens.length <= 1 || isHovered) return
    const interval = setInterval(() => {
      setDeckOffset((prev) => (prev + 1) % topMcapTokens.length)
    }, 3200)
    return () => clearInterval(interval)
  }, [topMcapTokens.length, isHovered])

  // Get active 5 cards fanned in relative visual slots
  const cardSlots = [
    { transform: '-rotate-[16deg] -translate-x-22 translate-y-3 z-10 opacity-75 scale-90', isCenter: false },
    { transform: '-rotate-[8deg] -translate-x-11 translate-y-1 z-20 opacity-90 scale-95', isCenter: false },
    { transform: 'rotate-[0deg] translate-x-0 -translate-y-2 z-30 opacity-100 scale-100 ring-2 ring-white/30', isCenter: true },
    { transform: 'rotate-[8deg] translate-x-11 translate-y-1 z-20 opacity-90 scale-95', isCenter: false },
    { transform: 'rotate-[16deg] translate-x-22 translate-y-3 z-10 opacity-75 scale-90', isCenter: false },
  ]

  const numDeckCards = Math.min(5, topMcapTokens.length)
  const currentDeck = useMemo(() => {
    if (topMcapTokens.length === 0) return []
    return Array.from({ length: numDeckCards }, (_, i) => {
      const tokenIdx = (deckOffset + i) % topMcapTokens.length
      return {
        token: topMcapTokens[tokenIdx],
        slot: cardSlots[i % cardSlots.length],
      }
    })
  }, [topMcapTokens, deckOffset, numDeckCards])

  return (
    <div className="flex flex-col gap-6 w-full animate-fadeIn">
      {/* Top Header Row: Left Box + Right Fanned Cards Outside Box */}
      <div className="flex flex-col lg:flex-row gap-6 items-center w-full">
        {/* Left Box: Title, Search & Filter Tabs */}
        <div className="flex-1 w-full liquid-glass p-5 sm:p-6 rounded-3xl shadow-2xl flex flex-col gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <SparkleIcon size={28} className="flex-shrink-0" />
              <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight drop-shadow-sm">
                Pons v2 Token Launchpad
              </h2>
              <span className="text-[10px] sm:text-xs font-bold liquid-pill px-2.5 py-0.5 rounded-full font-mono text-theme-light border-theme">
                Robinhood Chain
              </span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-300/80 mt-1.5 font-sans">
              Fair-launch tokens with automated anti-snipe bonding curves & permanent Uniswap v4 locked liquidity.
            </p>
          </div>

          {/* Search Bar */}
          <div className="pt-2 border-t border-white/[0.08]">
            <div className="relative w-full">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by token name, symbol, or 0x contract address..."
                className="w-full liquid-pill pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-[var(--theme-color)] font-sans rounded-2xl transition-all"
              />
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-2 flex-wrap pt-0.5">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${
                activeTab === 'all'
                  ? 'liquid-pill-active'
                  : 'liquid-pill text-zinc-400 hover:text-white'
              }`}
            >
              All Launches ({tokens.length})
            </button>
            <button
              onClick={() => setActiveTab('new')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${
                activeTab === 'new'
                  ? 'liquid-pill-active'
                  : 'liquid-pill text-zinc-400 hover:text-white'
              }`}
            >
              New Launched ({newCount})
            </button>
            <button
              onClick={() => setActiveTab('graduated')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${
                activeTab === 'graduated'
                  ? 'liquid-pill-active'
                  : 'liquid-pill text-zinc-400 hover:text-white'
              }`}
            >
              Graduated ({graduatedCount})
            </button>
            <button
              onClick={() => setActiveTab('mine')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${
                activeTab === 'mine'
                  ? 'liquid-pill-active'
                  : 'liquid-pill text-zinc-400 hover:text-white'
              }`}
            >
              My Created Tokens {myCount > 0 ? `(${myCount})` : ''}
            </button>
          </div>
        </div>

        {/* Right: Automated Card Shuffling Fan Deck Outside Box */}
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className="hidden lg:flex flex-col items-center justify-center w-[330px] xl:w-[370px] h-[220px] relative select-none flex-shrink-0 group"
        >
          {/* Deck Fan Viewport */}
          <div className="relative w-full h-full flex items-center justify-center">
            {currentDeck.length === 0 ? (
              <div className="w-32 h-44 rounded-2xl liquid-glass flex flex-col items-center justify-center p-3 text-center shadow-2xl">
                <SparkleIcon size={40} />
                <span className="text-[11px] font-mono mt-2 font-bold text-glow-theme">Pons v2</span>
              </div>
            ) : (
              currentDeck.map(({ token: tok, slot }) => {
                const marketCapUsd = tok.priceUsd * 1000000000
                const mcapStr =
                  marketCapUsd >= 1000 ? `$${(marketCapUsd / 1000).toFixed(1)}k` : `$${marketCapUsd.toFixed(1)}`

                return (
                  <div
                    key={tok.tokenAddress}
                    onClick={() => onSelectTokenDetail(tok)}
                    title={`Click to open $${tok.symbol}`}
                    style={{
                      borderColor: theme.color,
                      boxShadow: `0 0 30px ${theme.glow}`,
                    }}
                    className={`absolute w-32 xl:w-36 h-44 xl:h-48 rounded-2xl border-2 bg-black overflow-hidden shadow-2xl cursor-pointer transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:!scale-120 hover:!rotate-0 hover:!z-50 hover:!-translate-y-5 hover:!opacity-100 ${slot.transform}`}
                  >
                    {/* Full Token Image (Edge-to-Edge) */}
                    <TokenImage
                      src={tok.logo}
                      alt={tok.symbol}
                      size={144}
                      sparkleSize={72}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />

                    {/* Gradient Overlay for Readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent pointer-events-none" />

                    {/* Top Ticker Pill */}
                    <div className="absolute top-2 left-2 pointer-events-none">
                      <span className="text-[9px] font-black text-white liquid-pill px-2 py-0.5 rounded-lg border-white/25 font-mono shadow-md">
                        ${tok.symbol}
                      </span>
                    </div>

                    {/* Bottom MCAP & Name Overlay */}
                    <div className="absolute bottom-2 left-2 right-2 flex flex-col gap-0.5 pointer-events-none">
                      <span className="text-[11px] font-extrabold text-white truncate leading-tight drop-shadow-md">
                        {tok.name}
                      </span>
                      <span className="text-[10px] font-mono font-black liquid-pill-active px-2 py-0.5 rounded-lg w-fit shadow-md">
                        {mcapStr} MCAP
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Token Grid Viewport ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ */}
      <div className="flex flex-col liquid-glass rounded-3xl shadow-2xl overflow-hidden h-[640px] sm:h-[680px] w-full flex-shrink-0">
        {/* Frame Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-white/[0.08] bg-white/[0.02] flex-shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 drop-shadow-sm">
              <span>Explore Active Tokens</span>
              <span className="text-[11px] text-theme-light font-mono liquid-pill px-2.5 py-0.5 rounded-full border-theme">
                {filteredTokens.length} {filteredTokens.length === 1 ? 'token' : 'tokens'}
              </span>
            </h3>
          </div>

          <button
            onClick={() => fetchTokens(true)}
            className="text-xs text-zinc-300 hover:text-white transition-colors font-mono cursor-pointer flex items-center gap-1.5 liquid-pill px-3 py-1 rounded-xl"
          >
            <svg className="w-3.5 h-3.5" style={{ color: theme.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Refresh</span>
          </button>
        </div>

        {/* Token Grid Content */}
        <div className="flex-1 min-h-0 p-3 sm:p-5 overflow-y-auto">
          {loading && tokens.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[360px] gap-3">
              <Spinner size="lg" />
              <p className="text-xs text-zinc-300 font-mono">Syncing Pons v2 factory contracts...</p>
            </div>
          ) : filteredTokens.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[360px] p-6 text-center gap-4">
              <SparkleIcon size={56} className="flex-shrink-0" />
              <div className="max-w-md">
                <p className="text-base sm:text-lg font-bold text-zinc-100">
                  {activeTab === 'mine'
                    ? 'You have not launched any tokens yet'
                    : 'No matching tokens found'}
                </p>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  {activeTab === 'mine'
                    ? 'Deploy your first token to the bonding curve with 100% fair launch and automated graduation.'
                    : 'Be the first creator to deploy a token on Robinhood Chain using the Pons v2 launchpad!'}
                </p>
              </div>
              <Button
                size="sm"
                onClick={onOpenCreateToken}
                variant="primary"
                className="gap-2 px-5 py-2.5 text-xs sm:text-sm font-bold"
              >
                + Launch Token Now
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
                    className="flex flex-row gap-3 sm:gap-3.5 p-3 sm:p-4 rounded-2xl liquid-glass-card cursor-pointer group relative overflow-hidden"
                  >
                    {/* Left: Square Token Thumbnail */}
                    <div
                      style={{ borderColor: `${theme.primary}55` }}
                      className="w-20 h-20 sm:w-28 sm:h-28 rounded-xl bg-black border overflow-hidden relative flex-shrink-0 flex items-center justify-center shadow-lg group-hover:scale-[1.03] transition-transform"
                    >
                      <TokenImage
                        src={token.logo}
                        alt={token.symbol}
                        size={72}
                        sparkleSize={48}
                        className="w-full h-full object-cover"
                      />

                      {/* Creator badge overlay on image */}
                      {isMyToken && (
                        <span className="absolute top-1 left-1 text-[9px] font-black text-amber-300 liquid-pill px-1.5 py-0.5 rounded-md font-mono backdrop-blur-md shadow-md border-amber-400/40">
                          ⭐ You
                        </span>
                      )}
                    </div>

                    {/* Right: Pump.fun Info Column */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between gap-1.5">
                      {/* Top row: Created by & Badge */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[11px] text-zinc-300 font-mono truncate">
                          <span className="text-zinc-500 text-[10px]">created by</span>
                          <span className="liquid-pill px-2 py-0.5 rounded-lg truncate max-w-[100px] border-theme text-theme-light font-bold">
                            {token.creatorAddress.slice(0, 4)}...{token.creatorAddress.slice(-4)}
                          </span>
                        </div>

                        <span
                          className={`text-[10px] font-black font-mono px-2 py-0.5 rounded-lg ${
                            token.graduated
                              ? 'liquid-pill-active'
                              : 'liquid-pill text-amber-300'
                          }`}
                        >
                          {token.phase === 2 ? 'Uniswap v4' : 'Curve'}
                        </span>
                      </div>

                      {/* Name & Ticker */}
                      <div>
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-sm font-extrabold text-white group-hover:text-theme-light transition-colors truncate">
                            {token.name}
                          </span>
                          <span className="text-xs font-mono font-bold text-zinc-400">
                            (ticker: <span className="text-theme-light font-bold">${token.symbol}</span>)
                          </span>
                        </div>

                        {/* Description */}
                        {token.description && (
                          <p className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5 font-sans leading-tight">
                            {token.description}
                          </p>
                        )}
                      </div>

                      {/* Market Cap & Bonding Curve Progress */}
                      <div className="flex flex-col gap-1 text-[11px] font-mono pt-1">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-xs text-theme-light">
                            market cap: ${marketCapFormatted}
                          </span>
                          <span className="text-zinc-400 text-[10px]">
                            curve: <strong className="text-zinc-200">{progressPct}%</strong>
                          </span>
                        </div>

                        {/* Sleek Mini Progress Bar */}
                        <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden border border-white/[0.06]">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.max(2, parseFloat(progressPct))}%`,
                              background: `linear-gradient(to right, ${theme.secondary}, ${theme.primary}, ${theme.color})`,
                              boxShadow: `0 0 10px ${theme.color}`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Card Footer: CA & Quick Swap Action */}
                      <div className="flex items-center justify-between pt-1 border-t border-white/[0.04] text-[11px] font-mono">
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
                          className="px-3 py-1 rounded-lg liquid-btn-primary text-[11px] font-bold font-mono transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <span>Swap</span>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
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

