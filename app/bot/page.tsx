'use client'

import { useState, useEffect, useCallback } from 'react'
import Navbar from '@/components/Navbar'
import SparkleIcon from '@/components/ui/SparkleIcon'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { toast } from 'react-hot-toast'
import { useAccount } from 'wagmi'
import { usePrivy } from '@privy-io/react-auth'
import Link from 'next/link'

interface BotUserData {
  twitterId: string
  twitterHandle: string
  name: string
  profileImage?: string
  privyWalletAddress?: string
  walletAddress: string
  createdAt: number
  totalLaunches: number
}

interface SimResult {
  success: boolean
  message: string
  tokenAddress?: string
  txHash?: string
}

export default function TwitterBotPage() {
  const { address } = useAccount()
  const { user: privyUser, authenticated, login } = usePrivy()
  const [handleInput, setHandleInput] = useState('')
  const [user, setUser] = useState<BotUserData | null>(null)
  const [balanceEth, setBalanceEth] = useState('0.0')
  const [loading, setLoading] = useState(false)
  const [refreshingBal, setRefreshingBal] = useState(false)

  // Simulation State
  const [simTweetText, setSimTweetText] = useState('@ponscorebot launch $MEOW Cyber Cat Token on Robinhood Chain')
  const [simImageUrl, setSimImageUrl] = useState('https://ipfs.io/ipfs/bafkreicaxbt5gboi3h3ucjnojh5u2wkxomdt3tmrofv5dseknzfefd3ls4')
  const [simulating, setSimulating] = useState(false)
  const [simResult, setSimResult] = useState<SimResult | null>(null)

  // Withdraw State
  const [withdrawAddress, setWithdrawAddress] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)

  // Auto-fill Privy Address
  const activePrivyWallet = address || privyUser?.wallet?.address || ''
  const privyTwitterHandle = privyUser?.linkedAccounts?.find(
    (a) => a.type === 'twitter_oauth'
  ) as { username?: string } | undefined

  const fetchBalance = useCallback(async (walletAddr: string) => {
    setRefreshingBal(true)
    try {
      const res = await fetch('/api/bot/wallet?address=' + walletAddr)
      const data = await res.json()
      if (data.success) {
        setBalanceEth(parseFloat(data.balanceEth).toFixed(4))
      }
    } catch { /* ignore */ }
    finally { setRefreshingBal(false) }
  }, [])

  const fetchUser = useCallback(async (handle: string) => {
    if (!handle) return
    setLoading(true)
    try {
      const clean = handle.replace('@', '').trim()
      const res = await fetch('/api/bot/auth?handle=' + clean)
      const data = await res.json()
      if (data.success && data.user) {
        setUser(data.user)
        localStorage.setItem('__ponscore_tw_handle', clean)
        fetchBalance(data.user.walletAddress)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [fetchBalance])

  // Load saved handle or Privy twitter on mount
  useEffect(() => {
    if (privyTwitterHandle?.username && !handleInput) {
      setHandleInput(privyTwitterHandle.username)
      fetchUser(privyTwitterHandle.username)
    } else {
      const saved = localStorage.getItem('__ponscore_tw_handle')
      if (saved) {
        setHandleInput(saved)
        fetchUser(saved)
      }
    }
  }, [privyTwitterHandle, fetchUser])

  async function handleConnectTwitter(customHandle?: string) {
    const handleToUse = (customHandle || handleInput || privyTwitterHandle?.username || '').replace('@', '').trim()
    if (!handleToUse) {
      toast.error('Masukkan username Twitter / X Anda!')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/bot/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          twitterHandle: handleToUse,
          name: handleToUse,
          privyUserId: privyUser?.id,
          privyWalletAddress: activePrivyWallet || undefined,
        }),
      })
      const data = await res.json()
      if (data.success && data.user) {
        setUser(data.user)
        localStorage.setItem('__ponscore_tw_handle', handleToUse)
        toast.success('Twitter @' + handleToUse + ' berhasil terhubung dengan Wallet Privy!')
        fetchBalance(data.user.walletAddress)
      } else {
        toast.error(data.error || 'Gagal menghubungkan Twitter')
      }
    } catch {
      toast.error('Terjadi kesalahan koneksi')
    } finally {
      setLoading(false)
    }
  }

  async function handleSimulateLaunch() {
    if (!user) {
      toast.error('Hubungkan akun Twitter terlebih dahulu!')
      return
    }
    setSimulating(true)
    setSimResult(null)
    try {
      const res = await fetch('/api/bot/simulate-tweet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          twitterHandle: user.twitterHandle,
          tweetText: simTweetText,
          imageUrl: simImageUrl,
        }),
      })
      const data = await res.json()
      setSimResult(data)
      if (data.success) {
        toast.success('Token berhasil di-deploy oleh Twitter Bot!')
        fetchBalance(user.walletAddress)
      } else {
        toast.error(data.message || 'Eksekusi gagal')
      }
    } catch {
      toast.error('Gagal menjalankan simulasi')
    } finally {
      setSimulating(false)
    }
  }

  async function handleWithdraw() {
    if (!user || !withdrawAddress) {
      toast.error('Masukkan alamat tujuan penarikan!')
      return
    }
    setWithdrawing(true)
    try {
      const res = await fetch('/api/bot/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          twitterHandle: user.twitterHandle,
          destinationAddress: withdrawAddress,
          amountEth: withdrawAmount || undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Berhasil menarik ' + data.withdrawnEth + ' ETH!')
        setWithdrawAmount('')
        fetchBalance(user.walletAddress)
      } else {
        toast.error(data.error || 'Penarikan gagal')
      }
    } catch {
      toast.error('Terjadi kesalahan penarikan')
    } finally {
      setWithdrawing(false)
    }
  }

  function copyText(text: string, label = 'Tersalin!') {
    navigator.clipboard.writeText(text)
    toast.success(label)
  }

  return (
    <div className="min-h-screen bg-[#07080a] text-white flex flex-col font-mono selection:bg-[var(--theme-color)] selection:text-black">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex flex-col gap-6">
        
        {/* Header Banner */}
        <div className="p-4 sm:p-6 bg-[#0e1115] border-2 border-white rounded-xl shadow-[4px_4px_0px_0px_#000000] relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-[var(--theme-color)] animate-pulse" />
              <span className="text-[11px] font-black tracking-widest uppercase text-theme-light">
                // PONSCORE_X_BOT_PROTOCOL
              </span>
              <span className="px-1.5 py-0.2 bg-zinc-800 border border-zinc-700 text-[9px] font-bold text-zinc-300">
                PRIVY INTEGRATED
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black uppercase text-white tracking-tight">
              LAUNCH TOKENS DIRECTLY ON X (TWITTER)
            </h1>
            <p className="text-xs text-zinc-400 max-w-2xl mt-1 font-sans">
              Deploy fair-launch bonding curve tokens on Robinhood Chain simply by tagging <strong className="text-white font-mono">@ponscorebot</strong> in a tweet. All token creator rights & royalties link directly to your <strong className="text-white">Privy Wallet</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="https://x.com"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 bg-black border-2 border-zinc-700 hover:border-white text-xs font-black text-white hover:text-black hover:bg-[var(--theme-color)] shadow-[2px_2px_0px_0px_#000000] transition-all flex items-center gap-2 rounded"
            >
              <span>FOLLOW @PONSCOREBOT</span>
              <span>↗</span>
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Account & Wallet Setup (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            
            {/* 1. Twitter & Privy Account Card */}
            <div className="bg-[#0e1115] border-2 border-white rounded-xl p-4 sm:p-5 shadow-[4px_4px_0px_0px_#000000] flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h2 className="text-xs font-black uppercase text-white flex items-center gap-2">
                  <span>[01]</span>
                  <span>LINK TWITTER & PRIVY WALLET</span>
                </h2>
                {user && (
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded">
                    LINKED
                  </span>
                )}
              </div>

              {authenticated && activePrivyWallet && (
                <div className="p-3 bg-black/80 border border-zinc-800 rounded flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-400 font-bold">YOUR ACTIVE PRIVY WALLET:</span>
                    <span className="text-[9px] text-emerald-400 bg-emerald-950 border border-emerald-800 px-1.5 py-0.2">LOGGED IN</span>
                  </div>
                  <div className="text-xs text-amber-300 font-mono break-all font-bold">
                    {activePrivyWallet}
                  </div>
                </div>
              )}

              {!user ? (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-zinc-400 font-sans">
                    Masukkan username Twitter / X Anda untuk menghubungkan ke Wallet Privy:
                  </p>

                  {privyTwitterHandle?.username ? (
                    <Button
                      onClick={() => handleConnectTwitter(privyTwitterHandle.username)}
                      disabled={loading}
                      variant="primary"
                      className="w-full py-2.5 text-xs font-black"
                    >
                      {loading ? <Spinner size="sm" /> : `CONNECT AS @${privyTwitterHandle.username}`}
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">@</span>
                        <input
                          type="text"
                          value={handleInput}
                          onChange={(e) => setHandleInput(e.target.value)}
                          placeholder="your_twitter_handle"
                          className="w-full bg-black border-2 border-zinc-700 pl-8 pr-3 py-2 text-xs text-white placeholder-zinc-600 focus:border-white focus:outline-none"
                        />
                      </div>
                      <Button
                        onClick={() => handleConnectTwitter()}
                        disabled={loading}
                        variant="primary"
                        className="px-4 text-xs font-black"
                      >
                        {loading ? <Spinner size="sm" /> : 'CONNECT'}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between p-3 bg-black border border-zinc-800 rounded">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-full bg-[var(--theme-color)] text-black font-black flex items-center justify-center text-sm border-2 border-white">
                        @{user.twitterHandle.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xs font-black text-white">@{user.twitterHandle}</div>
                        <div className="text-[10px] text-zinc-400">{user.totalLaunches} Tokens Launched</div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setUser(null)
                        localStorage.removeItem('__ponscore_tw_handle')
                      }}
                      className="text-[10px] text-rose-400 hover:underline cursor-pointer"
                    >
                      Disconnect
                    </button>
                  </div>

                  {user.privyWalletAddress && (
                    <div className="p-2.5 bg-zinc-900/90 border border-zinc-700 rounded flex flex-col gap-0.5 text-[10px]">
                      <span className="text-zinc-400 font-bold">OFFICIAL CREATOR WALLET:</span>
                      <span className="text-emerald-300 font-mono break-all">{user.privyWalletAddress}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2. Fuel Launch Wallet Card */}
            {user && (
              <div className="bg-[#0e1115] border-2 border-white rounded-xl p-4 sm:p-5 shadow-[4px_4px_0px_0px_#000000] flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <h2 className="text-xs font-black uppercase text-white flex items-center gap-2">
                    <span>[02]</span>
                    <span>BOT FUEL WALLET</span>
                  </h2>
                  <button
                    onClick={() => fetchBalance(user.walletAddress)}
                    disabled={refreshingBal}
                    className="text-[10px] text-theme-light hover:underline flex items-center gap-1 cursor-pointer font-bold"
                  >
                    <span>REFRESH</span>
                    {refreshingBal && <Spinner size="sm" />}
                  </button>
                </div>

                {/* Balance Display */}
                <div className="p-3 bg-black border-2 border-zinc-800 rounded flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-zinc-400 font-bold">AVAILABLE FUEL BALANCE</div>
                    <div className="text-xl font-black text-white flex items-baseline gap-1 mt-0.5">
                      <span>{balanceEth}</span>
                      <span className="text-xs text-theme-light font-bold">ETH</span>
                    </div>
                  </div>

                  <span className="text-[10px] font-bold px-2 py-1 bg-zinc-900 border border-zinc-700 text-zinc-300">
                    Chain ID: 4663
                  </span>
                </div>

                {/* Deposit Address Box */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] text-zinc-400 font-bold uppercase">
                    Deposit Fuel Address (Kirim ETH ke sini untuk biaya deploy):
                  </span>
                  <div className="flex items-center gap-2 p-2.5 bg-black border border-zinc-700 rounded select-all text-xs font-mono break-all">
                    <span className="text-amber-300 font-bold flex-1">{user.walletAddress}</span>
                    <button
                      onClick={() => copyText(user.walletAddress, 'Alamat wallet disalin!')}
                      className="px-2 py-1 bg-zinc-800 hover:bg-white hover:text-black border border-zinc-600 text-[10px] font-bold cursor-pointer transition-all rounded"
                    >
                      COPY
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-500 font-sans">
                    💡 Biaya deploy adalah 0.0005 ETH per token. Saldo ini hanya digunakan untuk membayar gas fee & launch fee saat Anda ngetweet.
                  </p>
                </div>

                {/* Withdraw Section */}
                <div className="pt-3 border-t border-zinc-800/80 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                    <span>Tarik Saldo Fuel (Withdraw)</span>
                    {activePrivyWallet && (
                      <button
                        onClick={() => setWithdrawAddress(activePrivyWallet)}
                        className="text-[10px] text-theme-light hover:underline cursor-pointer"
                      >
                        Pakai Alamat Privy Saya
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      value={withdrawAddress}
                      onChange={(e) => setWithdrawAddress(e.target.value)}
                      placeholder="0x Alamat Penerima..."
                      className="w-full bg-black border border-zinc-700 px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:border-white focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        placeholder="Jumlah ETH (Kosongkan untuk Max)"
                        className="flex-1 bg-black border border-zinc-700 px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:border-white focus:outline-none"
                      />
                      <Button
                        onClick={handleWithdraw}
                        disabled={withdrawing || parseFloat(balanceEth) <= 0.0001}
                        size="sm"
                        variant="secondary"
                        className="px-3 text-xs font-bold"
                      >
                        {withdrawing ? <Spinner size="sm" /> : 'WITHDRAW'}
                      </Button>
                    </div>
                  </div>
                </div>

              </div>
            )}

          </div>

          {/* Right Column: How to Tweet & Interactive Test Simulator (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            
            {/* 1. Tweet Guide & Syntax Rules */}
            <div className="bg-[#0e1115] border-2 border-white rounded-xl p-4 sm:p-5 shadow-[4px_4px_0px_0px_#000000] flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h2 className="text-xs font-black uppercase text-white flex items-center gap-2">
                  <span>[03]</span>
                  <span>HOW TO LAUNCH VIA TWITTER (X)</span>
                </h2>
                <span className="text-[10px] font-bold text-amber-400 bg-amber-950/60 border border-amber-800 px-2 py-0.5 rounded">
                  SYNTAX GUIDE
                </span>
              </div>

              <div className="flex flex-col gap-3 text-xs text-zinc-300 font-sans leading-relaxed">
                <p>
                  Untuk meluncurkan token secara instan dari akun Twitter Anda, buat Tweet baru atau balas tweet siapa saja dengan format berikut:
                </p>

                {/* Code Format Block */}
                <div className="p-3.5 bg-black border-2 border-zinc-700 rounded-lg text-xs font-mono flex flex-col gap-2">
                  <div className="text-zinc-500 font-bold">// TWEET FORMAT:</div>
                  <div className="text-theme-light font-bold text-sm">
                    @ponscorebot launch $TICKER Name Description
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    📎 <strong>Sertakan Foto/Gambar:</strong> Lampirkan gambar yang ingin Anda jadikan logo token langsung di tweet tersebut!
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-2.5 bg-black/50 border border-zinc-800 rounded">
                    <div className="text-[10px] text-theme-light font-bold">1. TAG BOT</div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">Sebut @ponscorebot di awal atau di dalam tweet Anda.</div>
                  </div>
                  <div className="p-2.5 bg-black/50 border border-zinc-800 rounded">
                    <div className="text-[10px] text-theme-light font-bold">2. SYMBOL & NAME</div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">Gunakan tanda dollar (misal: $CACHCAT) diikuti nama token.</div>
                  </div>
                  <div className="p-2.5 bg-black/50 border border-zinc-800 rounded">
                    <div className="text-[10px] text-theme-light font-bold">3. AUTO-DEPLOY</div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">Bot mengeksekusi smart contract Pons v2 on-chain dalam 3-5 detik.</div>
                  </div>
                  <div className="p-2.5 bg-black/50 border border-zinc-800 rounded">
                    <div className="text-[10px] text-theme-light font-bold">4. PRIVY CREATOR</div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">Semua 1% creator tax & token tercatat atas Wallet Privy Anda.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Interactive In-Browser Tweet Simulator */}
            <div className="bg-[#0e1115] border-2 border-white rounded-xl p-4 sm:p-5 shadow-[4px_4px_0px_0px_#000000] flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h2 className="text-xs font-black uppercase text-white flex items-center gap-2">
                  <span>[04]</span>
                  <span>INTERACTIVE TWEET SIMULATOR & TESTER</span>
                </h2>
                <span className="text-[10px] font-bold text-sky-400 bg-sky-950/60 border border-sky-800 px-2 py-0.5 rounded">
                  LIVE TESTER
                </span>
              </div>

              <div className="flex flex-col gap-3">
                <p className="text-xs text-zinc-400 font-sans">
                  Uji coba logika parser dan eksekusi on-chain Twitter Bot secara langsung dari browser:
                </p>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-zinc-400 font-bold">SIMULASI ISI TWEET:</label>
                  <textarea
                    rows={3}
                    value={simTweetText}
                    onChange={(e) => setSimTweetText(e.target.value)}
                    className="w-full bg-black border-2 border-zinc-700 p-2.5 text-xs text-white focus:border-white focus:outline-none font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-zinc-400 font-bold">URL LOGO TOKEN (IPFS / IMAGE):</label>
                  <input
                    type="text"
                    value={simImageUrl}
                    onChange={(e) => setSimImageUrl(e.target.value)}
                    className="w-full bg-black border border-zinc-700 px-3 py-1.5 text-xs text-white focus:border-white focus:outline-none font-mono"
                  />
                </div>

                <Button
                  onClick={handleSimulateLaunch}
                  disabled={simulating || !user}
                  variant="primary"
                  className="w-full py-2.5 text-xs font-black uppercase"
                >
                  {simulating ? <Spinner size="sm" /> : '🚀 TEST EXECUTE TWEET LAUNCH'}
                </Button>

                {/* Simulator Result Output */}
                {simResult && (
                  <div className={'p-3.5 rounded border-2 text-xs font-mono ' + (simResult.success ? 'bg-emerald-950/40 border-emerald-600 text-emerald-200' : 'bg-rose-950/40 border-rose-600 text-rose-200')}>
                    <div className="font-bold uppercase text-[11px] mb-1">
                      {simResult.success ? 'BOT RESPONSE (SUCCESS):' : 'BOT RESPONSE (ERROR):'}
                    </div>
                    <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">
                      {simResult.message}
                    </pre>

                    {simResult.tokenAddress && (
                      <div className="mt-3 pt-2 border-t border-emerald-700/60 flex items-center justify-between">
                        <Link
                          href={'/token/' + simResult.tokenAddress}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-black font-bold text-[11px] rounded"
                        >
                          View Token Page ↗
                        </Link>
                        <a
                          href={'https://robinhoodchain.blockscout.com/tx/' + simResult.txHash}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] underline text-emerald-300"
                        >
                          View on Blockscout ↗
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>

      </main>
    </div>
  )
}
