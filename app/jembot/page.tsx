'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import SparkleIcon from '@/components/ui/SparkleIcon'
import TokenImage from '@/components/ui/TokenImage'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { toast } from 'react-hot-toast'
import { isAddress } from 'viem'
import { activeChain } from '@/lib/chains'
import { PonsV2TokenInfo } from '@/lib/pons-v2'

export default function JembotAdminPage() {
  const [password, setPassword] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(false)
  const [loginError, setLoginError] = useState('')

  // Tokens state
  const [tokens, setTokens] = useState<PonsV2TokenInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [deletingAddr, setDeletingAddr] = useState<string | null>(null)
  const [clearingAll, setClearingAll] = useState(false)

  // Manual Add state
  const [newCa, setNewCa] = useState('')
  const [addingCa, setAddingCa] = useState(false)

  // Check saved session on mount
  useEffect(() => {
    const saved = sessionStorage.getItem('__jembot_auth')
    if (saved) {
      setPassword(saved)
      verifyPassword(saved)
    }
  }, [])

  async function verifyPassword(pwd: string) {
    setCheckingAuth(true)
    setLoginError('')
    try {
      const res = await fetch('/api/jembot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd, action: 'verify' }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setAuthenticated(true)
        sessionStorage.setItem('__jembot_auth', pwd)
        fetchTokens(pwd)
      } else {
        setLoginError('Katasandi salah. Akses ditolak.')
        sessionStorage.removeItem('__jembot_auth')
      }
    } catch {
      setLoginError('Gagal menghubungkan ke server.')
    } finally {
      setCheckingAuth(false)
    }
  }

  const fetchTokens = useCallback(async (pwd: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/jembot', {
        headers: { 'x-admin-password': pwd },
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setTokens(data.tokens || [])
      } else {
        toast.error(data.error || 'Gagal memuat daftar token')
      }
    } catch {
      toast.error('Network error saat memuat token')
    } finally {
      setLoading(false)
    }
  }, [])

  async function handleDeleteToken(tokenAddr: string, symbol: string) {
    const confirmDelete = window.confirm(`Yakin ingin menghapus token $${symbol} (${tokenAddr.slice(0, 8)}...) dari riwayat platform?`)
    if (!confirmDelete) return

    setDeletingAddr(tokenAddr)
    try {
      const res = await fetch('/api/jembot', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password,
        },
        body: JSON.stringify({ address: tokenAddr }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success(`Token $${symbol} berhasil dihapus dari platform!`)
        setTokens((prev) => prev.filter((t) => t.tokenAddress.toLowerCase() !== tokenAddr.toLowerCase()))
      } else {
        toast.error(data.error || 'Gagal menghapus token')
      }
    } catch {
      toast.error('Error saat menghubungi server')
    } finally {
      setDeletingAddr(null)
    }
  }

  async function handleClearAll() {
    const confirmClear = window.confirm('⚠️ PERINGATAN: Anda akan MENGHAPUS SEMUA RIWAYAT TOKEN dari platform! Tindakan ini tidak dapat dibatalkan. Lanjutkan?')
    if (!confirmClear) return

    setClearingAll(true)
    try {
      const res = await fetch('/api/jembot', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password,
        },
        body: JSON.stringify({ action: 'clear_all' }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success('Semua riwayat token telah dibersihkan!')
        setTokens([])
      } else {
        toast.error(data.error || 'Gagal membersihkan riwayat')
      }
    } catch {
      toast.error('Error saat menghapus riwayat')
    } finally {
      setClearingAll(false)
    }
  }

  async function handleAddToken(e: React.FormEvent) {
    e.preventDefault()
    const clean = newCa.trim()
    if (!clean || !isAddress(clean)) {
      toast.error('Masukkan alamat contract address (0x...) yang valid!')
      return
    }

    setAddingCa(true)
    try {
      const res = await fetch('/api/jembot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password,
          action: 'add',
          address: clean,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success(`Token berhasil didaftarkan ke platform!`)
        setNewCa('')
        fetchTokens(password)
      } else {
        toast.error(data.error || 'Gagal menambahkan token')
      }
    } catch {
      toast.error('Error saat mendaftarkan token')
    } finally {
      setAddingCa(false)
    }
  }

  function handleLogout() {
    sessionStorage.removeItem('__jembot_auth')
    setAuthenticated(false)
    setPassword('')
    setTokens([])
    toast.success('Logout berhasil')
  }

  // 1. LOGIN SCREEN
  if (!authenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#07090c] text-zinc-100 p-4 font-mono select-none">
        <div
          style={{
            boxShadow: '6px 6px 0px 0px #ffffff',
          }}
          className="w-full max-w-md bg-[#0e1115] border-2 border-white rounded-xl p-6 sm:p-8 flex flex-col gap-6"
        >
          {/* Header */}
          <div className="flex flex-col gap-2 border-b-2 border-zinc-800 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SparkleIcon size={28} />
                <span className="font-black text-lg text-white tracking-tight uppercase">PONSCORE // ADMIN</span>
              </div>
              <span className="text-[10px] font-black bg-rose-600 text-white px-2 py-0.5 border border-black shadow-[1px_1px_0px_0px_#000000]">
                RESTRICTED
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-sans">
              Masukkan katasandi otorisasi untuk mengakses panel manajemen riwayat token platform.
            </p>
          </div>

          {/* Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              verifyPassword(password)
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-black uppercase text-zinc-300">
                // ADMIN_PASSWORD
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan katasandi..."
                required
                className="w-full bg-[#14181f] border-2 border-zinc-700 focus:border-white rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 font-mono focus:outline-none shadow-[2px_2px_0px_0px_#000000] focus:shadow-[4px_4px_0px_0px_#ffffff] transition-all"
              />
              {loginError && (
                <p className="text-xs text-rose-400 font-bold mt-1">{loginError}</p>
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              loading={checkingAuth}
              className="w-full py-3 text-xs font-black uppercase shadow-[3px_3px_0px_0px_#000000]"
            >
              {checkingAuth ? 'AUTHENTICATING...' : 'ENTER ADMIN PANEL →'}
            </Button>
          </form>

          {/* Back link */}
          <div className="text-center pt-2 border-t border-zinc-800">
            <Link
              href="/coin"
              className="text-xs font-bold text-zinc-400 hover:text-white transition-colors"
            >
              ← Kembali ke Aplikasi
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // 2. DASHBOARD SCREEN
  return (
    <div className="flex flex-col min-h-screen bg-[#07090c] text-zinc-100 font-mono select-none">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 w-full border-b-2 border-zinc-800 bg-[#0c0f13]/95 backdrop-blur-md">
        <div className="w-full max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SparkleIcon size={32} />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-base sm:text-lg text-white">PONSCORE ADMIN</span>
                <span className="text-[9px] font-black bg-emerald-500 text-black px-1.5 py-0.2 border border-black">
                  ACTIVE
                </span>
              </div>
              <span className="text-[10px] text-zinc-400">ENDPOINT: /jembot</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/coin"
              className="text-xs font-black text-zinc-300 hover:text-white px-3 py-1.5 rounded bg-[#151920] border-2 border-zinc-700 hover:border-white shadow-[2px_2px_0px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 transition-all"
            >
              VIEW DAPP ↗
            </Link>
            <button
              onClick={handleLogout}
              className="text-xs font-black text-rose-400 hover:text-white px-3 py-1.5 rounded bg-rose-950/40 hover:bg-rose-600 border-2 border-rose-800 hover:border-white shadow-[2px_2px_0px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
            >
              LOGOUT [✕]
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6 sm:py-8 flex flex-col gap-6">
        {/* Status Metrics & Quick Action Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card 1: Total Tokens */}
          <div
            style={{ boxShadow: '3px 3px 0px 0px #000000' }}
            className="bg-[#0e1115] border-2 border-white rounded-xl p-4 flex flex-col justify-between"
          >
            <span className="text-xs font-black text-zinc-400 uppercase">// REGISTERED_TOKENS</span>
            <div className="text-3xl font-black text-white mt-2">
              {tokens.length} <span className="text-xs font-normal text-zinc-500 font-sans">items</span>
            </div>
          </div>

          {/* Card 2: Chain */}
          <div
            style={{ boxShadow: '3px 3px 0px 0px #000000' }}
            className="bg-[#0e1115] border-2 border-white rounded-xl p-4 flex flex-col justify-between"
          >
            <span className="text-xs font-black text-zinc-400 uppercase">// NETWORK_ID</span>
            <div className="text-lg font-black text-white mt-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Robinhood Chain (4663)</span>
            </div>
          </div>

          {/* Card 3: Wipe All */}
          <div
            style={{ boxShadow: '3px 3px 0px 0px #000000' }}
            className="bg-[#0e1115] border-2 border-white rounded-xl p-4 flex flex-col justify-between"
          >
            <span className="text-xs font-black text-rose-400 uppercase">// DANGER_ZONE</span>
            <Button
              variant="danger"
              size="sm"
              loading={clearingAll}
              disabled={tokens.length === 0 || clearingAll}
              onClick={handleClearAll}
              className="mt-2 w-full text-xs font-black uppercase shadow-[2px_2px_0px_0px_#000000]"
            >
              {clearingAll ? 'WIPING...' : 'CLEAR ALL TOKEN HISTORY'}
            </Button>
          </div>
        </div>

        {/* Manual Token Registration Box */}
        <div
          style={{ boxShadow: '4px 4px 0px 0px #000000' }}
          className="bg-[#0e1115] border-2 border-white rounded-xl p-4 sm:p-5 flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase text-white flex items-center gap-2">
              <span>// MANUAL_TOKEN_REGISTRATION</span>
            </span>
            <span className="text-[10px] text-zinc-400">TAMBAHKAN KONTRAK KE REGISTRY</span>
          </div>

          <form onSubmit={handleAddToken} className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={newCa}
              onChange={(e) => setNewCa(e.target.value)}
              placeholder="0x... (Alamat Token Contract)"
              className="flex-1 bg-[#14181f] border-2 border-zinc-700 focus:border-white rounded-lg px-3.5 py-2 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none shadow-[2px_2px_0px_0px_#000000]"
            />
            <Button
              type="submit"
              variant="primary"
              loading={addingCa}
              className="px-5 py-2 text-xs font-black uppercase flex-shrink-0"
            >
              + TAMBAHKAN TOKEN
            </Button>
          </form>
        </div>

        {/* Token Management Table */}
        <div
          style={{ boxShadow: '4px 4px 0px 0px #000000' }}
          className="bg-[#0e1115] border-2 border-white rounded-xl overflow-hidden flex flex-col"
        >
          {/* Table Header */}
          <div className="px-4 sm:px-6 py-3.5 border-b-2 border-zinc-800 bg-[#12151a] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-black uppercase text-white">
                // DAFTAR_TOKEN_TERDAFTAR ({tokens.length})
              </span>
            </div>

            <button
              onClick={() => fetchTokens(password)}
              disabled={loading}
              className="text-xs font-bold text-zinc-300 hover:text-black hover:bg-white px-2.5 py-1 rounded bg-zinc-900 border border-zinc-700 hover:border-white shadow-[2px_2px_0px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
            >
              {loading ? 'REFRESHING...' : 'REFRESH ⟳'}
            </button>
          </div>

          {/* Table Body */}
          <div className="p-4 sm:p-6 flex flex-col gap-3">
            {loading && tokens.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[200px] gap-3">
                <Spinner size="lg" />
                <p className="text-xs text-zinc-400">MEMUAT DAFTAR TOKEN...</p>
              </div>
            ) : tokens.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[180px] p-6 text-center gap-3">
                <SparkleIcon size={36} />
                <p className="text-sm font-black uppercase text-white">TIDAK ADA RIWAYAT TOKEN</p>
                <p className="text-xs text-zinc-400 max-w-sm font-sans">
                  Database riwayat token saat ini bersih / kosong.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {tokens.map((token, index) => {
                  const isDeleting = deletingAddr === token.tokenAddress
                  const explorerUrl = `${activeChain.blockExplorers.default.url}/token/${token.tokenAddress}`
                  const mcapUsd = (token.priceUsd || (token.priceNative * 2500) || 0) * 1000000000
                  const mcapStr = mcapUsd >= 1000 ? `$${(mcapUsd / 1000).toFixed(1)}k` : `$${mcapUsd.toFixed(1)}`

                  return (
                    <div
                      key={token.tokenAddress}
                      className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 rounded-lg bg-[#12151a] border-2 border-zinc-800 hover:border-white shadow-[2px_2px_0px_0px_#000000] transition-all"
                    >
                      {/* Left: Index + Token info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs font-black text-zinc-500 font-mono w-5">
                          {String(index + 1).padStart(2, '0')}
                        </span>

                        <div className="w-10 h-10 rounded-lg bg-black border-2 border-white overflow-hidden flex-shrink-0 shadow-[2px_2px_0px_0px_#000000]">
                          <TokenImage
                            src={token.logo}
                            alt={token.symbol}
                            size={40}
                            sparkleSize={20}
                            className="w-full h-full object-cover"
                          />
                        </div>

                        <div className="min-w-0 flex flex-col">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-black text-white truncate">
                              {token.name}
                            </span>
                            <span className="text-xs font-black text-black bg-[var(--theme-color)] px-1.5 py-0.2 border border-black shadow-[1px_1px_0px_0px_#000000]">
                              ${token.symbol}
                            </span>
                            {token.graduated && (
                              <span className="text-[9px] font-black bg-purple-500 text-black px-1.5 py-0.2 border border-black">
                                GRADUATED
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-400 flex-wrap">
                            <span className="font-mono">{token.tokenAddress}</span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(token.tokenAddress)
                                toast.success('Contract address copied!')
                              }}
                              className="text-[10px] text-theme-light hover:underline font-bold"
                            >
                              [COPY]
                            </button>
                            <a
                              href={explorerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-zinc-400 hover:text-white hover:underline"
                            >
                              [EXPLORER ↗]
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* Right: Metrics & Action */}
                      <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 pt-2 md:pt-0 border-zinc-800 flex-shrink-0">
                        <div className="flex flex-col text-left md:text-right">
                          <span className="text-xs font-black text-white">
                            {mcapStr} MCAP
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            CURVE: {token.progress ? token.progress.toFixed(1) : '0.0'}%
                          </span>
                        </div>

                        <Button
                          variant="danger"
                          size="sm"
                          loading={isDeleting}
                          disabled={isDeleting}
                          onClick={() => handleDeleteToken(token.tokenAddress, token.symbol)}
                          className="text-xs font-black py-1.5 px-3 uppercase shadow-[2px_2px_0px_0px_#000000]"
                        >
                          {isDeleting ? 'HAPUS...' : 'HAPUS [✕]'}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
