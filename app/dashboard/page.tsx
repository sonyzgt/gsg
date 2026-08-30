'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { useWallet } from '@/hooks/useWallet'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import Spinner from '@/components/ui/Spinner'
import { useTheme } from '@/context/ThemeContext'
import SparkleIcon from '@/components/ui/SparkleIcon'

interface PointHistoryItem {
  id: string
  type: string
  points: number
  description: string
  tokenAddress?: string
  tokenSymbol?: string
  txHash?: string
  timestamp: number
}

interface UserPointsData {
  twitterHandle: string
  totalPoints: number
  rank: number | null
  updatedAt: number
  history: PointHistoryItem[]
}

interface LeaderboardItem {
  twitterHandle: string
  totalPoints: number
  rank: number
  history: PointHistoryItem[]
}

export default function DashboardPage() {
  const { user } = usePrivy()
  const { address } = useWallet()
  const { theme } = useTheme()
  const twitterUsername = user?.twitter?.username

  const [loading, setLoading] = useState(true)
  const [userPoints, setUserPoints] = useState<UserPointsData | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([])
  const [activeTab, setActiveTab] = useState<'overview' | 'leaderboard'>('overview')

  const fetchPointsData = useCallback(async () => {
    try {
      const handle = twitterUsername || (address ? address : '')
      const [userRes, lbRes] = await Promise.all([
        handle ? fetch(`/api/points?user=${encodeURIComponent(handle)}`) : null,
        fetch(`/api/points?leaderboard=true`),
      ])

      if (userRes && userRes.ok) {
        const userJson = await userRes.json()
        if (userJson.success && userJson.data) {
          setUserPoints(userJson.data)
        }
      }

      if (lbRes.ok) {
        const lbJson = await lbRes.json()
        if (lbJson.success && lbJson.leaderboard) {
          setLeaderboard(lbJson.leaderboard)
        }
      }
    } catch (err) {
      console.error('[Dashboard] Error fetching points:', err)
    } finally {
      setLoading(false)
    }
  }, [twitterUsername, address])

  useEffect(() => {
    fetchPointsData()
    const interval = setInterval(fetchPointsData, 8000)
    return () => clearInterval(interval)
  }, [fetchPointsData])

  const totalPts = userPoints?.totalPoints || 0
  const userRank = userPoints?.rank ? `#${userPoints.rank}` : 'UNRANKED'

  // Calculate Tier
  const tier = totalPts >= 500 ? 'LEGENDARY DEPLOYER' : totalPts >= 200 ? 'PRO DEPLOYER' : totalPts >= 100 ? 'PIONEER DEPLOYER' : 'NEWBIE'

  return (
    <div className="flex flex-col min-h-screen bg-black text-zinc-100 font-mono">
      <Navbar />

      <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col gap-8">
          {/* Header Banner */}
          <div
            style={{ boxShadow: `6px 6px 0px 0px ${theme.color}` }}
            className="bg-[#0e1115] border-2 border-white rounded-xl p-6 sm:p-8 relative overflow-hidden"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase px-2.5 py-0.5 bg-[var(--theme-color)] text-black border border-black">
                    POINTS PROGRAM
                  </span>
                  <span className="text-xs text-zinc-400 font-mono">ROBINHOOD CHAIN [4663]</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                  <span>PONSCORE POINTS DASHBOARD</span>
                  <SparkleIcon size={24} className="text-[var(--theme-color)]" />
                </h1>
                <p className="text-xs sm:text-sm text-zinc-400 max-w-xl font-sans">
                  Deploy tokens and engage on X/Twitter to earn PONS Points. Every token launched using your Twitter account earns +100 Points.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  href="/launch"
                  style={{ boxShadow: '3px 3px 0px 0px #ffffff' }}
                  className="px-5 py-2.5 bg-[var(--theme-color)] text-black border-2 border-black font-black text-xs uppercase hover:opacity-90 active:translate-x-0.5 active:translate-y-0.5 transition-all"
                >
                  DEPLOY TOKEN (+100 PTS)
                </Link>
              </div>
            </div>
          </div>

          {/* Stats Overview Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Points */}
            <div className="bg-[#0e1115] border-2 border-zinc-800 p-5 rounded-lg flex flex-col gap-1 shadow-[3px_3px_0px_0px_#000000]">
              <span className="text-[10px] font-black text-zinc-400 uppercase">// YOUR_POINTS</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-[var(--theme-color)]">
                  {totalPts.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-zinc-400">PTS</span>
              </div>
              <span className="text-[11px] text-zinc-500 font-sans">
                {twitterUsername ? `@${twitterUsername}` : 'Connect Twitter to track'}
              </span>
            </div>

            {/* Leaderboard Rank */}
            <div className="bg-[#0e1115] border-2 border-zinc-800 p-5 rounded-lg flex flex-col gap-1 shadow-[3px_3px_0px_0px_#000000]">
              <span className="text-[10px] font-black text-zinc-400 uppercase">// GLOBAL_RANK</span>
              <span className="text-3xl font-black text-white">{userRank}</span>
              <span className="text-[11px] text-zinc-500 font-sans">Across all Twitter deployers</span>
            </div>

            {/* Deployer Tier */}
            <div className="bg-[#0e1115] border-2 border-zinc-800 p-5 rounded-lg flex flex-col gap-1 shadow-[3px_3px_0px_0px_#000000]">
              <span className="text-[10px] font-black text-zinc-400 uppercase">// STATUS_TIER</span>
              <span className="text-lg font-black text-yellow-400 uppercase tracking-tight">{tier}</span>
              <span className="text-[11px] text-zinc-500 font-sans">Based on deployment activity</span>
            </div>

            {/* Tokens Deployed */}
            <div className="bg-[#0e1115] border-2 border-zinc-800 p-5 rounded-lg flex flex-col gap-1 shadow-[3px_3px_0px_0px_#000000]">
              <span className="text-[10px] font-black text-zinc-400 uppercase">// TOKENS_LAUNCHED</span>
              <span className="text-3xl font-black text-white">
                {userPoints?.history?.filter((h) => h.type === 'TOKEN_DEPLOY').length || 0}
              </span>
              <span className="text-[11px] text-zinc-500 font-sans">+100 PTS awarded per token</span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-3 border-b-2 border-zinc-800 pb-2">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 text-xs font-black uppercase transition-all ${
                activeTab === 'overview'
                  ? 'bg-[var(--theme-color)] text-black border border-black shadow-[2px_2px_0px_0px_#ffffff]'
                  : 'bg-transparent text-zinc-400 hover:text-white border border-transparent'
              }`}
            >
              // YOUR_HISTORY ({userPoints?.history?.length || 0})
            </button>

            <button
              onClick={() => setActiveTab('leaderboard')}
              className={`px-4 py-2 text-xs font-black uppercase transition-all ${
                activeTab === 'leaderboard'
                  ? 'bg-[var(--theme-color)] text-black border border-black shadow-[2px_2px_0px_0px_#ffffff]'
                  : 'bg-transparent text-zinc-400 hover:text-white border border-transparent'
              }`}
            >
              // LEADERBOARD ({leaderboard.length})
            </button>
          </div>

          {/* Main Content Areas */}
          {loading ? (
            <div className="py-20 flex justify-center items-center">
              <Spinner size="lg" />
            </div>
          ) : activeTab === 'overview' ? (
            <div className="flex flex-col gap-6">
              {/* How to earn points card */}
              <div className="bg-[#121519] border-2 border-zinc-800 rounded-lg p-5 flex flex-col gap-3">
                <span className="text-xs font-black text-white uppercase flex items-center gap-2">
                  <span>WAYS TO EARN POINTS</span>
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="bg-black/60 border border-zinc-800 p-4 rounded flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white uppercase">1. Deploy via Twitter / Web DApp</span>
                      <span className="text-[var(--theme-color)] font-black">+100 PTS</span>
                    </div>
                    <p className="text-zinc-400 text-[11px] font-sans">
                      Log in using Twitter on PONSCORE and launch a token on Robinhood Chain.
                    </p>
                  </div>
                  <div className="bg-black/60 border border-zinc-800 p-4 rounded flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white uppercase">2. Deploy via @agent_ponscore</span>
                      <span className="text-[var(--theme-color)] font-black">+100 PTS</span>
                    </div>
                    <p className="text-zinc-400 text-[11px] font-sans">
                      Tweet `@agent_ponscore launch token $SYMBOL [attach image]` on X.
                    </p>
                  </div>
                </div>
              </div>

              {/* History Table */}
              <div className="bg-[#0e1115] border-2 border-zinc-800 rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                  <span className="text-xs font-black text-white uppercase">POINTS HISTORY</span>
                  <span className="text-[10px] text-zinc-500">Auto-updating ledger</span>
                </div>

                {!userPoints?.history || userPoints.history.length === 0 ? (
                  <div className="p-10 text-center flex flex-col items-center gap-2">
                    <span className="text-xs text-zinc-500 font-sans">No points history found yet.</span>
                    <Link
                      href="/launch"
                      className="text-xs text-[var(--theme-color)] font-black uppercase hover:underline"
                    >
                      Deploy your first token to earn +100 PTS ↗
                    </Link>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#121519] text-zinc-400 border-b border-zinc-800 uppercase font-black text-[10px]">
                        <tr>
                          <th className="px-5 py-3">Activity</th>
                          <th className="px-5 py-3">Token</th>
                          <th className="px-5 py-3">Points</th>
                          <th className="px-5 py-3">Date</th>
                          <th className="px-5 py-3 text-right">Explorer</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800 font-mono">
                        {userPoints.history.map((h) => (
                          <tr key={h.id} className="hover:bg-zinc-900/50 transition-colors">
                            <td className="px-5 py-3 font-bold text-white">{h.description}</td>
                            <td className="px-5 py-3 text-zinc-300">
                              {h.tokenSymbol ? `$${h.tokenSymbol}` : '-'}
                            </td>
                            <td className="px-5 py-3 font-black text-[var(--theme-color)]">
                              +{h.points} PTS
                            </td>
                            <td className="px-5 py-3 text-zinc-500 text-[11px]">
                              {new Date(h.timestamp).toLocaleString()}
                            </td>
                            <td className="px-5 py-3 text-right">
                              {h.txHash ? (
                                <a
                                  href={`https://robinhoodchain.blockscout.com/tx/${h.txHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[var(--theme-color)] hover:underline text-[11px]"
                                >
                                  VIEW TX ↗
                                </a>
                              ) : (
                                '-'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Leaderboard Tab */
            <div className="bg-[#0e1115] border-2 border-zinc-800 rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-xs font-black text-white uppercase">TOP TWITTER DEPLOYERS</span>
                <span className="text-[10px] text-zinc-500">Real-time ranking</span>
              </div>

              {leaderboard.length === 0 ? (
                <div className="p-10 text-center text-xs text-zinc-500 font-sans">
                  No deployers registered yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#121519] text-zinc-400 border-b border-zinc-800 uppercase font-black text-[10px]">
                      <tr>
                        <th className="px-5 py-3 w-16">Rank</th>
                        <th className="px-5 py-3">Twitter User</th>
                        <th className="px-5 py-3">Tokens Launched</th>
                        <th className="px-5 py-3 text-right">Total Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800 font-mono">
                      {leaderboard.map((u) => {
                        const isYou = twitterUsername && u.twitterHandle.toLowerCase() === twitterUsername.toLowerCase()
                        return (
                          <tr
                            key={u.twitterHandle}
                            className={`transition-colors ${
                              isYou ? 'bg-[var(--theme-color)]/10 font-bold' : 'hover:bg-zinc-900/50'
                            }`}
                          >
                            <td className="px-5 py-3 font-black">
                              {u.rank === 1 ? (
                                <span className="text-yellow-400">#1 👑</span>
                              ) : u.rank === 2 ? (
                                <span className="text-zinc-300">#2</span>
                              ) : u.rank === 3 ? (
                                <span className="text-amber-600">#3</span>
                              ) : (
                                <span className="text-zinc-500">#{u.rank}</span>
                              )}
                            </td>
                            <td className="px-5 py-3">
                              <a
                                href={`https://x.com/${u.twitterHandle}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-white hover:text-[var(--theme-color)] transition-colors flex items-center gap-1.5"
                              >
                                <span>@{u.twitterHandle}</span>
                                {isYou && (
                                  <span className="text-[10px] bg-[var(--theme-color)] text-black px-1.5 py-0.2 rounded font-black">
                                    YOU
                                  </span>
                                )}
                              </a>
                            </td>
                            <td className="px-5 py-3 text-zinc-400">
                              {u.history?.filter((h) => h.type === 'TOKEN_DEPLOY').length || 0} tokens
                            </td>
                            <td className="px-5 py-3 text-right font-black text-[var(--theme-color)] text-sm">
                              {u.totalPoints.toLocaleString()} PTS
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
