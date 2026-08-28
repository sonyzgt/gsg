'use client'

import { useState } from 'react'
import WalletCard from '@/components/wallet/WalletCard'
import TokenList from '@/components/wallet/TokenList'
import SendModal from '@/components/wallet/SendModal'
import ReceiveModal from '@/components/wallet/ReceiveModal'
import SwapModal from '@/components/wallet/SwapModal'
import { useTheme } from '@/context/ThemeContext'

export default function WalletView() {
  const { theme } = useTheme()
  const [sendOpen, setSendOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)
  const [selectedSwapCa, setSelectedSwapCa] = useState<string | undefined>(undefined)

  function handleOpenSwapWithToken(ca?: string) {
    setSelectedSwapCa(ca)
    setSwapOpen(true)
  }

  function handleCloseSwap() {
    setSwapOpen(false)
    setSelectedSwapCa(undefined)
  }

  return (
    <div className="flex flex-col gap-6 w-full pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: theme.color, boxShadow: `0 0 8px ${theme.color}` }}
            />
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight">
              Wallet & Token Portfolio
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Manage Native ETH, discover on-chain balances, and execute instant Robinhood Chain DEX swaps.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium liquid-pill text-zinc-300 font-mono">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: theme.color }}
            />
            Robinhood Chain (4663)
          </span>
        </div>
      </div>

      {/* 2-Column Responsive Dashboard Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full">
        {/* Left Column: Main Wallet Card */}
        <div className="lg:col-span-5 w-full sticky top-20">
          <WalletCard
            onSend={() => setSendOpen(true)}
            onReceive={() => setReceiveOpen(true)}
            onSwap={() => handleOpenSwapWithToken()}
          />
        </div>

        {/* Right Column: Token Portfolio */}
        <div className="lg:col-span-7 w-full">
          <TokenList onQuickSwap={(tokenCa) => handleOpenSwapWithToken(tokenCa)} />
        </div>
      </div>

      {/* Modals */}
      <SendModal open={sendOpen} onClose={() => setSendOpen(false)} />
      <ReceiveModal open={receiveOpen} onClose={() => setReceiveOpen(false)} />
      <SwapModal open={swapOpen} onClose={handleCloseSwap} initialCa={selectedSwapCa} />
    </div>
  )
}
