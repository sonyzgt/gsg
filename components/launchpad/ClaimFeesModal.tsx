'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatEther, encodeFunctionData } from 'viem'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useWallet } from '@/hooks/useWallet'
import { activeChain } from '@/lib/chains'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'
import { useTheme } from '@/context/ThemeContext'
import {
  FEE_ESCROW,
  FEE_ESCROW_ABI,
  getCreatorClaimableEth,
} from '@/lib/pons-v2'

interface ClaimFeesModalProps {
  open: boolean
  onClose: () => void
}

export default function ClaimFeesModal({ open, onClose }: ClaimFeesModalProps) {
  const { user } = usePrivy()
  const { wallets } = useWallets()
  const { address, embeddedWallet, refetchBalance } = useWallet()
  const { theme } = useTheme()
  const [claimableWei, setClaimableWei] = useState<bigint>(0n)
  const [fetching, setFetching] = useState(false)
  const [claiming, setClaiming] = useState(false)

  const fetchBalance = useCallback(async () => {
    if (!address) return
    setFetching(true)
    try {
      const bal = await getCreatorClaimableEth(address)
      setClaimableWei(bal)
    } catch {
      setClaimableWei(0n)
    } finally {
      setFetching(false)
    }
  }, [address])

  useEffect(() => {
    if (open && address) {
      fetchBalance()
    }
  }, [open, address, fetchBalance])

  const claimableEth = parseFloat(formatEther(claimableWei))

  async function handleClaim() {
    if (!address || claimableWei === 0n) return
    setClaiming(true)

    try {
      // 1. Try server-side claim first for Privy Server Wallets
      const res = await fetch('/api/launchpad/claim-fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          twitterHandle: user?.twitter?.username,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (res.ok && data?.success) {
        toast.success(`Successfully claimed ${claimableEth.toFixed(5)} ETH into your wallet!`)
        await Promise.all([fetchBalance(), refetchBalance()])
        onClose()
        return
      }

      if (data?.error && res.status !== 404) {
        throw new Error(data.error)
      }

      // 2. If server-side is not applicable, try connected external wallet signing
      const activeWallet = wallets?.find(w => w.address?.toLowerCase() === address?.toLowerCase()) || wallets?.[0] || embeddedWallet
      if (activeWallet) {
        try {
          await activeWallet.switchChain(activeChain.id)
        } catch { /* continue */ }
        const provider = await activeWallet.getEthereumProvider()
        const { createWalletClient, custom } = await import('viem')
        const walletClient = createWalletClient({
          chain: activeChain,
          transport: custom(provider),
        })
        const [account] = await walletClient.getAddresses()

        const calldata = encodeFunctionData({
          abi: FEE_ESCROW_ABI,
          functionName: 'claim',
        })

        toast('Submitting claim from Fee Escrow in your wallet...')

        await walletClient.sendTransaction({
          account,
          to: FEE_ESCROW,
          data: calldata,
          gas: 200000n,
        })

        toast.success(`Successfully claimed ${claimableEth.toFixed(5)} ETH into your wallet!`)
        await Promise.all([fetchBalance(), refetchBalance()])
        onClose()
        return
      }

      throw new Error(data?.error || 'Claim failed')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Claim failed'
      if (msg.includes('cancel') || msg.includes('reject')) {
        toast.error('Claim canceled.')
      } else {
        toast.error(`${msg.slice(0, 100)}`)
      }
    } finally {
      setClaiming(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="// CREATOR_FEE_ESCROW">
      <div className="flex flex-col gap-4 font-mono select-none">
        <div className="bg-[#121519] border-2 border-zinc-800 rounded-lg p-3.5 flex items-start gap-3 shadow-[2px_2px_0px_0px_#000000]">
          <div
            className="w-7 h-7 rounded-none bg-black border border-white flex items-center justify-center flex-shrink-0 shadow-[1px_1px_0px_0px_#ffffff]"
            style={{ color: theme.color }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-xs">
            <p className="font-black text-white uppercase">NON-CUSTODIAL ESCROW</p>
            <p className="text-zinc-400 mt-0.5 font-sans leading-relaxed text-[11px]">
              Creator royalties and curve swap shares accumulate automatically in the Fee Escrow contract. Withdraw anytime on your schedule.
            </p>
          </div>
        </div>

        {/* Balance Card */}
        <div className="bg-[#121519] border-2 border-zinc-700 p-5 rounded-lg flex flex-col gap-1 text-center shadow-[3px_3px_0px_0px_#000000]">
          <span className="text-[10px] text-zinc-400 font-black uppercase tracking-wider">
            // UNCLAIMED_ROYALTIES
          </span>
          <div className="flex items-baseline justify-center gap-2 mt-1">
            <span className="text-3xl sm:text-4xl font-black text-white">
              {fetching ? '...' : claimableEth.toFixed(6)}
            </span>
            <span className="font-black text-sm text-theme-light">ETH</span>
          </div>
          <span className="text-[10px] text-zinc-500 mt-0.5">
            ≈ ${(claimableEth * 2500).toFixed(2)} USD
          </span>
        </div>

        {/* Claim Action */}
        <Button
          variant="primary"
          onClick={handleClaim}
          disabled={claimableWei === 0n || claiming || fetching}
          loading={claiming}
          className="w-full py-3 text-xs font-black"
        >
          {claimableWei === 0n ? 'NO CLAIMABLE FEES AVAILABLE' : `CLAIM ${claimableEth.toFixed(4)} ETH TO WALLET`}
        </Button>
      </div>
    </Modal>
  )
}
