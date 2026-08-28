'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, use } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getAddress, isAddress, formatEther } from 'viem'
import { usePrivy } from '@privy-io/react-auth'
import { useWallet } from '@/hooks/useWallet'
import { getPonsTokenInfo, PonsV2TokenInfo } from '@/lib/pons-v2'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import TokenPriceChart from '@/components/token/TokenPriceChart'
import TokenSwapWidget from '@/components/token/TokenSwapWidget'
import ClaimFeesModal from '@/components/launchpad/ClaimFeesModal'
import Spinner from '@/components/ui/Spinner'
import toast from 'react-hot-toast'
import { useTheme } from '@/context/ThemeContext'
import SparkleIcon from '@/components/ui/SparkleIcon'
import TokenImage from '@/components/ui/TokenImage'

interface PageProps {
  params: Promise<{ address: string }>
}

export default function TokenDetailPage({ params }: PageProps) {
  const resolvedParams = use(params)
  const rawAddress = resolvedParams.address

  const { logout } = usePrivy()
  const { address: userAddress, refetchBalance } = useWallet()
  const { theme } = useTheme()
  const [loggingOut, setLoggingOut] = useState(false)

  const [token, setToken] = useState<PonsV2TokenInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'trades'>('overview')
  const [claimFeesOpen, setClaimFeesOpen] = useState(false)

  const cleanCa = isAddress(rawAddress) && getAddress(rawAddress) !== '0x0000000000000000000000000000000000000000' ? getAddress(rawAddress) : null

  const fetchToken = useCallback(async () => {
    if (!cleanCa) {
      setLoading(false)
      return
    }
    try {
      const data = await getPonsTokenInfo(cleanCa)
      if (data) {
        setToken(data)
      } else {
        // Fallback info query
        const res = await fetch('/api/token-price', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: cleanCa }),
        })
        if (res.ok) {
          const p = await res.json()
          setToken({
            tokenAddress: cleanCa,
            name: p.name || 'Token',
            symbol: p.symbol || 'TOKEN',
            logo: '/logo.svg',
            description: `${p.name} token on Robinhood Chain`,
            socials: { twitter: '', telegram: '', discord: '', website: '', farcaster: '' },
            dexType: 'pons-v2',
            phase: p.phase ?? 0,
            curveAddress: p.curveAddress || cleanCa,
            creatorAddress: p.creatorAddress || '0x0000000000000000000000000000000000000000',
            pairToken: '0x0000000000000000000000000000000000000000',
            poolFee: p.poolFee || 10000,
            tickSpacing: p.tickSpacing || 60,
            creatorTaxBps: p.creatorTaxBps || 100,
            graduationThreshold: '5000000000000000000',
            realQuoteReserve: '0',
            quoteReserve: '0',
            tokenReserve: '1000000000000000000000000000',
            sellableTokens: '800000000000000000000000000',
            readyToGraduate: false,
            graduated: false,
            poolAddress: null,
            poolId: null,
            poolKey: null,
            route: 'BONDING_CURVE',
            isUsdgPaired: false,
            isNative: true,
            priceNative: p.priceNative || 0.0000000025,
            priceUsd: p.priceUsd || 0.00000625,
            progress: 0.0,
          })
        }
      }
    } catch (e) {
      console.error('Error loading token page:', e)
    } finally {
      setLoading(false)
    }
  }, [cleanCa])

  useEffect(() => {
    fetchToken()
    const interval = setInterval(fetchToken, 4000)
    return () => clearInterval(interval)
  }, [fetchToken])

  function copyText(txt: string, label: string) {
    navigator.clipboard.writeText(txt)
    toast.success(`${label} copied!`)
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-transparent text-zinc-100">
        <Navbar onLogout={async () => logout()} loggingOut={false} />
        <main className="flex-1 flex items-center justify-center min-h-[60vh]">
          <Spinner size="lg" />
        </main>
        <Footer />
      </div>
    )
  }

  if (!cleanCa || !token) {
    return (
      <div className="flex flex-col min-h-screen bg-transparent text-zinc-100">
        <Navbar onLogout={async () => logout()} loggingOut={false} />
        <main className="flex-1 max-w-4xl mx-auto px-4 py-16 text-center flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-black border border-white/[0.08] flex items-center justify-center text-zinc-500">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Token Not Found</h1>
          <p className="text-sm text-zinc-400 max-w-md">
            The token address <code className="text-emerald-400 font-mono">{rawAddress}</code> was not found on Robinhood Chain or has not been indexed yet.
          </p>
          <Link
            href="/coin"
            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs font-mono transition-all"
          >
            Back to Coins Explorer
          </Link>
        </main>
        <Footer />
      </div>
    )
  }

  const raisedEth = parseFloat(formatEther(BigInt(token.realQuoteReserve || '0')))
  const targetEth = parseFloat(formatEther(BigInt(token.graduationThreshold || '5000000000000000000')))
  const progressPct = (token.progress * 100).toFixed(1)
  const isGraduated = token.phase === 2 || token.graduated
  const marketCapUsd = (token.priceUsd * 1000000000).toLocaleString('en-US', { maximumFractionDigits: 0 })
  const marketCapEth = (token.priceNative * 1000000000).toFixed(3)
  const explorerUrl = `https://robinhoodchain.blockscout.com/token/${token.tokenAddress}`

  return (
    <div className="flex flex-col min-h-screen bg-transparent text-zinc-100 animate-fadeIn">
      {/* Navigation */}
      <Navbar
        onLogout={async () => {
          setLoggingOut(true)
          await logout()
        }}
        loggingOut={loggingOut}
      />

      {/* Main Terminal Body */}
      <main className="flex-1 w-full max-w-[1720px] mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8">
        <div className="max-w-7xl mx-auto flex flex-col gap-6">
          {/* Breadcrumb & Quick Nav */}
          <div className="flex items-center justify-between gap-3 text-xs font-mono">
            <Link
              href="/coin"
              className="flex items-center gap-1.5 text-zinc-400 hover:text-emerald-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span>Back to Explorer</span>
            </Link>

            <span className="flex items-center gap-1.5 text-zinc-400 liquid-pill px-3 py-1 rounded-full">
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ backgroundColor: theme.color, boxShadow: `0 0 8px ${theme.color}` }}
              />
              Robinhood Chain (4663)
            </span>
          </div>

          {/* ── Top Header Profile Banner ────────────────────────────────────────── */}
          <div className="liquid-glass rounded-3xl p-5 sm:p-7 shadow-2xl relative overflow-hidden flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div
              className="absolute top-0 right-0 w-72 h-72 rounded-full blur-3xl pointer-events-none transition-all duration-700"
              style={{ background: theme.glow }}
            />

            <div className="flex items-start sm:items-center gap-4 sm:gap-5">
              <div
                style={{ borderColor: `${theme.primary}55` }}
                className="w-16 sm:w-20 h-16 sm:h-20 rounded-2xl bg-black border overflow-hidden relative flex-shrink-0 flex items-center justify-center shadow-xl"
              >
                <TokenImage
                  src={token.logo}
                  alt={token.symbol}
                  size={48}
                  sparkleSize={48}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight">
                    {token.name}
                  </h1>
                  <span className="text-xs sm:text-sm font-mono font-bold text-theme-light liquid-pill px-2.5 py-0.5 rounded-full border-theme">
                    ${token.symbol}
                  </span>
                  <span
                    className={`text-[10px] sm:text-xs font-bold px-2.5 py-0.5 rounded-full border uppercase font-mono ${
                      isGraduated
                        ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                        : 'liquid-pill-active'
                    }`}
                  >
                    {isGraduated ? 'Uniswap v4' : 'Bonding Curve'}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs font-mono text-zinc-400 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span>CA:</span>
                    <code className="text-theme-light font-bold bg-black/60 px-2 py-0.5 rounded border border-white/[0.06]">
                      {token.tokenAddress.slice(0, 6)}...{token.tokenAddress.slice(-4)}
                    </code>
                    <button
                      onClick={() => copyText(token.tokenAddress, 'Token CA')}
                      className="text-zinc-400 hover:text-white cursor-pointer"
                      title="Copy Token CA"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>

                  <span className="text-zinc-600">&bull;</span>
                  <span>Supply: 1B Fixed</span>
                </div>
              </div>
            </div>

            {/* Social & Explorer Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {token.socials?.twitter && (
                <a
                  href={token.socials.twitter.startsWith('http') ? token.socials.twitter : `https://x.com/${token.socials.twitter.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-zinc-300 hover:text-white text-xs font-mono transition-colors"
                >
                  Twitter
                </a>
              )}
              {token.socials?.telegram && (
                <a
                  href={token.socials.telegram.startsWith('http') ? token.socials.telegram : `https://t.me/${token.socials.telegram.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-zinc-300 hover:text-white text-xs font-mono transition-colors"
                >
                  Telegram
                </a>
              )}
              {token.socials?.website && (
                <a
                  href={token.socials.website.startsWith('http') ? token.socials.website : `https://${token.socials.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-zinc-300 hover:text-white text-xs font-mono transition-colors"
                >
                  Website
                </a>
              )}
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] hover:border-theme text-zinc-300 hover:text-white text-xs font-mono transition-colors flex items-center gap-1"
              >
                <span>Blockscout</span>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>

              {/* Creator Fee Action Button */}
              <button
                onClick={() => setClaimFeesOpen(true)}
                className="px-3.5 py-1.5 rounded-xl liquid-pill text-theme-light border-theme hover:brightness-110 text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" style={{ color: theme.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Creator Fee</span>
              </button>
            </div>
          </div>

          {/* ── Key Metrics Grid ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 font-mono">
            {/* Market Cap */}
            <div className="liquid-glass rounded-2xl p-4 flex flex-col gap-1">
              <span className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-wider">
                Market Cap (FDV)
              </span>
              <span className="text-lg sm:text-2xl font-extrabold text-white">
                ${marketCapUsd}
              </span>
              <span className="text-[11px] text-zinc-400">{marketCapEth} ETH</span>
            </div>

            {/* Current Price */}
            <div className="liquid-glass rounded-2xl p-4 flex flex-col gap-1">
              <span className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-wider">
                Token Price
              </span>
              <span className="text-lg sm:text-2xl font-extrabold text-theme-light truncate">
                ${token.priceUsd < 0.0001 ? token.priceUsd.toFixed(8) : token.priceUsd.toFixed(4)}
              </span>
              <span className="text-[11px] text-zinc-400 truncate">
                {token.priceNative < 0.00001 ? token.priceNative.toFixed(10) : token.priceNative.toFixed(6)} ETH
              </span>
            </div>

            {/* Graduation Progress */}
            <div className="liquid-glass rounded-2xl p-4 flex flex-col gap-1.5 col-span-2 sm:col-span-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-wider">
                  Graduation
                </span>
                <span className="font-bold text-theme-light">{progressPct}%</span>
              </div>
              <div className="w-full h-2 bg-black/60 rounded-full overflow-hidden border border-white/[0.06]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(3, parseFloat(progressPct))}%`,
                    background: `linear-gradient(to right, ${theme.secondary}, ${theme.primary}, ${theme.color})`,
                    boxShadow: `0 0 8px ${theme.color}`,
                  }}
                />
              </div>
              <span className="text-[10px] text-zinc-400 mt-0.5">
                {raisedEth.toFixed(3)} / {targetEth.toFixed(1)} ETH Raised
              </span>
            </div>

            {/* Creator Tax */}
            <div className="liquid-glass rounded-2xl p-4 flex flex-col justify-between gap-1">
              <div className="flex justify-between items-start">
                <div className="flex flex-col">
                  <span className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-wider">
                    Creator Tax
                  </span>
                  <span className="text-lg sm:text-2xl font-extrabold text-white">
                    {(token.creatorTaxBps / 100).toFixed(1)}%
                  </span>
                </div>
                <button
                  onClick={() => setClaimFeesOpen(true)}
                  className="px-2.5 py-1 rounded-lg liquid-pill text-theme-light border-theme hover:brightness-110 text-[11px] font-bold font-mono transition-colors cursor-pointer flex items-center gap-1"
                >
                  Claim
                </button>
              </div>
              <span className="text-[11px] text-zinc-500">Non-custodial escrow</span>
            </div>
          </div>

          {/* ── Main 2-Column Split: Chart & Info (Left) + Swap Widget (Right) ───── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
            {/* Left Column: Interactive Price Chart & Tabs */}
            <div className="lg:col-span-7 flex flex-col gap-5">
              {/* Interactive Price Chart */}
              <TokenPriceChart
                symbol={token.symbol}
                currentPriceUsd={token.priceUsd}
                currentPriceNative={token.priceNative}
                phase={token.phase}
              />

              {/* Overview & Information Box */}
              <div className="liquid-glass rounded-3xl p-5 sm:p-7 shadow-2xl flex flex-col gap-4">
                <div className="flex items-center gap-3 border-b border-white/[0.06] pb-3">
                  <button
                    onClick={() => setActiveTab('overview')}
                    style={activeTab === 'overview' ? { color: theme.color, borderColor: theme.color } : undefined}
                    className={`text-xs sm:text-sm font-bold font-mono transition-colors cursor-pointer ${
                      activeTab === 'overview'
                        ? 'border-b-2 pb-3 -mb-3.5 font-extrabold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Overview & Bio
                  </button>
                  <button
                    onClick={() => setActiveTab('trades')}
                    style={activeTab === 'trades' ? { color: theme.color, borderColor: theme.color } : undefined}
                    className={`text-xs sm:text-sm font-bold font-mono transition-colors cursor-pointer ${
                      activeTab === 'trades'
                        ? 'border-b-2 pb-3 -mb-3.5 font-extrabold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Contract Details
                  </button>
                </div>

                {activeTab === 'overview' ? (
                  <div className="flex flex-col gap-3 text-xs sm:text-sm text-zinc-300 leading-relaxed">
                    <p className="whitespace-pre-wrap">
                      {token.description || `${token.name} ($${token.symbol}) is a fair-launched token on Robinhood Chain using the Pons v2 Bonding Curve protocol.`}
                    </p>

                    <div className="bg-black/50 border border-white/[0.06] rounded-2xl p-4 flex flex-col gap-2 font-mono text-xs text-zinc-400 mt-2">
                      <div className="flex justify-between">
                        <span>Total Fixed Supply:</span>
                        <span className="text-white font-bold">1,000,000,000 ${token.symbol}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Curve Liquidity:</span>
                        <span className="text-theme-light font-bold">100% Minted to Curve</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Anti-Snipe Protection:</span>
                        <span className="text-zinc-200">Decaying Tax Shield Enabled</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Graduation DEX:</span>
                        <span className="text-purple-300">Uniswap v4 (Permanently Locked)</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 font-mono text-xs">
                    <div className="flex items-center justify-between bg-black/60 p-3 rounded-xl border border-white/[0.06]">
                      <span className="text-zinc-400">Token Address:</span>
                      <div className="flex items-center gap-1.5">
                        <code className="text-theme-light font-bold">{token.tokenAddress}</code>
                        <button
                          onClick={() => copyText(token.tokenAddress, 'Token Address')}
                          className="text-zinc-400 hover:text-white cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between bg-black/60 p-3 rounded-xl border border-white/[0.06]">
                      <span className="text-zinc-400">Curve Contract:</span>
                      <div className="flex items-center gap-1.5">
                        <code className="text-zinc-300">{token.curveAddress}</code>
                        <button
                          onClick={() => copyText(token.curveAddress, 'Curve Address')}
                          className="text-zinc-400 hover:text-white cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between bg-black/60 p-3 rounded-xl border border-white/[0.06]">
                      <span className="text-zinc-400">Creator Wallet:</span>
                      <div className="flex items-center gap-1.5">
                        <code className="text-zinc-400">{token.creatorAddress}</code>
                        <button
                          onClick={() => copyText(token.creatorAddress, 'Creator Wallet')}
                          className="text-zinc-400 hover:text-white cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Built-in Swap Widget */}
            <div className="lg:col-span-5 sticky top-24">
              <TokenSwapWidget
                token={token}
                onSwapSuccess={() => {
                  fetchToken()
                  refetchBalance()
                }}
              />
            </div>
          </div>
        </div>
      </main>

      <Footer />

      {/* Claim Creator Fees Modal */}
      <ClaimFeesModal
        open={claimFeesOpen}
        onClose={() => setClaimFeesOpen(false)}
      />
    </div>
  )
}
