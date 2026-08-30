'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
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

function DashboardContent() {
  const searchParams = useSearchParams()
  const urlUserParam = searchParams.get('user') || ''

  const { user } = usePrivy()
  const { address } = useWallet()
  const { theme } = useTheme()
  const myTwitterUsername = user?.twitter?.username

  const [loading, setLoading] = useState(true)
  const [userPoints, setUserPoints] = useState<UserPointsData | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([])
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'my_points' | 'search'>('leaderboard')
  const [searchQuery, setSearchQuery] = useState(urlUserParam)
  const [searchedUserPoints, setSearchedUserPoints] = useState<UserPointsData | null>(null)
  const [searching, setSearching] = useState(false)

  const fetchPointsData = useCallback(async () => {
    try {
      const handle = myTwitterUsername || (address ? address : '')
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
  }, [myTwitterUsername, address])

  // Search a specific handle
  const handleLookup = useCallback(async (handleToSearch: string) => {
    const clean = handleToSearch.replace('@', '').trim()
    if (!clean) return
    setSearching(true)
    try {
      const res = await fetch(`/api/points?user=${encodeURIComponent(clean)}`)
      if (res.ok) {
        const json = await res.json()
        if (json.success && json.data) {
          setSearchedUserPoints(json.data)
          setActiveTab('search')
        }
      }
    } catch (e) {
      console.error('Error looking up handle:', e)
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    fetchPointsData()
    const interval = setInterval(fetchPointsData, 8000)
    return () => clearInterval(interval)
  }, [fetchPointsData])

  useEffect(() => {
    if (urlUserParam) {
      setSearchQuery(urlUserParam)
      handleLookup(urlUserParam)
    }
  }, [urlUserParam, handleLookup])

  const totalPts = userPoints?.totalPoints || 0
  const userRank = userPoints?.rank ? `#${userPoints.rank}` : 'UNRANKED'

  // Total points across entire system
  const totalSystemPoints = leaderboard.reduce((acc, curr) => acc + (curr.totalPoints || 0), 0)
  const totalDeployers = leaderboard.length

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
                    PUBLIC POINTS & LEADERBOARD
                  </span>
                  <span className="text-xs text-zinc-400 font-mono">OPEN FOR ALL USERS</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                  <span>PONSCORE POINTS PROGRAM</span>
                  <SparkleIcon size={24} className="text-[var(--theme-color)]" />
                </h1>
                <p className="text-xs sm:text-sm text-zinc-400 max-w-xl font-sans">
                  The PONSCORE points system is 100% public. Anyone can track top Twitter creators, inspect deployment points, and check any Twitter handle&apos;s points rank on Robinhood Chain.
                </p>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
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

          {/* Search Any Twitter Handle Public Card */}
          <div className="bg-[#0e1115] border-2 border-zinc-800 p-4 sm:p-6 rounded-xl flex flex-col gap-3 shadow-[3px_3px_0px_0px_#000000]">
            <span className="text-xs font-black text-white uppercase flex items-center gap-2">
              <SparkleIcon size={16} className="text-[var(--theme-color)]" />
              <span>PUBLIC POINTS LOOKUP // CHECK ANY TWITTER USER</span>
            </span>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleLookup(searchQuery)
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 font-mono text-sm">@</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter Twitter handle (e.g. Ponscore)"
                  className="w-full bg-[#14181f] border-2 border-zinc-700 focus:border-white rounded-lg pl-8 pr-4 py-2 text-xs sm:text-sm text-white placeholder-zinc-500 font-mono focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={searching || !searchQuery.trim()}
                className="px-5 py-2.5 bg-[var(--theme-color)] text-black font-black text-xs uppercase border-2 border-black hover:opacity-90 disabled:opacity-50 cursor-pointer shadow-[2px_2px_0px_0px_#ffffff]"
              >
                {searching ? 'SEARCHING...' : 'CHECK POINTS'}
              </button>
            </form>
          </div>

          {/* System Wide Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Points Distributed */}
            <div className="bg-[#0e1115] border-2 border-zinc-800 p-5 rounded-lg flex flex-col gap-1 shadow-[3px_3px_0px_0px_#000000]">
              <span className="text-[10px] font-black text-zinc-400 uppercase">// TOTAL_POINTS_AWARDED</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-[var(--theme-color)]">
                  {totalSystemPoints.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-zinc-400">PTS</span>
              </div>
              <span className="text-[11px] text-zinc-500 font-sans">Across all Twitter creators</span>
            </div>

            {/* Total Deployers */}
            <div className="bg-[#0e1115] border-2 border-zinc-800 p-5 rounded-lg flex flex-col gap-1 shadow-[3px_3px_0px_0px_#000000]">
              <span className="text-[10px] font-black text-zinc-400 uppercase">// ACTIVE_DEPLOYERS</span>
              <span className="text-3xl font-black text-white">{totalDeployers}</span>
              <span className="text-[11px] text-zinc-500 font-sans">Verified Twitter users</span>
            </div>

            {/* Your Balance (If logged in) */}
            <div className="bg-[#0e1115] border-2 border-zinc-800 p-5 rounded-lg flex flex-col gap-1 shadow-[3px_3px_0px_0px_#000000]">
              <span className="text-[10px] font-black text-zinc-400 uppercase">// YOUR_BALANCE</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-white">{totalPts.toLocaleString()}</span>
                <span className="text-xs font-bold text-zinc-400">PTS</span>
              </div>
              <span className="text-[11px] text-zinc-500 font-sans">
                {myTwitterUsername ? `@${myTwitterUsername}` : 'Connect Twitter to track'}
              </span>
            </div>

            {/* Your Global Rank */}
            <div className="bg-[#0e1115] border-2 border-zinc-800 p-5 rounded-lg flex flex-col gap-1 shadow-[3px_3px_0px_0px_#000000]">
              <span className="text-[10px] font-black text-zinc-400 uppercase">// YOUR_RANK</span>
              <span className="text-3xl font-black text-yellow-400">{userRank}</span>
              <span className="text-[11px] text-zinc-500 font-sans">+100 PTS per token launch</span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-3 border-b-2 border-zinc-800 pb-2 flex-wrap">
            <button
              onClick={() => setActiveTab('leaderboard')}
              className={`px-4 py-2 text-xs font-black uppercase transition-all cursor-pointer ${
                activeTab === 'leaderboard'
                  ? 'bg-[var(--theme-color)] text-black border border-black shadow-[2px_2px_0px_0px_#ffffff]'
                  : 'bg-transparent text-zinc-400 hover:text-white border border-transparent'
              }`}
            >
              // PUBLIC LEADERBOARD ({leaderboard.length})
            </button>

            {myTwitterUsername && (
              <button
                onClick={() => setActiveTab('my_points')}
                className={`px-4 py-2 text-xs font-black uppercase transition-all cursor-pointer ${
                  activeTab === 'my_points'
                    ? 'bg-[var(--theme-color)] text-black border border-black shadow-[2px_2px_0px_0px_#ffffff]'
                    : 'bg-transparent text-zinc-400 hover:text-white border border-transparent'
                }`}
              >
                // YOUR HISTORY ({userPoints?.history?.length || 0})
              </button>
            )}

            {searchedUserPoints && (
              <button
                onClick={() => setActiveTab('search')}
                className={`px-4 py-2 text-xs font-black uppercase transition-all cursor-pointer ${
                  activeTab === 'search'
                    ? 'bg-[var(--theme-color)] text-black border border-black shadow-[2px_2px_0px_0px_#ffffff]'
                    : 'bg-transparent text-zinc-400 hover:text-white border border-transparent'
                }`}
              >
                // LOOKUP: @{searchedUserPoints.twitterHandle} ({searchedUserPoints.totalPoints} PTS)
              </button>
            )}
          </div>

          {/* Main Content Areas */}
          {loading ? (
            <div className="py-20 flex justify-center items-center">
              <Spinner size="lg" />
            </div>
          ) : activeTab === 'search' && searchedUserPoints ? (
            /* Searched User Profile View */
            <div className="flex flex-col gap-6">
              <div className="bg-[#0e1115] border-2 border-white rounded-lg p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-[4px_4px_0px_0px_#ffffff]">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-[var(--theme-color)] text-black font-black text-xl flex items-center justify-center border-2 border-white">
                    @{searchedUserPoints.twitterHandle[0]?.toUpperCase()}
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-black text-white">@{searchedUserPoints.twitterHandle}</h2>
                      <span className="text-xs bg-[var(--theme-color)] text-black px-2 py-0.5 font-bold uppercase">
                        {searchedUserPoints.rank ? `Rank #${searchedUserPoints.rank}` : 'Unranked'}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-400 font-sans">
                      {searchedUserPoints.history.length} tokens deployed on Robinhood Chain
                    </span>
                  </div>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black text-[var(--theme-color)]">
                    {searchedUserPoints.totalPoints.toLocaleString()}
                  </span>
                  <span className="text-sm font-bold text-zinc-400">PTS</span>
                </div>
              </div>

              {/* Searched User History */}
              <div className="bg-[#0e1115] border-2 border-zinc-800 rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                  <span className="text-xs font-black text-white uppercase">
                    DEPLOYMENT & POINTS HISTORY FOR @{searchedUserPoints.twitterHandle}
                  </span>
                  <span className="text-[10px] text-zinc-500">Public Record</span>
                </div>

                {searchedUserPoints.history.length === 0 ? (
                  <div className="p-10 text-center text-xs text-zinc-500 font-sans">
                    No points history found for this user yet.
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
                        {searchedUserPoints.history.map((h) => (
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
          ) : activeTab === 'my_points' && myTwitterUsername ? (
            /* Logged in User's History */
            <div className="flex flex-col gap-6">
              <div className="bg-[#0e1115] border-2 border-zinc-800 rounded-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                  <span className="text-xs font-black text-white uppercase">YOUR ACTIVITY & POINTS</span>
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
            /* Global Public Leaderboard Tab */
            <div className="bg-[#0e1115] border-2 border-zinc-800 rounded-lg overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-xs font-black text-white uppercase">TOP TWITTER DEPLOYERS // GLOBAL LEADERBOARD</span>
                <span className="text-[10px] text-zinc-500">Visible to everyone • Real-time</span>
              </div>

              {leaderboard.length === 0 ? (
                <div className="p-10 text-center text-xs text-zinc-500 font-sans">
                  No deployers registered yet. Deploy a token with Twitter to claim Rank #1!
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
                        <th className="px-5 py-3 text-right">Inspect</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800 font-mono">
                      {leaderboard.map((u) => {
                        const isYou = myTwitterUsername && u.twitterHandle.toLowerCase() === myTwitterUsername.toLowerCase()
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
                                className="text-white hover:text-[var(--theme-color)] transition-colors inline-flex items-center gap-1.5"
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
                            <td className="px-5 py-3 text-right">
                              <button
                                onClick={() => handleLookup(u.twitterHandle)}
                                className="text-[10px] font-black text-white hover:text-black hover:bg-[var(--theme-color)] px-2 py-1 border border-zinc-700 hover:border-black rounded transition-all cursor-pointer"
                              >
                                VIEW POINTS ↗
                              </button>
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

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col min-h-screen bg-black text-zinc-100 font-mono items-center justify-center">
          <Spinner size="lg" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  )
}
