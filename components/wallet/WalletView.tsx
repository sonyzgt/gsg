'use client'

import { useState } from 'react'
import WalletCard from '@/components/wallet/WalletCard'
import TokenList from '@/components/wallet/TokenList'
import SendModal from '@/components/wallet/SendModal'
import ReceiveModal from '@/components/wallet/ReceiveModal'
import SwapModal from '@/components/wallet/SwapModal'
import { useTheme } from '@/context/ThemeContext'
import SparkleIcon from '@/components/ui/SparkleIcon'

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
    <div className="flex flex-col gap-6 w-full pb-16 font-mono animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <SparkleIcon size={28} className="flex-shrink-0" />
            <h1 className="text-lg sm:text-xl font-black text-white uppercase tracking-tight">
              // WALLET & TOKEN PORTFOLIO
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1 font-sans">
            Manage Native ETH, discover on-chain balances, and execute instant Robinhood Chain DEX swaps.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-[#121519] border-2 border-zinc-700 text-xs font-black text-zinc-300 shadow-[2px_2px_0px_0px_#000000]">
            <span
              className="w-1.5 h-1.5 rounded-none"
              style={{ backgroundColor: theme.color }}
            />
            ROBINHOOD CHAIN [4663]
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
