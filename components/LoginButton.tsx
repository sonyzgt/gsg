'use client'

import { useLoginWithOAuth, usePrivy } from '@privy-io/react-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Button from './ui/Button'

export default function LoginButton() {
  const router = useRouter()
  const { authenticated, connectWallet, login } = usePrivy()
  const [loadingProvider, setLoadingProvider] = useState<'twitter' | 'google' | 'wallet' | null>(null)

  const { initOAuth } = useLoginWithOAuth({
    onComplete: () => {
      if (typeof window !== 'undefined' && window.location.pathname !== '/dashboard') {
        window.location.replace('/dashboard')
      }
    },
    onError: (err) => {
      console.error('Login error:', err)
      setLoadingProvider(null)
    },
  })

  useEffect(() => {
    if (authenticated && typeof window !== 'undefined' && window.location.pathname !== '/dashboard') {
      window.location.replace('/dashboard')
    }
  }, [authenticated])

  const handleOAuth = async (provider: 'twitter' | 'google') => {
    try {
      setLoadingProvider(provider)
      await initOAuth({ provider })
    } catch (err) {
      console.error('Login error:', err)
      setLoadingProvider(null)
    }
  }

  const handleWallet = () => {
    setLoadingProvider('wallet')
    try {
      if (typeof login === 'function') {
        login()
      } else {
        connectWallet()
      }
    } catch {
      connectWallet()
    } finally {
      setLoadingProvider(null)
    }
  }

  return (
    <div className="flex flex-col gap-3 w-full font-mono">
      {/* Twitter / X */}
      <Button
        size="lg"
        loading={loadingProvider === 'twitter'}
        disabled={!!loadingProvider && loadingProvider !== 'twitter'}
        onClick={() => handleOAuth('twitter')}
        className="w-full gap-3 bg-black hover:bg-zinc-900 border-2 border-white text-white shadow-[4px_4px_0px_0px_#ffffff] text-sm sm:text-base font-bold"
      >
        {loadingProvider !== 'twitter' && (
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden>
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.859L1.506 2.25h6.953l4.256 5.625 5.529-5.625Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        )}
        CONTINUE WITH X
      </Button>

      {/* Google */}
      <Button
        size="lg"
        loading={loadingProvider === 'google'}
        disabled={!!loadingProvider && loadingProvider !== 'google'}
        onClick={() => handleOAuth('google')}
        className="w-full gap-3 bg-white hover:bg-zinc-100 border-2 border-white text-black shadow-[4px_4px_0px_0px_#38bdf8] text-sm sm:text-base font-bold"
      >
        {loadingProvider !== 'google' && (
          <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
        )}
        CONTINUE WITH GOOGLE
      </Button>

      {/* WalletConnect */}
      <Button
        size="lg"
        loading={loadingProvider === 'wallet'}
        disabled={!!loadingProvider && loadingProvider !== 'wallet'}
        onClick={handleWallet}
        className="w-full gap-3 bg-[var(--theme-color)] hover:brightness-110 border-2 border-white text-black shadow-[4px_4px_0px_0px_#ffffff] text-sm sm:text-base font-black"
      >
        {loadingProvider !== 'wallet' && (
          <svg viewBox="0 0 32 32" className="w-5 h-5 fill-current" aria-hidden>
            <path d="M6.552 10.759c5.21-5.096 13.664-5.096 18.874 0l.627.613a.643.643 0 0 1 0 .923l-2.144 2.096a.339.339 0 0 1-.472 0l-.863-.844c-3.636-3.556-9.531-3.556-13.167 0l-.924.903a.339.339 0 0 1-.472 0L5.867 12.354a.643.643 0 0 1 0-.923l.685-.672Zm23.301 4.34 1.908 1.866a.643.643 0 0 1 0 .922l-8.603 8.415a.678.678 0 0 1-.944 0l-6.105-5.972a.17.17 0 0 0-.236 0l-6.105 5.972a.678.678 0 0 1-.944 0L.221 17.887a.643.643 0 0 1 0-.922l1.908-1.866a.678.678 0 0 1 .944 0l6.105 5.972a.17.17 0 0 0 .236 0l6.105-5.972a.678.678 0 0 1 .944 0l6.105 5.972a.17.17 0 0 0 .236 0l6.105-5.972a.678.678 0 0 1 .944 0Z" />
          </svg>
        )}
        CONNECT WALLET
      </Button>
    </div>
  )
}
