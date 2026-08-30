'use client'

import { useWallet } from '@/hooks/useWallet'
import { activeChain } from '@/lib/chains'
import { useState, useEffect, useCallback } from 'react'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'
import { createPublicClient, http, erc20Abi, formatEther, encodeFunctionData, getAddress } from 'viem'
import { useSendTransaction, usePrivy, useWallets } from '@privy-io/react-auth'
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
  const { user, logout } = usePrivy()
  const { wallets } = useWallets()
  const [copying, setCopying] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

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
    <div
      style={{
        boxShadow: `5px 5px 0px 0px ${theme.color}`,
      }}
      className="rounded-xl bg-[#0e1115] border-2 border-white p-5 sm:p-7 w-full relative overflow-hidden select-none font-mono"
    >
      {/* Header status */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-zinc-800">
        <div className="flex items-center gap-2">
          <SparkleIcon size={24} className="flex-shrink-0" />
          <span className="text-xs font-black uppercase text-white">
            // WALLET_CORE
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onClaimRoyalties && (
            <button
              onClick={onClaimRoyalties}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--theme-color)] text-black border border-black shadow-[2px_2px_0px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none text-xs font-black uppercase cursor-pointer"
            >
              <span>ROYALTIES</span>
            </button>
          )}
          <span className="flex items-center gap-1.5 text-[10px] font-black px-2 py-0.5 bg-zinc-900 border border-zinc-700 text-theme-light rounded">
            <span
              className="w-1.5 h-1.5 rounded-none"
              style={{ backgroundColor: theme.color }}
            />
            SYNCED
          </span>
        </div>
      </div>

      {/* WETH Auto-Unwrap Banner */}
      {wethBalanceRaw > 0n && (
        <div className="mb-4 bg-[#14181f] border-2 border-amber-400 p-3 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 shadow-[3px_3px_0px_0px_#000000]">
          <div>
            <p className="text-xs font-black text-amber-300 uppercase">
              DETECTED {wethBalanceFormatted} WETH
            </p>
            <p className="text-[10px] text-zinc-400 font-sans">
              Unwrap to combine directly into your Native ETH balance
            </p>
          </div>
          <Button
            size="sm"
            variant="primary"
            loading={unwrapping}
            onClick={handleUnwrapWeth}
            className="text-xs font-black py-1 px-3 w-full sm:w-auto flex-shrink-0"
          >
            UNWRAP
          </Button>
        </div>
      )}

      {/* Native ETH Balance */}
      <div className="mb-5 bg-[#12151a] border-2 border-zinc-700 p-4 sm:p-5 rounded-lg shadow-[3px_3px_0px_0px_#000000] relative overflow-hidden">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] sm:text-xs text-zinc-400 uppercase font-black">
            // NATIVE_ETH_BALANCE
          </span>
          <span className="text-[9px] font-black uppercase bg-zinc-800 text-zinc-300 border border-zinc-700 px-1.5 py-0.5 rounded">
            ROBINHOOD L2
          </span>
        </div>
        <div className="flex items-baseline gap-2 mt-1 flex-wrap">
          <span className="text-3xl sm:text-4xl font-black text-white tracking-tight break-all">
            {balance ? balance.formatted : '0.000000'}
          </span>
          <span className="text-sm font-black text-theme-light">ETH</span>
        </div>
      </div>

      {/* Wallet Address */}
      <div className="mb-5">
        <p className="text-[10px] text-zinc-400 uppercase font-black mb-1.5">
          ACCOUNT ADDRESS
        </p>
        {address ? (
          <div className="flex flex-col gap-2">
            <code
              className="text-[11px] font-mono text-zinc-200 bg-[#12151a] border-2 border-zinc-700 px-3 py-2 w-full overflow-hidden text-ellipsis select-all rounded font-bold"
              title={address}
            >
              {address}
            </code>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={copyAddress}
                disabled={copying}
                className="py-1.5 px-2 rounded bg-[#181b20] border-2 border-zinc-700 hover:border-white text-zinc-300 hover:text-white transition-all flex items-center justify-center gap-1.5 text-[10px] font-black shadow-[2px_2px_0px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer uppercase"
                title="Copy Full Address"
              >
                {copying ? 'COPIED' : 'COPY'}
              </button>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-1.5 px-2 rounded bg-[#181b20] border-2 border-zinc-700 hover:border-white text-zinc-300 hover:text-white transition-all flex items-center justify-center gap-1.5 text-[10px] font-black shadow-[2px_2px_0px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer uppercase"
              >
                EXPLORER
              </a>
            </div>
            <button
              onClick={async () => {
                setDisconnecting(true)
                try {
                  if (Array.isArray(wallets) && wallets.length > 0) {
                    await Promise.allSettled(
                      wallets.map((w) => (typeof w.disconnect === 'function' ? w.disconnect() : Promise.resolve()))
                    )
                  }
                  await logout()
                  toast.success('Wallet disconnected')
                } catch (e) {
                  console.warn(e)
                } finally {
                  setDisconnecting(false)
                }
              }}
              disabled={disconnecting}
              className="py-1.5 px-2 w-full rounded bg-rose-950/40 border-2 border-rose-800 hover:border-white text-rose-300 hover:text-white transition-all flex items-center justify-center gap-1.5 text-[10px] font-black shadow-[2px_2px_0px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer uppercase"
              title="Disconnect Wallet"
            >
              {disconnecting ? 'DISCONNECTING...' : 'DISCONNECT'}
            </button>
          </div>
        ) : (
          <Button
            size="sm"
            loading={creatingWallet}
            onClick={() => createWallet()}
            variant="primary"
            className="w-full font-black text-xs"
          >
            {creatingWallet ? 'CREATING...' : 'CREATE EMBEDDED WALLET'}
          </Button>
        )}
      </div>



      {/* Action Buttons: Send, Receive, Swap */}
      <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
        <Button
          onClick={onSend}
          variant="secondary"
          className="w-full py-2.5 text-xs font-black"
          disabled={!address}
        >
          SEND
        </Button>
        <Button
          onClick={onReceive}
          variant="secondary"
          className="w-full py-2.5 text-xs font-black"
          disabled={!address}
        >
          RECEIVE
        </Button>
        <Button
          onClick={onSwap}
          variant="primary"
          className="w-full py-2.5 text-xs font-black"
          disabled={!address}
        >
          SWAP
        </Button>
      </div>
    </div>
  )
}
