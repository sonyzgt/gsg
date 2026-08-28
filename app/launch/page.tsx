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
  const { user, authenticated, ready, logout } = usePrivy()
  const { address, embeddedWallet, balance, refetchBalance } = useWallet()
  const { theme } = useTheme()
  const [loggingOut, setLoggingOut] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Navigation Modal States
  const [claimFeesOpen, setClaimFeesOpen] = useState(false)

  const { initOAuth } = useLoginWithOAuth({
    onComplete: () => setLoggingIn(false),
    onError: () => setLoggingIn(false),
  })

  // ── Form State ─────────────────────────────────────────────────────────────
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [logo, setLogo] = useState('')
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
        const maxDim = 320
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
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h)
          const dataUrl = canvas.toDataURL('image/webp', 0.88)
          setLogo(dataUrl)
          const serverUrl = await uploadImageToServer(dataUrl)
          if (serverUrl) setLogo(serverUrl)
          toast.success('Logo image uploaded!')
        } else {
          const raw = event.target?.result as string
          setLogo(raw)
          const serverUrl = await uploadImageToServer(raw)
          if (serverUrl) setLogo(serverUrl)
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
      toast.error('Wallet not connected. Please log in first.')
      return
    }
    if (!embeddedWallet) {
      toast.error('Wallet provider initializing, please wait a moment.')
      return
    }

    if (ethBalance > 0 && ethBalance < totalEthRequired) {
      toast.error(`Insufficient ETH balance. You need ~${totalEthRequired.toFixed(4)} ETH. Available: ${ethBalance.toFixed(4)} ETH.`)
      return
    }

    setDeploying(true)

    try {
      await embeddedWallet.switchChain(activeChain.id)
      const provider = await embeddedWallet.getEthereumProvider()
      const { createWalletClient, custom } = await import('viem')
      const walletClient = createWalletClient({
        chain: activeChain,
        transport: custom(provider),
      })
      const [account] = await walletClient.getAddresses()

      const userAddr = getAddress(address)
      const salt = generateRandomSalt()
      const launchConfigId = 0n
      const pairToken = zeroAddress

      // Fetch fresh economics hash right before launch (required to pass mismatch check)
      toast('Fetching launch economics...')
      const expectedEconomics = await getPreviewLaunchEconomics(launchConfigId, pairToken)

      // Fetch exact launch fee — MUST be exact or LaunchFeeNotPaid reverts
      const exactLaunchFee = await getLaunchFee()

      // Ensure logo is a short URL <= 200 chars for smart contract validation
      let finalLogo = logo.trim()
      if (!finalLogo || finalLogo.length > 200 || finalLogo.startsWith('data:')) {
        if (finalLogo.startsWith('data:')) {
          const uploaded = await uploadImageToServer(finalLogo)
          finalLogo = uploaded && uploaded.length <= 200 ? uploaded : 'https://ponsfamily.com/pons.png'
        } else {
          finalLogo = 'https://ponsfamily.com/pons.png'
        }
      }

      const socialsData = {
        twitter: twitter.trim().slice(0, 100),
        telegram: telegram.trim().slice(0, 100),
        discord: discord.trim().slice(0, 100),
        website: website.trim().slice(0, 100),
        farcaster: farcaster.trim().slice(0, 100),
      }

      const tokenParams = {
        name: name.trim().slice(0, 32),
        symbol: symbol.trim().toUpperCase().slice(0, 10),
        logo: finalLogo,
        description: description.trim().slice(0, 280) || `${name} fair launched on Pons v2`,
        socials: socialsData,
        creatorFeeRecipient: userAddr, // Must be explicit - zero is rejected by launchAndBuy router
        creatorTaxBps: Math.min(1000, Math.max(0, creatorTaxBps ?? 100)),
        buybackEnabled: !!buybackEnabled,
        expectedEconomics,
        salt,
      }

      const parsedExemptions: `0x${string}`[] = []
      if (extraExemptions.trim()) {
        const list = extraExemptions.split(',').map((s) => s.trim())
        for (const item of list) {
          if (isAddress(item)) parsedExemptions.push(getAddress(item))
        }
      }

      let txHash = ''

      if (initialBuyNum > 0) {
        toast('Deploying token & executing opening buy in 1 transaction...')
        const quoteIn = parseEther(initialBuyEth)
        const totalValue = exactLaunchFee + quoteIn
        const minTokensOut = 0n

        txHash = await walletClient.writeContract({
          account,
          address: LAUNCH_AND_BUY_ROUTER,
          abi: LAUNCH_AND_BUY_ABI,
          functionName: 'launchAndBuy',
          args: [
            tokenParams,
            launchConfigId,
            pairToken,
            quoteIn,
            minTokensOut,
            userAddr,
            parsedExemptions,
          ],
          value: totalValue,
        })
      } else {
        toast('Deploying token directly to factory bonding curve...')

        if (parsedExemptions.length > 0) {
          txHash = await walletClient.writeContract({
            account,
            address: PONS_V2_FACTORY,
            abi: FACTORY_ABI,
            functionName: 'launchToken',
            args: [tokenParams, launchConfigId, pairToken, parsedExemptions],
            value: exactLaunchFee,
          })
        } else {
          txHash = await walletClient.writeContract({
            account,
            address: PONS_V2_FACTORY,
            abi: FACTORY_ABI,
            functionName: 'launchToken',
            args: [tokenParams, launchConfigId, pairToken],
            value: exactLaunchFee,
          })
        }
      }

      toast('Waiting for on-chain confirmation...')
      const { createPublicClient, http, parseEventLogs } = await import('viem')
      const pubClient = createPublicClient({
        chain: activeChain,
        transport: http('https://robinhood-rpc.publicnode.com'),
      })

      const receipt = await pubClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
        retryCount: 30,
        timeout: 90_000,
      })

      let deployedTokenCa = ''

      // 1. Try standard parseEventLogs with FACTORY_ABI
      try {
        const launchedEvents = parseEventLogs({
          abi: FACTORY_ABI,
          eventName: 'TokenLaunched',
          logs: receipt.logs,
        })
        if (launchedEvents.length > 0 && launchedEvents[0].args.token) {
          deployedTokenCa = getAddress(launchedEvents[0].args.token)
        }
      } catch { /* continue */ }

      // 2. Direct Topic0 match: 0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607
      if (!deployedTokenCa) {
        for (const log of receipt.logs) {
          if (
            log.topics &&
            log.topics.length >= 2 &&
            log.topics[0]?.toLowerCase() === '0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607'.toLowerCase()
          ) {
            try {
              const raw = log.topics[1]
              if (raw && raw.length >= 26) {
                const parsed = getAddress('0x' + raw.slice(26))
                if (parsed !== zeroAddress) {
                  deployedTokenCa = parsed
                  break
                }
              }
            } catch { /* continue */ }
          }
        }
      }

      // 3. Fallback scan all non-zero 20-byte indexed topics in receipt
      if (!deployedTokenCa) {
        for (const log of receipt.logs) {
          if (log.topics && log.topics.length >= 2 && log.topics[1]) {
            const rawTopic = log.topics[1]
            if (rawTopic.length >= 26) {
              try {
                const parsed = getAddress('0x' + rawTopic.slice(26))
                if (
                  parsed !== zeroAddress &&
                  parsed.toLowerCase() !== PONS_V2_FACTORY.toLowerCase() &&
                  parsed.toLowerCase() !== userAddr.toLowerCase()
                ) {
                  deployedTokenCa = parsed
                  break
                }
              } catch { /* continue */ }
            }
          }
        }
      }

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
      if (msg.includes('cancel') || msg.includes('reject') || msg.includes('denied') || msg.includes('User rejected')) {
        toast.error('Token launch canceled by user.')
      } else if (msg.includes('insufficient funds') || msg.includes('exceeds the balance') || msg.includes('want')) {
        toast.error(`Insufficient ETH balance for 0.0005 ETH fee + ${initialBuyNum} ETH buy + gas.`)
      } else if (msg.includes('NotWhitelisted') || msg.includes('canLaunch')) {
        toast.error('Factory is currently restricted to whitelisted addresses.')
      } else {
        toast.error(`Launch failed: ${msg.slice(0, 110)}`)
      }
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
      <Navbar
        onLogout={async () => {
          setLoggingOut(true)
          await logout()
        }}
        loggingOut={loggingOut}
      />

      <main className="flex-1 w-full max-w-[1720px] mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10">
        <div className="max-w-6xl mx-auto flex flex-col gap-6 sm:gap-8">
          {/* Header Banner */}
          <div className="liquid-glass p-6 sm:p-8 rounded-3xl shadow-2xl relative overflow-hidden">
            <div
              className="absolute top-0 right-0 w-80 h-80 rounded-full blur-3xl pointer-events-none transition-all duration-700"
              style={{ background: theme.glow }}
            />
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold liquid-pill-active font-mono">
                Pons v2 Bonding Curve
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-bold liquid-pill text-zinc-300 font-mono">
                100% Fair Launch
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight drop-shadow-md">
              Launch a Token on Robinhood Chain
            </h1>
            <p className="text-zinc-300/80 text-xs sm:text-base mt-2 max-w-2xl leading-relaxed">
              Mint 1,000,000,000 fixed supply straight to the bonding curve. No dev pre-allocation, built-in anti-snipe tax shield, and automated graduation to permanently locked Uniswap v4 liquidity.
            </p>
          </div>

          {/* Main 2-Column Split: Form (Left) & Interactive Preview (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
            {/* Left Column: Form */}
            <div className="lg:col-span-7 flex flex-col gap-5 liquid-glass p-5 sm:p-7 rounded-3xl shadow-2xl">
              <h2 className="text-base font-bold text-white flex items-center gap-2 drop-shadow-sm">
                <span>Token Parameters</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-zinc-300 mb-1.5 block">
                    Token Name <span style={{ color: theme.color }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Cyber Frog"
                    className="w-full liquid-pill px-4 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-[var(--theme-color)] rounded-xl"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-300 mb-1.5 block">
                    Symbol / Ticker <span style={{ color: theme.color }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder="e.g. FROG"
                    className="w-full liquid-pill px-4 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-[var(--theme-color)] rounded-xl uppercase font-mono font-bold"
                  />
                </div>
              </div>

              {/* Direct Image File Upload */}
              <div>
                <label className="text-xs font-semibold text-zinc-300 mb-1.5 block">
                  Token Logo Image
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileInputChange}
                  accept="image/*"
                  className="hidden"
                />

                {logo ? (
                  <div className="flex items-center justify-between p-3.5 bg-[#09110d] border border-white/15 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div
                        style={{ borderColor: `${theme.primary}55` }}
                        className="w-14 h-14 rounded-xl bg-black border overflow-hidden relative flex-shrink-0 flex items-center justify-center"
                      >
                        <TokenImage
                          src={logo}
                          alt="Logo Preview"
                          size={56}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">Logo Uploaded</p>
                        <p className="text-[11px] font-mono text-theme-light">Ready for on-chain deployment</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/[0.08] cursor-pointer"
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        onClick={() => setLogo('')}
                        className="text-xs px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 cursor-pointer"
                      >
                        Remove
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
                    className="flex flex-col items-center justify-center p-6 bg-[#09110d] hover:bg-white/[0.04] border-2 border-dashed border-white/[0.12] hover:border-theme rounded-2xl cursor-pointer transition-all text-center group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-black border border-white/[0.08] group-hover:border-theme flex items-center justify-center text-zinc-400 mb-2 shadow-sm">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-xs sm:text-sm font-bold text-zinc-200 group-hover:text-theme-light transition-colors">
                      Click to choose image file from device
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      PNG, JPG, WEBP, SVG, GIF (Or drag & drop image here)
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300 mb-1.5 block">Description</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your vision and tokenomics..."
                  className="w-full liquid-pill focus:border-theme rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-600 focus:outline-none resize-none"
                />
              </div>

              {/* Social Links */}
              <div className="liquid-glass rounded-2xl p-4 flex flex-col gap-3">
                <span className="text-xs font-semibold text-zinc-300">Social Links (Optional)</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={twitter}
                    onChange={(e) => setTwitter(e.target.value)}
                    placeholder="Twitter / X (@handle)"
                    className="w-full liquid-pill focus:border-theme rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none font-mono"
                  />
                  <input
                    type="text"
                    value={telegram}
                    onChange={(e) => setTelegram(e.target.value)}
                    placeholder="Telegram (t.me/...)"
                    className="w-full liquid-pill focus:border-theme rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none font-mono"
                  />
                  <input
                    type="text"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="Website (https://...)"
                    className="w-full liquid-pill focus:border-theme rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none font-mono"
                  />
                  <input
                    type="text"
                    value={discord}
                    onChange={(e) => setDiscord(e.target.value)}
                    placeholder="Discord invite URL"
                    className="w-full liquid-pill focus:border-theme rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* 1-Click Launch & Buy */}
              <div className="liquid-glass rounded-2xl p-4 flex flex-col gap-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-theme-light flex items-center gap-1.5">
                    <span>First Buy in Same Transaction</span>
                    <span className="text-[10px] liquid-pill px-2 py-0.5 rounded-full font-mono text-theme-light border-theme">
                      Anti-Frontrun
                    </span>
                  </label>
                </div>
                <p className="text-[11px] text-zinc-400">
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
                    className="flex-1 liquid-pill focus:border-theme rounded-xl px-4 py-2 text-xs font-mono text-white placeholder-zinc-600 focus:outline-none"
                  />
                  <span className="text-xs font-bold font-mono text-zinc-300 bg-zinc-900 px-3 py-2 rounded-xl border border-white/[0.06]">
                    ETH
                  </span>
                </div>
              </div>

              {/* Advanced Settings */}
              <button
                type="button"
                onClick={() => setShowAdvanced((p) => !p)}
                className="text-xs text-zinc-400 hover:text-theme-light flex items-center gap-1 font-mono transition-colors self-start cursor-pointer"
              >
                <span>{showAdvanced ? '▼ Hide Advanced Economics' : '▶ Advanced Token Economics'}</span>
              </button>

              {showAdvanced && (
                <div className="liquid-glass rounded-2xl p-4 flex flex-col gap-4 animate-fadeIn">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-semibold text-zinc-300">
                        Creator Tax: <span className="font-mono text-theme-light">{(creatorTaxBps / 100).toFixed(1)}%</span>
                      </label>
                      <span className="text-[10px] text-zinc-400 font-mono">Min 1.0% • Max 5.0%</span>
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
              <div className="liquid-glass p-5 sm:p-6 rounded-3xl shadow-2xl flex flex-col gap-4">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider font-mono">
                  Live Token Card Preview
                </span>

                {/* Token Preview Card */}
                <div className="bg-black/60 border border-white/15 rounded-2xl p-4 flex flex-col gap-3 shadow-lg">
                  <div className="flex items-center gap-3">
                    <div
                      style={{ borderColor: `${theme.primary}55` }}
                      className="w-12 h-12 rounded-xl bg-black/50 border border-dashed overflow-hidden relative flex-shrink-0 flex items-center justify-center"
                    >
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo} alt={symbol || 'TOKEN'} className="w-full h-full object-cover" />
                      ) : (
                        <svg className="w-5 h-5 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-base font-bold text-white">
                          {name || 'Token Name'}
                        </span>
                        <span className="text-xs font-mono font-bold text-theme-light">
                          ${symbol || 'TICKER'}
                        </span>
                      </div>
                      <span className="text-[11px] text-zinc-400 font-mono">
                        1,000,000,000 Supply (100% Curve)
                      </span>
                    </div>
                  </div>

                  {description && (
                    <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                      {description}
                    </p>
                  )}

                  <div className="bg-black/50 border border-white/[0.04] p-2.5 rounded-xl flex flex-col gap-1.5 text-xs font-mono">
                    <div className="flex justify-between text-zinc-400">
                      <span>Graduation Target</span>
                      <span className="font-bold text-theme-light">5.0 ETH</span>
                    </div>
                    <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ backgroundColor: theme.color, boxShadow: `0 0 8px ${theme.color}` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-zinc-500">
                      <span>0.0 ETH Raised</span>
                      <span>Phase: Bonding Curve</span>
                    </div>
                  </div>
                </div>

                {/* Connected Wallet & Balance Status Card */}
                <div className="liquid-glass rounded-2xl p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-300">Deployment Account</span>
                    {address ? (
                      <span className="text-[10px] font-mono font-bold text-theme-light liquid-pill px-2 py-0.5 rounded border-theme flex items-center gap-1">
                        <span
                          className="w-1.5 h-1.5 rounded-full animate-pulse"
                          style={{ backgroundColor: theme.color, boxShadow: `0 0 8px ${theme.color}` }}
                        />
                        Connected
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-zinc-500">Not connected</span>
                    )}
                  </div>

                  {address ? (
                    <div className="flex flex-col gap-2 font-mono text-xs">
                      <div className="flex items-center justify-between bg-black/60 px-3 py-2 rounded-xl border border-white/[0.04]">
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

                      <div className="flex items-center justify-between bg-black/60 px-3 py-2 rounded-xl border border-white/[0.04]">
                        <span className="text-zinc-400">Your Balance:</span>
                        <span className="font-bold text-white">
                          {ethBalance < 0.001 && ethBalance > 0
                            ? ethBalance.toFixed(6)
                            : ethBalance.toFixed(4)}{' '}
                          ETH
                        </span>
                      </div>

                      {!hasSufficientEth && (
                        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11px] font-sans text-amber-300 flex flex-col gap-1.5 mt-1">
                          <div className="flex items-center gap-1.5 font-bold text-amber-200">
                            <span>Balance Shortfall</span>
                          </div>
                          <p className="text-zinc-300 leading-relaxed font-sans">
                            Required: <strong className="font-mono text-theme-light">{totalEthRequired.toFixed(4)} ETH</strong> (Protocol fee 0.0005 ETH + gas).
                            You have <strong className="font-mono text-amber-300">{ethBalance.toFixed(6)} ETH</strong>.
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(address)
                                toast.success('Address copied! Transfer ETH to this address.')
                              }}
                              className="text-xs font-semibold px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded-lg transition-colors cursor-pointer"
                            >
                              Copy Address to Deposit
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500 font-sans">
                      Log in to connect your embedded Robinhood Chain wallet.
                    </p>
                  )}
                </div>

                {/* Pricing Summary */}
                <div className="bg-black/60 border border-white/[0.06] rounded-2xl p-4 flex flex-col gap-2 text-xs font-mono text-zinc-400">
                  <div className="flex justify-between">
                    <span>Protocol Launch Fee</span>
                    <span className="text-zinc-200">{launchFeeEth > 0 ? `${launchFeeEth} ETH` : 'Free (0 ETH)'}</span>
                  </div>
                  {initialBuyNum > 0 && (
                    <div className="flex justify-between">
                      <span>Opening Buy Spend</span>
                      <span className="font-bold text-theme-light">+{initialBuyNum.toFixed(4)} ETH</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t border-white/[0.06] text-white font-bold text-sm">
                    <span>Total Required</span>
                    <span className="text-theme-light">{totalEthRequired.toFixed(4)} ETH</span>
                  </div>
                </div>

                {/* Launch Action */}
                {!authenticated || !address ? (
                  <Button
                    variant="primary"
                    onClick={async () => {
                      setLoggingIn(true)
                      await initOAuth({ provider: 'twitter' })
                    }}
                    loading={loggingIn}
                    className="w-full py-3.5 text-sm font-bold gap-2"
                  >
                    <span>Log in with X to Deploy</span>
                  </Button>
                ) : !isFormValid ? (
                  <Button
                    variant="primary"
                    onClick={handleLaunchToken}
                    className="w-full py-3.5 text-sm font-bold opacity-60"
                  >
                    Enter Name & Symbol to Deploy
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    onClick={handleLaunchToken}
                    loading={deploying}
                    className="w-full py-4 text-sm font-extrabold shadow-xl shadow-emerald-950/50"
                  >
                    {deploying ? 'Deploying to Robinhood Chain...' : `Deploy $${symbol || 'TOKEN'} on Curve`}
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
