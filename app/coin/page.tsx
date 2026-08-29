'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePrivy } from '@privy-io/react-auth'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import LaunchpadExplorer from '@/components/launchpad/LaunchpadExplorer'
import CreateTokenModal from '@/components/launchpad/CreateTokenModal'
import ClaimFeesModal from '@/components/launchpad/ClaimFeesModal'
import SwapModal from '@/components/wallet/SwapModal'
import Spinner from '@/components/ui/Spinner'

export default function CoinPage() {
  const router = useRouter()
  const { ready, logout } = usePrivy()
  const [loggingOut, setLoggingOut] = useState(false)

  const [createTokenOpen, setCreateTokenOpen] = useState(false)
  const [claimFeesOpen, setClaimFeesOpen] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)
  const [selectedSwapCa, setSelectedSwapCa] = useState<string | undefined>(undefined)

  function handleOpenSwap(ca?: string) {
    if (ca) {
      router.push(`/token/${ca}`)
    } else {
      setSwapOpen(true)
    }
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
      <Navbar />

      {/* Main Coin Explorer */}
      <main className="flex-1 w-full max-w-[1720px] mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10">
        <div className="max-w-6xl mx-auto flex flex-col gap-6">
          <LaunchpadExplorer
            onOpenCreateToken={() => setCreateTokenOpen(true)}
            onOpenClaimFees={() => setClaimFeesOpen(true)}
            onOpenSwap={(ca) => handleOpenSwap(ca)}
            onSelectTokenDetail={(token) => router.push(`/token/${token.tokenAddress}`)}
          />
        </div>
      </main>

      <Footer />

      {/* Modals */}
      <CreateTokenModal
        open={createTokenOpen}
        onClose={() => setCreateTokenOpen(false)}
        onTokenCreated={(tokenAddress) => {
          setCreateTokenOpen(false)
          if (tokenAddress) {
            router.push(`/token/${tokenAddress}`)
          }
        }}
      />

      <ClaimFeesModal
        open={claimFeesOpen}
        onClose={() => setClaimFeesOpen(false)}
      />

      <SwapModal
        open={swapOpen}
        onClose={handleCloseSwap}
        initialCa={selectedSwapCa}
      />
    </div>
  )
}
