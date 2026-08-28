'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatEther, encodeFunctionData } from 'viem'
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
    if (!address || !embeddedWallet || claimableWei === 0n) return
    setClaiming(true)

    try {
      await embeddedWallet.switchChain(activeChain.id)
      const provider = await embeddedWallet.getEthereumProvider()
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

      toast('Submitting claim from Fee Escrow...')

      await walletClient.sendTransaction({
        account,
        to: FEE_ESCROW,
        data: calldata,
        gas: 200000n,
      })

      toast.success(`Successfully claimed ${claimableEth.toFixed(5)} ETH into your wallet!`)
      await Promise.all([fetchBalance(), refetchBalance()])
      onClose()
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
    <Modal open={open} onClose={onClose} title="Creator Fee Escrow">
      <div className="flex flex-col gap-4">
        <div className="bg-[#09110d] border border-white/10 rounded-2xl p-4 flex items-start gap-3">
          <div
            className="w-8 h-8 rounded-xl liquid-pill flex items-center justify-center flex-shrink-0"
            style={{ color: theme.color }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-xs">
            <p className="font-bold text-zinc-100">Non-Custodial Fee Escrow</p>
            <p className="text-zinc-400 mt-0.5 leading-relaxed">
              Creator royalties and curve swap shares accumulate automatically in the Fee Escrow contract on Robinhood Chain. Withdraw anytime on your own schedule.
            </p>
          </div>
        </div>

        {/* Balance Card */}
        <div className="bg-[#09110d]/80 border border-white/[0.08] p-5 rounded-2xl flex flex-col gap-1 text-center">
          <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">
            Unclaimed Creator Royalties
          </span>
          <div className="flex items-baseline justify-center gap-2 mt-1">
            <span className="text-3xl sm:text-4xl font-extrabold text-white font-mono">
              {fetching ? '...' : claimableEth.toFixed(6)}
            </span>
            <span className="font-bold font-mono text-lg text-theme-light">ETH</span>
          </div>
          <span className="text-[11px] text-zinc-500 font-mono mt-1">
            ≈ ${(claimableEth * 2500).toFixed(2)} USD
          </span>
        </div>

        {/* Claim Action */}
        <Button
          variant="primary"
          onClick={handleClaim}
          disabled={claimableWei === 0n || claiming || fetching}
          loading={claiming}
          className="w-full py-3.5 text-sm font-bold"
        >
          {claimableWei === 0n ? 'No Claimable Fees Available' : `Claim ${claimableEth.toFixed(4)} ETH to Wallet`}
        </Button>
      </div>
    </Modal>
  )
}
