'use client'

import { useWallet } from '@/hooks/useWallet'
import { activeChain } from '@/lib/chains'
import { useState, useEffect, useCallback } from 'react'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'
import { createPublicClient, http, erc20Abi, formatEther, encodeFunctionData, getAddress } from 'viem'
import { useSendTransaction, useExportWallet } from '@privy-io/react-auth'
import Image from 'next/image'
import { useTheme } from '@/context/ThemeContext'
import SparkleIcon from '@/components/ui/SparkleIcon'

interface WalletCardProps {
  onSend: () => void
  onReceive: () => void
  onSwap: () => void
  onClaimRoyalties?: () => void
}

const WETH_ADDR = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73' as `0x${string}`

const WETH_ABI = [
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'wad', type: 'uint256' }],
    outputs: [],
  },
] as const

export default function WalletCard({ onSend, onReceive, onSwap, onClaimRoyalties }: WalletCardProps) {
  const { address, balance, creatingWallet, createWallet, refetchBalance, embeddedWallet } = useWallet()
  const { theme } = useTheme()
  const { sendTransaction } = useSendTransaction()
  const { exportWallet } = useExportWallet()
  const [copying, setCopying] = useState(false)

  const [wethBalanceRaw, setWethBalanceRaw] = useState<bigint>(0n)
  const [wethBalanceFormatted, setWethBalanceFormatted] = useState<string>('0')
  const [unwrapping, setUnwrapping] = useState(false)

  const fetchWethBalance = useCallback(async () => {
    if (!address) return
    try {
      const pubClient = createPublicClient({ chain: activeChain, transport: http('https://robinhood-rpc.publicnode.com') })
      const bal = await pubClient.readContract({
        address: WETH_ADDR,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [getAddress(address)],
      })
      setWethBalanceRaw(bal)
      const formatted = formatEther(bal)
      setWethBalanceFormatted(parseFloat(formatted) < 0.0001 && bal > 0n ? formatted.slice(0, 8) : parseFloat(formatted).toFixed(4))
    } catch { /* ignore */ }
  }, [address])

  useEffect(() => {
    const t = setTimeout(() => { fetchWethBalance() }, 0)
    const interval = setInterval(fetchWethBalance, 5000)
    return () => {
      clearTimeout(t)
      clearInterval(interval)
    }
  }, [fetchWethBalance])

  async function handleUnwrapWeth() {
    if (!address || wethBalanceRaw === 0n || !embeddedWallet) return
    setUnwrapping(true)
    try {
      await embeddedWallet.switchChain(activeChain.id)
      const provider = await embeddedWallet.getEthereumProvider()
      const { createWalletClient, custom } = await import('viem')
      const walletClient = createWalletClient({
        chain: activeChain,
        transport: custom(provider),
      })
      const [account] = await walletClient.getAddresses()

      const data = encodeFunctionData({
        abi: WETH_ABI,
        functionName: 'withdraw',
        args: [wethBalanceRaw],
      })
      await walletClient.sendTransaction({
        account,
        to: WETH_ADDR,
        data,
      })
      toast.success('Successfully unwrapped WETH to Native ETH!')
      await Promise.all([refetchBalance(), fetchWethBalance()])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed'
      if (msg.includes('cancel') || msg.includes('reject')) {
        toast.error('Unwrap canceled.')
      } else {
        toast.error(`${msg.slice(0, 100)}`)
      }
    } finally {
      setUnwrapping(false)
    }
  }

  async function copyAddress() {
    if (!address) return
    setCopying(true)
    await navigator.clipboard.writeText(address)
    toast.success('Address copied to clipboard!')
    setTimeout(() => setCopying(false), 1500)
  }

  const explorerUrl = `${activeChain.blockExplorers.default.url}/address/${address}`

  return (
    <div className="rounded-3xl liquid-glass shadow-2xl p-4 sm:p-7 w-full relative overflow-hidden">
      {/* Dynamic theme top specular accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] transition-all duration-500"
        style={{
          background: `linear-gradient(to right, transparent, ${theme.color}, transparent)`,
          boxShadow: `0 0 10px ${theme.color}`,
        }}
      />

      {/* Header status */}
      <div className="flex items-center justify-between mb-4 sm:mb-5">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-2 text-xs font-bold text-zinc-200 liquid-pill px-3 py-1 rounded-full font-mono">
            <SparkleIcon size={16} className="flex-shrink-0" />
            Robinhood Chain
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onClaimRoyalties && (
            <button
              onClick={onClaimRoyalties}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full liquid-pill text-xs font-bold text-theme-light border-theme hover:brightness-110 transition-all font-mono cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" style={{ color: theme.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Royalties</span>
            </button>
          )}
          <span className="flex items-center gap-1.5 text-xs text-theme-light liquid-pill px-3 py-1 rounded-full font-mono font-bold">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: theme.color, boxShadow: `0 0 8px ${theme.color}` }}
            />
            Live Sync
          </span>
        </div>
      </div>

      {/* WETH Auto-Unwrap Banner if user holds WETH */}
      {wethBalanceRaw > 0n && (
        <div className="mb-4 sm:mb-5 bg-[#09110d] border border-white/10 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl liquid-pill flex items-center justify-center flex-shrink-0"
              style={{ color: theme.color }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold text-zinc-200">
                Detected <span className="font-mono font-bold text-theme-light">{wethBalanceFormatted} WETH</span>
              </p>
              <p className="text-[11px] text-zinc-400">
                Unwrap to combine directly into your Native ETH balance
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="primary"
            loading={unwrapping}
            onClick={handleUnwrapWeth}
            className="text-xs font-bold py-2 px-3.5 w-full sm:w-auto flex-shrink-0"
          >
            Unwrap to ETH
          </Button>
        </div>
      )}

      {/* Native ETH Balance */}
      <div className="mb-4 sm:mb-6 liquid-pill p-4 sm:p-6 rounded-2xl relative overflow-hidden">
        <div className="flex items-center justify-between mb-1.5 sm:mb-2">
          <span className="text-[11px] sm:text-xs text-zinc-400 uppercase tracking-wider font-bold">
            Native ETH Balance
          </span>
          <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider liquid-pill-active px-2.5 py-0.5 rounded-lg font-bold">
            Layer-2 Orbit
          </span>
        </div>
        <div className="flex items-baseline gap-2 mt-1 flex-wrap">
          <span className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight font-mono break-all drop-shadow-md">
            {balance ? balance.formatted : '0.000000'}
          </span>
          <span className="text-base sm:text-lg font-bold font-mono text-glow-theme">ETH</span>
        </div>
      </div>

      {/* Wallet Address */}
      <div className="mb-5 sm:mb-6">
        <p className="text-[11px] sm:text-xs text-zinc-400 uppercase tracking-wider font-bold mb-1.5 sm:mb-2">
          Account Address
        </p>
        {address ? (
          <div className="flex flex-col gap-2">
            <code
              className="text-[11px] sm:text-xs font-mono text-zinc-200 liquid-pill px-3.5 py-2.5 w-full overflow-hidden text-ellipsis select-all rounded-xl font-bold"
              title={address}
            >
              {address}
            </code>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={copyAddress}
                disabled={copying}
                className="py-2 px-2 rounded-xl liquid-btn-secondary text-zinc-300 hover:text-white transition-all flex items-center justify-center gap-1.5 text-[11px] font-bold cursor-pointer"
                title="Copy Full Address"
              >
                {copying ? (
                  <>
                    <svg className="w-3.5 h-3.5" style={{ color: theme.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="font-mono text-theme-light">Copied</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5 fill-none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>Copy</span>
                  </>
                )}
              </button>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 px-2 rounded-xl liquid-btn-secondary text-zinc-300 hover:text-white transition-all flex items-center justify-center gap-1.5 text-[11px] font-bold cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <span>Explorer</span>
              </a>
              <button
                onClick={() => exportWallet()}
                className="py-2 px-2 rounded-xl liquid-btn-secondary text-zinc-300 hover:text-white transition-all flex items-center justify-center gap-1.5 text-[11px] font-bold cursor-pointer"
                title="Export Private Key"
              >
                <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <span>Export Key</span>
              </button>
            </div>
          </div>
        ) : (
          <Button
            size="sm"
            loading={creatingWallet}
            onClick={() => createWallet()}
            variant="primary"
            className="w-full font-bold"
          >
            {creatingWallet ? 'Creating...' : 'Create Embedded Wallet'}
          </Button>
        )}
      </div>

      {/* Action Buttons: Send, Receive, Swap */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Button
          onClick={onSend}
          variant="secondary"
          className="w-full gap-1.5 sm:gap-2 py-3 text-xs sm:text-sm font-semibold"
          disabled={!address}
        >
          <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
          Send
        </Button>
        <Button
          onClick={onReceive}
          variant="secondary"
          className="w-full gap-1.5 sm:gap-2 py-3 text-xs sm:text-sm font-semibold"
          disabled={!address}
        >
          <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          Receive
        </Button>
        <Button
          onClick={onSwap}
          variant="primary"
          className="w-full gap-1.5 sm:gap-2 py-3 text-xs sm:text-sm font-semibold"
          disabled={!address}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          Swap
        </Button>
      </div>
    </div>
  )
}

