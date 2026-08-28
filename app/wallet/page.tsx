'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import WalletCard from '@/components/wallet/WalletCard'
import TokenList from '@/components/wallet/TokenList'
import SendModal from '@/components/wallet/SendModal'
import ReceiveModal from '@/components/wallet/ReceiveModal'
import SwapModal from '@/components/wallet/SwapModal'
import ClaimFeesModal from '@/components/launchpad/ClaimFeesModal'
import Spinner from '@/components/ui/Spinner'
import { useTheme } from '@/context/ThemeContext'

export default function WalletPage() {
  const { ready, logout } = usePrivy()
  const { theme } = useTheme()
  const [loggingOut, setLoggingOut] = useState(false)

  // Wallet & Action Modals
  const [sendOpen, setSendOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)
  const [claimFeesOpen, setClaimFeesOpen] = useState(false)
  const [selectedSwapCa, setSelectedSwapCa] = useState<string | undefined>(undefined)

  function handleOpenSwap(ca?: string) {
    setSelectedSwapCa(ca)
    setSwapOpen(true)
  }

  function handleCloseSwap() {
    setSwapOpen(false)
    setSelectedSwapCa(undefined)
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

      {/* Main Full-Page Wallet */}
      <main className="flex-1 w-full max-w-[1720px] mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10">
        <div className="max-w-4xl mx-auto flex flex-col gap-6 sm:gap-8">
          {/* Wallet Card */}
          <WalletCard
            onSend={() => setSendOpen(true)}
            onReceive={() => setReceiveOpen(true)}
            onSwap={() => handleOpenSwap()}
            onClaimRoyalties={() => setClaimFeesOpen(true)}
          />

          {/* Token Holdings List */}
          <TokenList onQuickSwap={(ca) => handleOpenSwap(ca)} />
        </div>
      </main>

      <Footer />

      {/* Modals */}
      <SendModal open={sendOpen} onClose={() => setSendOpen(false)} />
      <ReceiveModal open={receiveOpen} onClose={() => setReceiveOpen(false)} />
      <SwapModal open={swapOpen} onClose={handleCloseSwap} initialCa={selectedSwapCa} />
      <ClaimFeesModal open={claimFeesOpen} onClose={() => setClaimFeesOpen(false)} />
    </div>
  )
}
