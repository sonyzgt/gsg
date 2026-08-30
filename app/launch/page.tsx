'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  parseEther,
  getAddress,
  encodeFunctionData,
  zeroAddress,
  formatEther,
  isAddress,
} from 'viem'
import { usePrivy, useLoginWithOAuth } from '@privy-io/react-auth'
import { useWallet } from '@/hooks/useWallet'
import { activeChain } from '@/lib/chains'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import toast from 'react-hot-toast'
import TokenImage from '@/components/ui/TokenImage'
import ClaimFeesModal from '@/components/launchpad/ClaimFeesModal'
import { useTheme } from '@/context/ThemeContext'
import {
  PONS_V2_FACTORY,
  LAUNCH_AND_BUY_ROUTER,
  FACTORY_ABI,
  LAUNCH_AND_BUY_ABI,
  getLaunchFee,
  getPreviewLaunchEconomics,
  generateRandomSalt,
  canLaunch,
} from '@/lib/pons-v2'

export default function LaunchPage() {
  const router = useRouter()
  const { user, authenticated, ready, login, logout } = usePrivy()
  const { address, embeddedWallet, balance, refetchBalance } = useWallet()
  const { theme } = useTheme()
  const [loggingOut, setLoggingOut] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isConnected = !!address || authenticated

  // Navigation Modal States
  const [claimFeesOpen, setClaimFeesOpen] = useState(false)

  // ── Form State ─────────────────────────────────────────────────────────────
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [logo, setLogo] = useState('')
  const [previewLogo, setPreviewLogo] = useState('')
  const [description, setDescription] = useState('')

  // Socials
  const [twitter, setTwitter] = useState('')
  const [telegram, setTelegram] = useState('')
  const [website, setWebsite] = useState('')
  const [discord, setDiscord] = useState('')
  const [farcaster, setFarcaster] = useState('')

  // Economics
  const [creatorTaxBps, setCreatorTaxBps] = useState<number>(100) // 100 - 500 (1.0% - 5.0%)
  const [buybackEnabled, setBuybackEnabled] = useState(false)
  const [initialBuyEth, setInitialBuyEth] = useState('')
  const [extraExemptions, setExtraExemptions] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Contract State
  const [launchFeeWei, setLaunchFeeWei] = useState<bigint>(500000000000000n)
  const [fetchingFee, setFetchingFee] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  // Ref to track the committed server URL — set after successful upload, read at launch time
  const committedLogoRef = useRef<string>('')

  const fetchFee = useCallback(async () => {
    setFetchingFee(true)
    try {
      const fee = await getLaunchFee()
      setLaunchFeeWei(fee > 0n ? fee : 500000000000000n)
    } catch {
      setLaunchFeeWei(500000000000000n)
    } finally {
      setFetchingFee(false)
    }
  }, [])

  useEffect(() => {
    fetchFee()
  }, [fetchFee])
  // Upload image to server and get short URL (< 200 chars for smart contract)
  async function uploadImageToServer(dataUrl: string): Promise<string> {
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.url) return data.url
      }
    } catch (e) {
      console.error('Upload failed:', e)
    }
    return ''
  }

  // Handle direct file upload from user device
  function handleImageFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file (PNG, JPG, WEBP, SVG, GIF)')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new window.Image()
      img.onload = async () => {
        const canvas = document.createElement('canvas')
        const maxDim = 512
        let w = img.width
        let h = img.height
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w)
            w = maxDim
          } else {
            w = Math.round((w * maxDim) / h)
            h = maxDim
          }
        }
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        let raw = event.target?.result as string
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h)
          raw = canvas.toDataURL('image/webp', 0.90)
        }

        // 1. Show user's actual image preview immediately
        setPreviewLogo(raw)
        setLogo(raw)
        committedLogoRef.current = raw
        setUploadingImage(true)

        try {
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: raw }),
          })
          if (res.ok) {
            const data = await res.json()
            const serverUrl = data.relativeUrl || data.url || data.publicUrl || raw
            if (serverUrl) {
              committedLogoRef.current = data.url || serverUrl
              setLogo(serverUrl)
            }
          }
        } catch (e) {
          console.warn('Upload to server failed, using base64 fallback', e)
        } finally {
          setUploadingImage(false)
          toast.success('Logo siap digunakan!')
        }
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)

  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleImageFile(file)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files?.[0]
    if (file) handleImageFile(file)
  }

  const ethBalance = balance ? parseFloat(balance.formatted) : 0
  const initialBuyNum = parseFloat(initialBuyEth) || 0
  const launchFeeEth = parseFloat(formatEther(launchFeeWei))
  const totalEthRequired = launchFeeEth + initialBuyNum

  const isFormValid =
    name.trim().length > 0 &&
    symbol.trim().length > 0 &&
    symbol.trim().length <= 10 &&
    !deploying

  const hasSufficientEth = ethBalance >= totalEthRequired

  async function handleLaunchToken() {
    if (!name.trim()) {
      toast.error('Please enter a Token Name.')
      return
    }
    if (!symbol.trim()) {
      toast.error('Please enter a Token Symbol / Ticker.')
      return
    }
    if (!address) {
      toast.error('Silakan hubungkan wallet Anda terlebih dahulu.')
      login()
      return
    }

    if (ethBalance > 0 && ethBalance < totalEthRequired) {
      toast.error(`Insufficient ETH balance. You need ~${totalEthRequired.toFixed(4)} ETH. Available: ${ethBalance.toFixed(4)} ETH.`)
      return
    }

    if (uploadingImage) {
      toast('⏳ Uploading logo... please wait a moment before launching.', { duration: 3000 })
      return
    }

    setDeploying(true)

    try {
      toast('Deploying token via Server Wallet on Robinhood Chain...')

      let finalLogo = committedLogoRef.current || logo.trim()
      if (finalLogo.startsWith('data:')) {
        try {
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: finalLogo }),
          })
          if (res.ok) {
            const data = await res.json()
            if (data.url) finalLogo = data.url
          }
        } catch { /* continue */ }
      }

      const launchRes = await fetch('/api/launchpad/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          twitterHandle: user?.twitter?.username,
          name: name.trim(),
          symbol: symbol.trim().toUpperCase(),
          logo: finalLogo,
          description: description.trim(),
          socials: {
            twitter: twitter.trim(),
            telegram: telegram.trim(),
            discord: discord.trim(),
            website: website.trim(),
            farcaster: farcaster.trim(),
          },
          creatorTaxBps,
          buybackEnabled,
          initialBuyEth: initialBuyEth || '0',
          extraExemptions,
        }),
      })

      const launchJson = await launchRes.json()

      if (!launchRes.ok || !launchJson.success) {
        throw new Error(launchJson.error || 'Failed to launch token')
      }

      const deployedTokenCa = launchJson.tokenAddress

      if (deployedTokenCa) {
        try {
          const { trackTokenAddress } = await import('@/hooks/useTokens')
          trackTokenAddress(address, deployedTokenCa)
          await fetch('/api/launchpad/tokens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: deployedTokenCa }),
          })
        } catch { /* ignore */ }
      }

      toast.success(`Token $${symbol.toUpperCase()} successfully launched! Redirecting...`)
      await refetchBalance()

      if (deployedTokenCa) {
        window.location.href = `/token/${deployedTokenCa}`
      } else {
        window.location.href = '/coin'
      }
    } catch (err: unknown) {
      console.error('Token launch error:', err)
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Launch failed: ${msg.slice(0, 110)}`)
    } finally {
      setDeploying(false)
    }
  }

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen bg-transparent">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-transparent text-zinc-100 animate-fadeIn">
      {/* Navigation */}
      <Navbar />

      <main className="flex-1 w-full max-w-[1720px] mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 font-mono">
        <div className="max-w-6xl mx-auto flex flex-col gap-6 sm:gap-8">
          {/* Header Banner */}
          <div
            style={{
              boxShadow: `5px 5px 0px 0px ${theme.color}`,
            }}
            className="bg-[#0e1115] border-2 border-white p-6 sm:p-8 rounded-xl relative overflow-hidden"
          >
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="px-2.5 py-0.5 text-xs font-black bg-[var(--theme-color)] text-black border border-black uppercase">
                PONS V2 BONDING CURVE
              </span>
              <span className="px-2.5 py-0.5 text-xs font-black bg-zinc-800 border border-zinc-700 text-zinc-200 uppercase">
                100% FAIR LAUNCH
              </span>
            </div>
            <h1 className="text-xl sm:text-3xl font-black text-white uppercase tracking-tight">
              // LAUNCH TOKEN ON ROBINHOOD CHAIN
            </h1>
            <p className="text-zinc-300 text-xs sm:text-sm mt-2 max-w-2xl font-sans leading-relaxed">
              Mint 1,000,000,000 fixed supply straight to the bonding curve. No dev pre-allocation, built-in anti-snipe tax shield, and automated graduation to permanently locked Uniswap v4 liquidity.
            </p>
          </div>

          {/* Main 2-Column Split: Form (Left) & Interactive Preview (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
            {/* Left Column: Form */}
            <div
              style={{
                boxShadow: `4px 4px 0px 0px #000000`,
              }}
              className="lg:col-span-7 flex flex-col gap-5 bg-[#0e1115] border-2 border-white p-5 sm:p-7 rounded-xl"
            >
              <h2 className="text-sm font-black uppercase text-white flex items-center gap-2 pb-2 border-b-2 border-zinc-800">
                <span>// TOKEN_PARAMETERS</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black uppercase text-zinc-300 mb-1.5 block">
                    TOKEN NAME <span style={{ color: theme.color }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Cyber Frog"
                    className="w-full bg-[#121519] border-2 border-zinc-700 focus:border-white px-3.5 py-2 text-xs sm:text-sm text-white placeholder-zinc-500 rounded-lg shadow-[2px_2px_0px_0px_#000000] focus:shadow-[3px_3px_0px_0px_#ffffff] focus:outline-none transition-all font-sans"
                  />
                </div>

                <div>
                  <label className="text-xs font-black uppercase text-zinc-300 mb-1.5 block">
                    SYMBOL / TICKER <span style={{ color: theme.color }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder="e.g. FROG"
                    className="w-full bg-[#121519] border-2 border-zinc-700 focus:border-white px-3.5 py-2 text-xs sm:text-sm text-white placeholder-zinc-500 rounded-lg shadow-[2px_2px_0px_0px_#000000] focus:shadow-[3px_3px_0px_0px_#ffffff] focus:outline-none transition-all uppercase font-mono font-bold"
                  />
                </div>
              </div>

              {/* Direct Image File Upload */}
              <div>
                <label className="text-xs font-black uppercase text-zinc-300 mb-1.5 block">
                  TOKEN LOGO IMAGE
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileInputChange}
                  accept="image/*"
                  className="hidden"
                />

                {previewLogo || logo ? (
                  <div className="flex items-center justify-between p-3 bg-[#121519] border-2 border-zinc-700 rounded-lg shadow-[2px_2px_0px_0px_#000000]">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-md bg-black border-2 border-white overflow-hidden relative flex-shrink-0 flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={previewLogo || logo}
                          alt="Logo Preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <p className="text-xs font-black text-white uppercase">LOGO READY</p>
                        <p className="text-[10px] text-theme-light font-mono">Verified for deployment</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs px-2.5 py-1 rounded bg-[#181b20] hover:bg-white text-zinc-200 hover:text-black border border-zinc-600 hover:border-white transition-all cursor-pointer font-bold"
                      >
                        CHANGE
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLogo('')
                          setPreviewLogo('')
                          committedLogoRef.current = ''
                        }}
                        className="text-xs px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white border border-black transition-all cursor-pointer font-bold"
                      >
                        REMOVE
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center p-5 bg-[#121519] hover:bg-white/[0.04] border-2 border-dashed border-zinc-700 hover:border-white rounded-lg cursor-pointer transition-all text-center group shadow-[2px_2px_0px_0px_#000000]"
                  >
                    <div className="w-8 h-8 rounded-md bg-black border border-zinc-600 group-hover:border-white flex items-center justify-center text-zinc-400 mb-1.5 shadow-sm">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-xs font-black uppercase text-white group-hover:text-theme-light transition-colors">
                      CHOOSE IMAGE FILE FROM DEVICE
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-0.5 font-sans">
                      PNG, JPG, WEBP, SVG, GIF (Or drag & drop)
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-black uppercase text-zinc-300 mb-1.5 block">DESCRIPTION</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your vision and tokenomics..."
                  className="w-full bg-[#121519] border-2 border-zinc-700 focus:border-white rounded-lg px-3.5 py-2 text-xs text-white placeholder-zinc-500 shadow-[2px_2px_0px_0px_#000000] focus:shadow-[3px_3px_0px_0px_#ffffff] focus:outline-none resize-none font-sans"
                />
              </div>

              {/* Social Links */}
              <div className="bg-[#121519] border-2 border-zinc-800 rounded-lg p-3.5 flex flex-col gap-2.5">
                <span className="text-xs font-black uppercase text-zinc-300">// SOCIAL_LINKS (OPTIONAL)</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={twitter}
                    onChange={(e) => setTwitter(e.target.value)}
                    placeholder="Twitter / X (@handle)"
                    className="w-full bg-[#0b0d10] border border-zinc-700 focus:border-white rounded px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={telegram}
                    onChange={(e) => setTelegram(e.target.value)}
                    placeholder="Telegram (t.me/...)"
                    className="w-full bg-[#0b0d10] border border-zinc-700 focus:border-white rounded px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="Website (https://...)"
                    className="w-full bg-[#0b0d10] border border-zinc-700 focus:border-white rounded px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={discord}
                    onChange={(e) => setDiscord(e.target.value)}
                    placeholder="Discord invite URL"
                    className="w-full bg-[#0b0d10] border border-zinc-700 focus:border-white rounded px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* 1-Click Launch & Buy */}
              <div className="bg-[#121519] border-2 border-zinc-800 rounded-lg p-3.5 flex flex-col gap-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase text-theme-light flex items-center gap-1.5">
                    <span>FIRST BUY IN SAME TRANSACTION</span>
                    <span className="text-[9px] px-1.5 py-0.2 bg-[var(--theme-color)] text-black border border-black font-black">
                      ANTI-SNIPER
                    </span>
                  </label>
                </div>
                <p className="text-[11px] text-zinc-400 font-sans">
                  Buy tokens atomically during launch so front-running bots cannot snipe ahead of you.
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={initialBuyEth}
                    onChange={(e) => setInitialBuyEth(e.target.value)}
                    placeholder="0.0 (Optional ETH amount)"
                    className="flex-1 bg-[#0b0d10] border-2 border-zinc-700 focus:border-white rounded px-3 py-1.5 text-xs font-mono text-white placeholder-zinc-600 focus:outline-none"
                  />
                  <span className="text-xs font-black font-mono text-black bg-[var(--theme-color)] px-3 py-1.5 rounded border border-black">
                    ETH
                  </span>
                </div>
              </div>

              {/* Advanced Settings */}
              <button
                type="button"
                onClick={() => setShowAdvanced((p) => !p)}
                className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 font-mono transition-colors self-start cursor-pointer font-bold uppercase"
              >
                <span>{showAdvanced ? '▼ [HIDE ADVANCED]' : '▶ [ADVANCED TOKEN ECONOMICS]'}</span>
              </button>

              {showAdvanced && (
                <div className="bg-[#121519] border-2 border-zinc-800 rounded-lg p-3.5 flex flex-col gap-3 animate-fadeIn">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold text-zinc-300">
                        Creator Tax: <span className="font-mono text-theme-light">{(creatorTaxBps / 100).toFixed(1)}%</span>
                      </label>
                      <span className="text-[10px] text-zinc-500 font-mono">Min 1.0% • Max 5.0%</span>
                    </div>
                    <input
                      type="range"
                      min="100"
                      max="500"
                      step="10"
                      value={creatorTaxBps}
                      onChange={(e) => setCreatorTaxBps(Number(e.target.value))}
                      style={{ accentColor: theme.color }}
                      className="w-full cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Live Card Preview & Launch CTA */}
            <div className="lg:col-span-5 flex flex-col gap-5 lg:sticky lg:top-24">
              <div
                style={{
                  boxShadow: `4px 4px 0px 0px #000000`,
                }}
                className="bg-[#0e1115] border-2 border-white p-5 sm:p-6 rounded-xl flex flex-col gap-4"
              >
                <span className="text-xs font-black text-zinc-400 uppercase tracking-wider">
                  // LIVE_CARD_PREVIEW
                </span>

                {/* Token Preview Card */}
                <div className="bg-[#111419] border-2 border-zinc-700 rounded-lg p-4 flex flex-col gap-3 shadow-[3px_3px_0px_0px_#000000]">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-md bg-black border-2 border-white overflow-hidden relative flex-shrink-0 flex items-center justify-center shadow-md">
                      {previewLogo || logo ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={previewLogo || logo}
                          alt={symbol || 'TOKEN'}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <svg className="w-5 h-5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-base font-black text-white">
                          {name || 'Token Name'}
                        </span>
                        <span className="text-xs font-black text-theme-light">
                          ${symbol || 'TICKER'}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-400">
                        1,000,000,000 SUPPLY (100% CURVE)
                      </span>
                    </div>
                  </div>

                  {description && (
                    <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed font-sans">
                      {description}
                    </p>
                  )}

                  <div className="bg-black border border-zinc-800 p-2.5 rounded flex flex-col gap-1.5 text-xs">
                    <div className="flex justify-between text-zinc-400">
                      <span>GRADUATION TARGET</span>
                      <span className="font-black text-white">5.0 ETH</span>
                    </div>
                    <div className="w-full h-2 bg-zinc-900 rounded-none overflow-hidden border border-zinc-700">
                      <div
                        className="h-full rounded-none"
                        style={{ backgroundColor: theme.color }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-zinc-500">
                      <span>0.0 ETH RAISED</span>
                      <span>PHASE: BONDING CURVE</span>
                    </div>
                  </div>
                </div>

                {/* Connected Wallet Status Card */}
                <div className="bg-[#121519] border-2 border-zinc-800 rounded-lg p-3.5 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-zinc-300">DEPLOYMENT ACCOUNT</span>
                    {address ? (
                      <span className="text-[9px] font-black bg-[var(--theme-color)] text-black px-1.5 py-0.2 border border-black">
                        CONNECTED
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-500">NOT CONNECTED</span>
                    )}
                  </div>

                  {address ? (
                    <div className="flex flex-col gap-1.5 text-xs">
                      <div className="flex items-center justify-between bg-black px-2.5 py-1.5 rounded border border-zinc-800">
                        <span className="text-zinc-400">Wallet:</span>
                        <div className="flex items-center gap-1.5">
                          <code className="text-theme-light font-bold">
                            {address.slice(0, 6)}...{address.slice(-4)}
                          </code>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(address)
                              toast.success('Address copied!')
                            }}
                            className="text-zinc-400 hover:text-white cursor-pointer p-0.5"
                            title="Copy Address"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between bg-black px-2.5 py-1.5 rounded border border-zinc-800">
                        <span className="text-zinc-400">Your Balance:</span>
                        <span className="font-black text-white">
                          {ethBalance < 0.001 && ethBalance > 0
                            ? ethBalance.toFixed(6)
                            : ethBalance.toFixed(4)}{' '}
                          ETH
                        </span>
                      </div>

                      {!hasSufficientEth && (
                        <div className="p-2.5 bg-amber-950/40 border-2 border-amber-500 rounded text-[11px] text-amber-300 flex flex-col gap-1 mt-1">
                          <span className="font-black text-amber-200 uppercase">// BALANCE SHORTFALL</span>
                          <p className="text-zinc-300 font-sans text-[11px]">
                            Required: <strong className="font-mono text-white">{totalEthRequired.toFixed(4)} ETH</strong>. You have <strong className="font-mono text-amber-300">{ethBalance.toFixed(6)} ETH</strong>.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500 font-sans">
                      Connect your wallet to deploy on Robinhood Chain.
                    </p>
                  )}
                </div>

                {/* Pricing Summary */}
                <div className="bg-black border-2 border-zinc-800 rounded-lg p-3.5 flex flex-col gap-1.5 text-xs text-zinc-400">
                  <div className="flex justify-between">
                    <span>PROTOCOL FEE</span>
                    <span className="text-white font-bold">{launchFeeEth > 0 ? `${launchFeeEth} ETH` : '0 ETH'}</span>
                  </div>
                  {initialBuyNum > 0 && (
                    <div className="flex justify-between">
                      <span>OPENING BUY</span>
                      <span className="font-bold text-theme-light">+{initialBuyNum.toFixed(4)} ETH</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1.5 border-t border-zinc-800 text-white font-black text-sm">
                    <span>TOTAL REQUIRED</span>
                    <span className="text-theme-light">{totalEthRequired.toFixed(4)} ETH</span>
                  </div>
                </div>

                {/* Launch Action */}
                {!isConnected ? (
                  <Button
                    variant="primary"
                    onClick={() => login()}
                    className="w-full py-3.5 text-xs font-black gap-2 shadow-[3px_3px_0px_0px_#000000]"
                  >
                    <span>CONNECT WALLET TO DEPLOY</span>
                  </Button>
                ) : !isFormValid ? (
                  <Button
                    variant="secondary"
                    disabled
                    className="w-full py-3.5 text-xs font-black"
                  >
                    ENTER NAME & SYMBOL
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    onClick={handleLaunchToken}
                    loading={deploying || uploadingImage}
                    className="w-full py-4 text-xs font-black shadow-[3px_3px_0px_0px_#000000]"
                  >
                    {uploadingImage
                      ? 'UPLOADING LOGO...'
                      : deploying
                      ? 'DEPLOYING TO ROBINHOOD CHAIN...'
                      : `DEPLOY $${symbol.toUpperCase() || 'TOKEN'} ON CURVE`}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
      <ClaimFeesModal open={claimFeesOpen} onClose={() => setClaimFeesOpen(false)} />
    </div>
  )
}
