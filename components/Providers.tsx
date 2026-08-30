'use client'

import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { robinhoodChain, activeChain } from '@/lib/chains'
import { Toaster } from 'react-hot-toast'
import { ReactNode, useState } from 'react'

// Mainnet Only
const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  transports: {
    [robinhoodChain.id]: http('https://robinhood-rpc.publicnode.com'),
  },
})

import { ThemeProvider } from '@/context/ThemeContext'

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID

  if (!appId || appId === 'your_privy_app_id_here') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-8 text-center">
        <div className="max-w-sm">
          <p className="text-red-400 font-semibold text-lg mb-2">Configuration Required</p>
          <p className="text-zinc-400 text-sm">
            Please set <code className="bg-zinc-900 px-1 rounded text-red-400 font-mono">NEXT_PUBLIC_PRIVY_APP_ID</code> in{' '}
            <code className="bg-zinc-900 px-1 rounded text-red-400 font-mono">.env.local</code> with your App ID from{' '}
            <a href="https://dashboard.privy.io" className="text-red-400 underline" target="_blank" rel="noopener noreferrer">
              dashboard.privy.io
            </a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#10b981',
          walletList: ['metamask', 'wallet_connect', 'coinbase_wallet', 'rainbow', 'rabby_wallet', 'zerion'],
        },
        externalWallets: {
          walletConnect: {
            enabled: true,
          },
        },
        walletConnectCloudProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '3a8170812b534d0ff9d794f19a901d64',
        embeddedWallets: {
          showWalletUIs: false,
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
        defaultChain: activeChain,
        supportedChains: [robinhoodChain],
        loginMethods: ['twitter', 'google', 'wallet'],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <ThemeProvider>
            {children}
            <Toaster
              position="top-center"
              toastOptions={{
                style: {
                  background: '#09110d',
                  color: '#f4f4f5',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: '16px',
                  fontSize: '13px',
                  padding: '12px 18px',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.8), 0 0 20px rgba(16, 185, 129, 0.2)',
                },
              }}
            />
          </ThemeProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  )
}
