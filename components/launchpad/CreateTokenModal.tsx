'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import SparkleIcon from '@/components/ui/SparkleIcon'
import TokenImage from '@/components/ui/TokenImage'
import {
  parseEther,
  getAddress,
  encodeFunctionData,
  zeroAddress,
  formatEther,
  isAddress,
} from 'viem'
import { usePrivy, useLoginWithOAuth, useWallets } from '@privy-io/react-auth'
import { useWallet } from '@/hooks/useWallet'
import { activeChain } from '@/lib/chains'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'
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

interface CreateTokenModalProps {
  open: boolean
  onClose: () => void
  onTokenCreated?: (tokenAddress?: string) => void
  initialSymbol?: string
  initialName?: string
}

export default function CreateTokenModal({
  open,
  onClose,
  onTokenCreated,
  initialSymbol,
  initialName,
}: CreateTokenModalProps) {
  const { user, authenticated, login } = usePrivy()
  const { wallets } = useWallets()
  const { address, balance, embeddedWallet, refetchBalance } = useWallet()
  const { theme } = useTheme()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const externalWallet = wallets?.find((w) => w.walletClientType !== 'privy')
  const isConnected = !!address || authenticated

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

  // Economics & Advanced
  const [creatorTaxBps, setCreatorTaxBps] = useState<number>(100) // 100 - 500 (1.0% - 5.0%)
  const [buybackEnabled, setBuybackEnabled] = useState(false)
  const [initialBuyEth, setInitialBuyEth] = useState('')
  const [extraExemptions, setExtraExemptions] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Contract State
  const [launchFeeWei, setLaunchFeeWei] = useState<bigint>(500000000000000n)
  const [fetchingFee, setFetchingFee] = useState(false)
  const [deploying, setDeploying] = useState(false)

  // Fetch Launch Fee
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
    if (open) {
      if (initialSymbol) setSymbol(initialSymbol.replace('$', '').toUpperCase())
      if (initialName) setName(initialName)
      fetchFee()
    }
  }, [open, initialSymbol, initialName, fetchFee])

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

  // Handle direct file upload from user's computer/phone
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
        let raw = event.target?.result as string
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h)
          raw = canvas.toDataURL('image/webp', 0.90)
        }
        setPreviewLogo(raw)
        setLogo(raw)
        const serverUrl = await uploadImageToServer(raw)
        if (serverUrl) setLogo(serverUrl)
        toast.success('Logo siap digunakan!')
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

  // Validations & Economics
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

  // â”€â”€ Launch Execution â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // Ensure logo is a full public HTTPS URL accessible by GMGN, DexScreener, Pons
    const FALLBACK_LOGO = 'https://ponscore.fun/sparkle-logo.svg'
    let finalLogo = logo.trim()

    // If still base64, upload now
    if (finalLogo.startsWith('data:')) {
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: finalLogo }),
        })
        if (res.ok) {
          const data = await res.json()
          finalLogo = data.publicUrl || data.relativeUrl || ''
        }
      } catch {
        finalLogo = ''
      }
    }

    // Convert relative path to full HTTPS URL
    if (finalLogo.startsWith('/uploads/') || finalLogo.startsWith('/')) {
      finalLogo = `https://ponscore.fun${finalLogo}`
    }

    // Convert ipfs:// to gateway URL
    if (finalLogo.startsWith('ipfs://')) {
      finalLogo = `https://ipfs.io/ipfs/${finalLogo.replace('ipfs://', '')}`
    }

    // Final validation
    if (!finalLogo || finalLogo.length > 200) {
      finalLogo = FALLBACK_LOGO
    }

    const socialsData = {
      twitter: twitter.trim().slice(0, 100),
      telegram: telegram.trim().slice(0, 100),
      discord: discord.trim().slice(0, 100),
      website: website.trim().slice(0, 100),
      farcaster: farcaster.trim().slice(0, 100),
    }

    // ── ROUTE 1: PRIVY SERVER WALLET (Social / Twitter / Google Login) ──
    if (!externalWallet) {
      setDeploying(true)
      toast('Deploying token via Privy Server Wallet...')
      try {
        const srvRes = await fetch('/api/launchpad/launch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address,
            twitterHandle: user?.twitter?.username,
            name: name.trim().slice(0, 32),
            symbol: symbol.trim().toUpperCase().slice(0, 10),
            logo: finalLogo,
            description: description.trim().slice(0, 280) || `${name} fair launched on Pons v2`,
            socials: socialsData,
            creatorTaxBps: Math.min(1000, Math.max(0, creatorTaxBps ?? 100)),
            buybackEnabled: !!buybackEnabled,
            initialBuyEth: initialBuyEth || '0',
            extraExemptions,
          }),
        })

        const srvJson = await srvRes.json().catch(() => ({}))

        if (!srvRes.ok || !srvJson?.success) {
          throw new Error(srvJson?.error || 'Token deployment failed on server wallet')
        }

        toast.success(`Token $${symbol.toUpperCase()} successfully deployed on-chain!`)
        if (onTokenCreated) onTokenCreated(srvJson.tokenAddress)
        await refetchBalance()
        onClose()
        return
      } catch (err: unknown) {
        console.error('Server Launch error:', err)
        const msg = err instanceof Error ? err.message : 'Launch failed'
        toast.error(msg)
        return
      } finally {
        setDeploying(false)
      }
    }

    // ── ROUTE 2: CONNECTED EXTERNAL WALLET (MetaMask, Rabby, WalletConnect) ──
    let provider: any
    if (externalWallet) {
      try {
        await externalWallet.switchChain(activeChain.id)
      } catch { /* continue */ }
      provider = await externalWallet.getEthereumProvider()
    } else if (typeof window !== 'undefined' && (window as any).ethereum) {
      provider = (window as any).ethereum
    } else {
      toast.error('Wallet provider belum siap. Silakan hubungkan kembali wallet Anda.')
      return
    }

    setDeploying(true)

    try {
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

      // Fetch exact launch fee
      const exactLaunchFee = await getLaunchFee()

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
          if (isAddress(item)) {
            parsedExemptions.push(getAddress(item))
          }
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
        if (onTokenCreated) onTokenCreated(deployedTokenCa)
        handleClose()
      }
    } catch (err: unknown) {
      console.error('Token launch error in modal:', err)
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

  function handleClose() {
    setName('')
    setSymbol('')
    setLogo('')
    setDescription('')
    setTwitter('')
    setTelegram('')
    setWebsite('')
    setDiscord('')
    setFarcaster('')
    setCreatorTaxBps(100)
    setBuybackEnabled(false)
    setInitialBuyEth('')
    setExtraExemptions('')
    setShowAdvanced(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="// LAUNCH_TOKEN">
      <div className="flex flex-col gap-4 max-h-[80vh] overflow-y-auto pr-1 font-mono select-none">
        {/* Info Banner */}
        <div className="bg-[#121519] border-2 border-zinc-800 rounded-lg p-3 flex items-center justify-between gap-3 shadow-[2px_2px_0px_0px_#000000]">
          <div className="flex items-center gap-2">
            <SparkleIcon size={28} className="flex-shrink-0" />
            <div>
              <p className="text-xs font-black uppercase text-white">100% FAIR LAUNCH</p>
              <p className="text-[10px] text-zinc-400 font-sans">
                1B supply minted straight to bonding curve. Automated Uniswap v4 graduation.
              </p>
            </div>
          </div>
        </div>

        {/* Basic Token Details */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-black uppercase text-zinc-300 mb-1 block">
                NAME <span style={{ color: theme.color }}>*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Cyber Frog"
                className="w-full bg-[#121519] border-2 border-zinc-700 focus:border-white rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 shadow-[2px_2px_0px_0px_#000000] focus:shadow-[3px_3px_0px_0px_#ffffff] focus:outline-none transition-all font-sans"
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase text-zinc-300 mb-1 block">
                TICKER <span style={{ color: theme.color }}>*</span>
              </label>
              <input
                type="text"
                required
                maxLength={10}
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="FROG"
                className="w-full bg-[#121519] border-2 border-zinc-700 focus:border-white rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 shadow-[2px_2px_0px_0px_#000000] focus:shadow-[3px_3px_0px_0px_#ffffff] focus:outline-none transition-all uppercase font-mono font-bold"
              />
            </div>
          </div>

          {/* Logo File Upload */}
          <div>
            <label className="text-xs font-black uppercase text-zinc-300 mb-1 block">
              TOKEN LOGO
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
                  <div className="w-10 h-10 rounded-md bg-black border-2 border-white overflow-hidden relative flex-shrink-0 flex items-center justify-center shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewLogo || logo}
                      alt="Token Logo Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-black text-white uppercase">LOGO READY</p>
                    <p className="text-[10px] text-theme-light font-mono">Ready for deploy</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs px-2 py-1 rounded bg-[#181b20] hover:bg-white text-zinc-200 hover:text-black border border-zinc-600 hover:border-white transition-all cursor-pointer font-bold"
                  >
                    CHANGE
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLogo('')
                      setPreviewLogo('')
                    }}
                    className="text-xs px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white border border-black transition-all cursor-pointer font-bold"
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
                className="flex flex-col items-center justify-center p-4 bg-[#121519] hover:bg-white/[0.04] border-2 border-dashed border-zinc-700 hover:border-white rounded-lg cursor-pointer transition-all text-center group shadow-[2px_2px_0px_0px_#000000]"
              >
                <div className="w-8 h-8 rounded-md bg-black border border-zinc-600 group-hover:border-white flex items-center justify-center text-zinc-400 mb-1 shadow-sm">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-xs font-black uppercase text-white group-hover:text-theme-light transition-colors">
                  CHOOSE IMAGE FILE
                </p>
                <p className="text-[10px] text-zinc-500 font-sans">
                  PNG, JPG, WEBP, SVG, GIF
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-black uppercase text-zinc-300 mb-1 block">DESCRIPTION</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell the community about your project..."
              className="w-full bg-[#121519] border-2 border-zinc-700 focus:border-white rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 shadow-[2px_2px_0px_0px_#000000] focus:shadow-[3px_3px_0px_0px_#ffffff] focus:outline-none font-sans resize-none"
            />
          </div>
        </div>

        {/* Social Links (Optional) */}
        <div className="bg-[#121519] border-2 border-zinc-800 rounded-lg p-3 flex flex-col gap-2">
          <span className="text-xs font-black uppercase text-zinc-300">// SOCIAL_LINKS (OPTIONAL)</span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={twitter}
              onChange={(e) => setTwitter(e.target.value)}
              placeholder="Twitter / X (@handle)"
              className="w-full bg-[#0b0d10] border border-zinc-700 focus:border-white rounded px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none"
            />
            <input
              type="text"
              value={telegram}
              onChange={(e) => setTelegram(e.target.value)}
              placeholder="Telegram (t.me/...)"
              className="w-full bg-[#0b0d10] border border-zinc-700 focus:border-white rounded px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none"
            />
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="Website (https://...)"
              className="w-full bg-[#0b0d10] border border-zinc-700 focus:border-white rounded px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none"
            />
            <input
              type="text"
              value={discord}
              onChange={(e) => setDiscord(e.target.value)}
              placeholder="Discord invite URL"
              className="w-full bg-[#0b0d10] border border-zinc-700 focus:border-white rounded px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none"
            />
          </div>
        </div>

        {/* 1-Click Launch & Buy */}
        <div className="bg-[#121519] border-2 border-zinc-800 rounded-lg p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black uppercase text-theme-light flex items-center gap-1.5">
              <span>FIRST BUY IN SAME TRANSACTION</span>
              <span className="text-[8px] font-black px-1 py-0.2 bg-[var(--theme-color)] text-black border border-black">
                ANTI-SNIPER
              </span>
            </label>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <input
              type="number"
              step="any"
              min="0"
              value={initialBuyEth}
              onChange={(e) => setInitialBuyEth(e.target.value)}
              placeholder="0.0 (Optional ETH amount)"
              className="flex-1 bg-[#0b0d10] border-2 border-zinc-700 focus:border-white rounded px-2.5 py-1.5 text-xs font-mono text-white placeholder-zinc-600 focus:outline-none"
            />
            <span className="text-xs font-black font-mono text-black bg-[var(--theme-color)] px-2.5 py-1.5 rounded border border-black">
              ETH
            </span>
          </div>
        </div>

        {/* Advanced Settings Accordion */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 font-mono transition-colors cursor-pointer font-bold uppercase"
          >
            <span>{showAdvanced ? '▼ [HIDE ADVANCED]' : '▶ [ADVANCED TOKEN ECONOMICS]'}</span>
          </button>

          {showAdvanced && (
            <div className="mt-2 bg-[#121519] border-2 border-zinc-800 rounded-lg p-3 flex flex-col gap-2.5 animate-fadeIn">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-zinc-300">
                    Creator Royalty: <span className="font-mono text-theme-light">{(creatorTaxBps / 100).toFixed(1)}%</span>
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

        {/* Connected Wallet Status */}
        {address && (
          <div className="bg-[#121519] border-2 border-zinc-800 rounded-lg p-2.5 flex flex-col gap-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Wallet:</span>
              <div className="flex items-center gap-1.5">
                <code className="text-theme-light font-bold">
                  {address.slice(0, 6)}...{address.slice(-4)}
                </code>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Balance:</span>
              <span className="font-black text-white">
                {ethBalance < 0.001 && ethBalance > 0
                  ? ethBalance.toFixed(6)
                  : ethBalance.toFixed(4)}{' '}
                ETH
              </span>
            </div>
            {!hasSufficientEth && (
              <p className="text-[10px] text-amber-300 font-sans pt-1 border-t border-zinc-800">
                Shortfall: Need {totalEthRequired.toFixed(4)} ETH (Fee + Gas).
              </p>
            )}
          </div>
        )}

        {/* Summary Breakdown */}
        <div className="bg-black border-2 border-zinc-800 rounded-lg p-2.5 flex flex-col gap-1 text-xs text-zinc-400">
          <div className="flex justify-between">
            <span>PROTOCOL FEE:</span>
            <span className="text-white font-bold">
              {fetchingFee ? '...' : launchFeeEth > 0 ? `${launchFeeEth} ETH` : 'FREE'}
            </span>
          </div>
          {initialBuyNum > 0 && (
            <div className="flex justify-between">
              <span>OPENING BUY:</span>
              <span className="font-bold text-theme-light">+{initialBuyNum.toFixed(4)} ETH</span>
            </div>
          )}
          <div className="flex justify-between pt-1 border-t border-zinc-800 text-white font-black">
            <span>TOTAL REQUIRED:</span>
            <span className="text-theme-light">{totalEthRequired.toFixed(4)} ETH</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <Button variant="secondary" onClick={handleClose} disabled={deploying}>
            CANCEL
          </Button>

          {!isConnected ? (
            <Button
              variant="primary"
              onClick={() => login()}
              className="font-black text-xs"
            >
              CONNECT WALLET
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleLaunchToken}
              loading={deploying}
              className="font-black text-xs shadow-[2px_2px_0px_0px_#000000]"
            >
              {deploying
                ? 'DEPLOYING...'
                : initialBuyNum > 0
                ? 'LAUNCH & BUY'
                : 'LAUNCH TOKEN'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

