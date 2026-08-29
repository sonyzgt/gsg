'use client'

import { usePrivy, useLoginWithOAuth, useWallets } from '@privy-io/react-auth'
import { useWallet } from '@/hooks/useWallet'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Button from '@/components/ui/Button'
import { useState, useEffect } from 'react'
import LiveTicker from './LiveTicker'
import { useTheme } from '@/context/ThemeContext'
import SparkleIcon from '@/components/ui/SparkleIcon'
import toast from 'react-hot-toast'

interface NavbarProps {
  onLogout?: () => void
  loggingOut?: boolean
}

export default function Navbar({
  onLogout,
  loggingOut = false,
}: NavbarProps) {
  const pathname = usePathname()
  const { user, authenticated, connectWallet, login, logout } = usePrivy()
  const { wallets } = useWallets()
  const { address } = useWallet()
  const [loggingIn, setLoggingIn] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [loginMenuOpen, setLoginMenuOpen] = useState(false)
  const { theme, setThemeId, themes } = useTheme()
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false)
    setDropdownOpen(false)
    setLoginMenuOpen(false)
    setThemeMenuOpen(false)
  }, [pathname])

  const handleDisconnect = async () => {
    setIsDisconnecting(true)
    setDropdownOpen(false)
    setMobileMenuOpen(false)
    try {
      if (Array.isArray(wallets) && wallets.length > 0) {
        await Promise.allSettled(
          wallets.map((w) => (typeof w.disconnect === 'function' ? w.disconnect() : Promise.resolve()))
        )
      }
      if (typeof logout === 'function') {
        await logout()
      }
      if (typeof onLogout === 'function') {
        await onLogout()
      }
    } catch (err) {
      console.warn('Disconnect error:', err)
    } finally {
      setIsDisconnecting(false)
    }
  }

  const { initOAuth } = useLoginWithOAuth({
    onComplete: () => {
      setLoggingIn(false)
      setMobileMenuOpen(false)
    },
    onError: (err) => {
      console.error('Login error:', err)
      setLoggingIn(false)
    },
  })

  const handleOAuth = async (provider: 'twitter' | 'google') => {
    try {
      setLoggingIn(true)
      setLoginMenuOpen(false)
      await initOAuth({ provider })
    } catch (err) {
      console.error('Login error:', err)
      setLoggingIn(false)
    }
  }

  const handleWalletLogin = () => {
    setLoginMenuOpen(false)
    try {
      if (typeof login === 'function') {
        login()
      } else {
        connectWallet()
      }
    } catch {
      connectWallet()
    }
  }

  const isConnected = authenticated && (!!address || !!user)

  const twitterAccount = user?.linkedAccounts?.find(
    (a) => a.type === 'twitter_oauth'
  ) as { username?: string } | undefined

  const googleAccount = user?.linkedAccounts?.find(
    (a) => a.type === 'google_oauth'
  ) as { name?: string; email?: string } | undefined

  const walletAccount = user?.linkedAccounts?.find(
    (a) => a.type === 'wallet'
  ) as { address?: string } | undefined

  const rawAddr = address || user?.wallet?.address || walletAccount?.address
  const shortAddr = rawAddr ? `${rawAddr.slice(0, 6)}...${rawAddr.slice(-4)}` : undefined

  const displayName = twitterAccount?.username
    ? `@${twitterAccount.username}`
    : googleAccount?.name ?? googleAccount?.email?.split('@')[0] ?? user?.email?.address?.split('@')[0] ?? shortAddr ?? 'CONNECTED'

  const navLinks = [
    {
      label: 'COINS',
      href: '/coin',
      code: '01',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <circle cx="12" cy="12" r="9" strokeWidth={2} />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12M15 9.5a3.5 3.5 0 00-6 0c0 2 3 2.5 3 4.5a3.5 3.5 0 01-6 0" />
        </svg>
      ),
    },
    {
      label: 'LAUNCH',
      href: '/launch',
      code: '02',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      label: 'WALLET',
      href: '/wallet',
      code: '03',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
    },
  ]

  return (
    <header className="sticky top-0 z-40 w-full border-b-2 border-zinc-800 bg-[#08090a]/95 backdrop-blur-md select-none">
      <div className="w-full max-w-[1720px] mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Brand Logo */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <Link
            href="/coin"
            className="flex items-center gap-2 group flex-shrink-0"
          >
            <SparkleIcon size={34} className="flex-shrink-0 group-hover:scale-105 transition-transform" />
            <div className="flex items-baseline gap-1.5 sm:gap-2">
              <span className="font-black text-lg sm:text-xl tracking-tighter text-white font-mono">
                PONSCORE
              </span>
              <span className="text-[9px] font-black font-mono px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">
                RH-4663
              </span>
            </div>
          </Link>
        </div>

        {/* Center: Desktop Navigation Links Tab (Coins, Launch, Wallet) */}
        <nav className="hidden md:flex items-center gap-1.5 p-1 bg-[#101317] border-2 border-zinc-800 rounded-lg shadow-[2px_2px_0px_0px_#000000] flex-shrink-0">
          {navLinks.map((link) => {
            const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href))
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-mono font-bold transition-all ${
                  isActive
                    ? 'bg-[var(--theme-color)] text-black border-2 border-white shadow-[2px_2px_0px_0px_#ffffff]'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.06] border-2 border-transparent'
                }`}
              >
                <span className="text-[10px] opacity-70">[{link.code}]</span>
                <span>{link.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Right Section: Desktop Profile & Theme, Mobile Hamburger */}
        <div className="flex items-center gap-2 sm:gap-2.5 relative">
          {/* Desktop Theme Switcher Button */}
          <div className="relative hidden md:block">
            <button
              type="button"
              onClick={() => {
                setThemeMenuOpen((prev) => !prev)
                setDropdownOpen(false)
                setLoginMenuOpen(false)
              }}
              title="Change Accent Theme"
              className="flex items-center gap-1.5 bg-[#121519] border-2 border-zinc-700 hover:border-white px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-mono font-bold text-zinc-200 hover:text-white transition-all cursor-pointer shadow-[2px_2px_0px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              <div
                className="w-3.5 h-3.5 border border-black shadow-[1px_1px_0px_0px_#ffffff] flex-shrink-0"
                style={{ backgroundColor: theme.color }}
              />
              <span className="text-[11px] uppercase font-mono">{theme.name.split(' ')[0]}</span>
            </button>

            {/* Theme Picker Dropdown */}
            {themeMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setThemeMenuOpen(false)}
                />
                <div
                  style={{
                    boxShadow: `4px 4px 0px 0px ${theme.color}`,
                  }}
                  className="absolute right-0 top-full mt-2 w-52 bg-[#0e1115] border-2 border-white rounded-lg p-2 z-50 flex flex-col gap-1 shadow-2xl animate-fadeIn select-none font-mono"
                >
                  <div className="px-2 py-1 flex items-center justify-between border-b border-zinc-800 mb-1">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider font-mono">// ACCENT_THEMES</span>
                    <span className="text-[10px] text-zinc-500 font-mono">[{themes.length}]</span>
                  </div>

                  <div className="grid grid-cols-1 gap-1">
                    {themes.map((t) => {
                      const isSelected = t.id === theme.id
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setThemeId(t.id)
                            setThemeMenuOpen(false)
                          }}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-mono font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[var(--theme-color)] text-black border border-white'
                              : 'text-zinc-300 hover:text-white hover:bg-white/[0.08]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 border border-black shadow-[1px_1px_0px_0px_#ffffff] flex-shrink-0"
                              style={{ backgroundColor: t.color }}
                            />
                            <span>{t.name}</span>
                          </div>
                          {isSelected && (
                            <span className="text-[10px] font-black font-mono">✓</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Desktop Connected User Menu */}
          {isConnected ? (
            <div className="relative hidden md:block">
              <button
                type="button"
                onClick={() => setDropdownOpen((prev) => !prev)}
                className="flex items-center gap-2 text-xs text-zinc-200 hover:text-white font-mono bg-[#121519] border-2 border-zinc-700 hover:border-white px-2.5 sm:px-3 py-1.5 rounded-md transition-all cursor-pointer shadow-[2px_2px_0px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none flex-shrink-0"
              >
                <span
                  className="w-2 h-2 rounded-none border border-black"
                  style={{ backgroundColor: theme.color }}
                />
                <span className="max-w-[140px] truncate font-bold font-mono">{displayName}</span>
                <svg
                  className={`w-3 h-3 text-zinc-400 transition-transform duration-150 flex-shrink-0 ${
                    dropdownOpen ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {dropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setDropdownOpen(false)}
                  />

                  <div
                    style={{
                      boxShadow: `4px 4px 0px 0px ${theme.color}`,
                    }}
                    className="absolute right-0 top-full mt-2 w-56 bg-[#0e1115] border-2 border-white rounded-lg p-2 z-50 flex flex-col gap-1 shadow-2xl animate-fadeIn select-none font-mono"
                  >
                    <div className="px-2 py-1 mb-1 border-b border-zinc-800 flex items-center justify-between">
                      <span className="text-[10px] font-black text-zinc-500 uppercase">// ACCOUNT</span>
                      {shortAddr && (
                        <span className="text-[10px] font-mono text-zinc-400">{shortAddr}</span>
                      )}
                    </div>

                    <Link
                      href="/coin"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded text-xs font-bold text-zinc-200 hover:text-black hover:bg-[var(--theme-color)] transition-all cursor-pointer"
                    >
                      <span>[01]</span>
                      <span>COINS EXPLORER</span>
                    </Link>

                    <Link
                      href="/launch"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded text-xs font-bold text-zinc-200 hover:text-black hover:bg-[var(--theme-color)] transition-all cursor-pointer"
                    >
                      <span>[02]</span>
                      <span>LAUNCH TOKEN</span>
                    </Link>

                    <Link
                      href="/wallet"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded text-xs font-bold text-zinc-200 hover:text-black hover:bg-[var(--theme-color)] transition-all cursor-pointer"
                    >
                      <span>[03]</span>
                      <span>WALLET & PORTFOLIO</span>
                    </Link>

                    <div className="my-1 border-t border-zinc-800" />

                    <button
                      type="button"
                      onClick={handleDisconnect}
                      disabled={isDisconnecting}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded text-xs font-bold text-rose-400 hover:text-white hover:bg-rose-600 transition-all w-full text-left cursor-pointer"
                    >
                      <span>[✕]</span>
                      <span>{isDisconnecting ? 'DISCONNECTING...' : 'DISCONNECT'}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="hidden md:block">
              {/* Desktop Login Button */}
              <div className="relative">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setLoginMenuOpen((prev) => !prev)}
                  loading={loggingIn}
                  className="gap-1.5 text-xs font-mono font-black py-1.5 px-3 flex-shrink-0"
                >
                  <span>CONNECT</span>
                  {!loggingIn && (
                    <svg
                      className={`w-3 h-3 transition-transform duration-150 flex-shrink-0 ${loginMenuOpen ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                </Button>

                {loginMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setLoginMenuOpen(false)} />
                    <div
                      style={{
                        boxShadow: `4px 4px 0px 0px ${theme.color}`,
                      }}
                      className="absolute right-0 top-full mt-2 w-56 bg-[#0e1115] border-2 border-white rounded-lg p-2 z-50 flex flex-col gap-1.5 shadow-2xl animate-fadeIn select-none font-mono"
                    >
                      <div className="px-2 py-1 mb-0.5 border-b border-zinc-800">
                        <span className="text-[10px] font-black text-zinc-400 uppercase">// CONNECT_AUTH</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOAuth('twitter')}
                        className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-bold text-zinc-100 hover:text-black hover:bg-white transition-all cursor-pointer border border-zinc-800 hover:border-white w-full text-left"
                      >
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current flex-shrink-0" aria-hidden>
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.859L1.506 2.25h6.953l4.256 5.625 5.529-5.625Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                        <span>Continue with X</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOAuth('google')}
                        className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-bold text-zinc-100 hover:text-black hover:bg-white transition-all cursor-pointer border border-zinc-800 hover:border-white w-full text-left"
                      >
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0" aria-hidden>
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        <span>Continue with Google</span>
                      </button>

                      <div className="my-0.5 border-t border-zinc-800" />

                      <button
                        type="button"
                        onClick={handleWalletLogin}
                        className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-bold text-black bg-[var(--theme-color)] hover:brightness-110 transition-all cursor-pointer border border-white w-full text-left"
                      >
                        <svg viewBox="0 0 32 32" className="w-3.5 h-3.5 fill-current flex-shrink-0" aria-hidden>
                          <path d="M6.552 10.759c5.21-5.096 13.664-5.096 18.874 0l.627.613a.643.643 0 0 1 0 .923l-2.144 2.096a.339.339 0 0 1-.472 0l-.863-.844c-3.636-3.556-9.531-3.556-13.167 0l-.924.903a.339.339 0 0 1-.472 0L5.867 12.354a.643.643 0 0 1 0-.923l.685-.672Zm23.301 4.34 1.908 1.866a.643.643 0 0 1 0 .922l-8.603 8.415a.678.678 0 0 1-.944 0l-6.105-5.972a.17.17 0 0 0-.236 0l-6.105 5.972a.678.678 0 0 1-.944 0L.221 17.887a.643.643 0 0 1 0-.922l1.908-1.866a.678.678 0 0 1 .944 0l6.105 5.972a.17.17 0 0 0 .236 0l6.105-5.972a.678.678 0 0 1 .944 0l6.105 5.972a.17.17 0 0 0 .236 0l6.105-5.972a.678.678 0 0 1 .944 0Z" />
                        </svg>
                        <span>Connect Wallet</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* MOBILE ONLY: Compact Theme Switcher + Hamburger Button                    */}
          {/* ========================================================================= */}
          <div className="flex md:hidden items-center gap-1.5">
            {/* Quick Mobile Theme Swatch Button */}
            <button
              type="button"
              onClick={() => {
                const currentIndex = themes.findIndex((t) => t.id === theme.id)
                const nextTheme = themes[(currentIndex + 1) % themes.length]
                setThemeId(nextTheme.id)
                toast.success(`Theme: ${nextTheme.name}`, { duration: 1500, position: 'bottom-center' })
              }}
              title="Tap to cycle theme"
              className="p-2 rounded-md border-2 border-zinc-700 bg-[#121519] active:scale-95 transition-transform flex items-center justify-center cursor-pointer shadow-[2px_2px_0px_0px_#000000]"
            >
              <div
                className="w-3.5 h-3.5 border border-black shadow-[1px_1px_0px_0px_#ffffff]"
                style={{ backgroundColor: theme.color }}
              />
            </button>

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle Mobile Menu"
              className={`p-2 rounded-md border-2 transition-all cursor-pointer flex items-center justify-center shadow-[2px_2px_0px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${
                mobileMenuOpen
                  ? 'bg-[var(--theme-color)] text-black border-white'
                  : 'bg-[#121519] border-zinc-700 text-zinc-200 hover:text-white hover:border-white'
              }`}
            >
              {mobileMenuOpen ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MOBILE FULL DRAWER / MENU                                                 */}
      {/* ========================================================================= */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 top-[52px] bg-black/70 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />

          <div
            style={{
              boxShadow: `0px 10px 30px 0px rgba(0,0,0,0.8), inset 0 2px 0 0 ${theme.color}`,
            }}
            className="absolute left-0 right-0 top-full bg-[#0a0c0f] border-b-2 border-zinc-700 p-4 z-50 flex flex-col gap-3.5 shadow-2xl animate-fadeIn md:hidden font-mono select-none"
          >
            {/* 1. Account / Auth Section */}
            <div className="p-3 bg-[#12151a] border-2 border-zinc-800 rounded-lg flex flex-col gap-2.5">
              <div className="flex items-center justify-between text-[10px] font-black text-zinc-500 uppercase">
                <span>// USER_IDENTITY</span>
                <span className="flex items-center gap-1.5 text-zinc-400 font-mono">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: isConnected ? '#10b981' : '#6b7280' }}
                  />
                  {isConnected ? 'AUTHENTICATED' : 'DISCONNECTED'}
                </span>
              </div>

              {isConnected ? (
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-black text-white truncate">{displayName}</span>
                    {shortAddr && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(rawAddr || '')
                          toast.success('Address copied!')
                        }}
                        className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer text-left"
                      >
                        <span>{shortAddr}</span>
                        <span className="text-[9px] opacity-70">📋</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={isDisconnecting}
                    className="px-2.5 py-1.5 rounded text-[11px] font-bold text-rose-400 hover:text-white bg-rose-950/40 border border-rose-800/60 hover:bg-rose-600 transition-all cursor-pointer flex-shrink-0"
                  >
                    {isDisconnecting ? 'EXITING...' : 'LOGOUT'}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2 pt-1">
                  <p className="text-[11px] text-zinc-400">
                    Connect your account to launch and trade on Robinhood Chain.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleOAuth('twitter')}
                      className="flex items-center justify-center gap-2 py-2 px-2.5 rounded bg-zinc-900 border border-zinc-700 hover:border-white text-xs font-bold text-white transition-all cursor-pointer"
                    >
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current flex-shrink-0" aria-hidden>
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.859L1.506 2.25h6.953l4.256 5.625 5.529-5.625Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                      <span>Twitter / X</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOAuth('google')}
                      className="flex items-center justify-center gap-2 py-2 px-2.5 rounded bg-zinc-900 border border-zinc-700 hover:border-white text-xs font-bold text-white transition-all cursor-pointer"
                    >
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0" aria-hidden>
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                      </svg>
                      <span>Google</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleWalletLogin}
                    className="w-full py-2.5 px-3 rounded text-xs font-black text-black bg-[var(--theme-color)] hover:brightness-110 border border-white transition-all cursor-pointer flex items-center justify-center gap-2 mt-1 shadow-[2px_2px_0px_0px_#ffffff]"
                  >
                    <svg viewBox="0 0 32 32" className="w-4 h-4 fill-current flex-shrink-0" aria-hidden>
                      <path d="M6.552 10.759c5.21-5.096 13.664-5.096 18.874 0l.627.613a.643.643 0 0 1 0 .923l-2.144 2.096a.339.339 0 0 1-.472 0l-.863-.844c-3.636-3.556-9.531-3.556-13.167 0l-.924.903a.339.339 0 0 1-.472 0L5.867 12.354a.643.643 0 0 1 0-.923l.685-.672Zm23.301 4.34 1.908 1.866a.643.643 0 0 1 0 .922l-8.603 8.415a.678.678 0 0 1-.944 0l-6.105-5.972a.17.17 0 0 0-.236 0l-6.105 5.972a.678.678 0 0 1-.944 0L.221 17.887a.643.643 0 0 1 0-.922l1.908-1.866a.678.678 0 0 1 .944 0l6.105 5.972a.17.17 0 0 0 .236 0l6.105-5.972a.678.678 0 0 1 .944 0l6.105 5.972a.17.17 0 0 0 .236 0l6.105-5.972a.678.678 0 0 1 .944 0Z" />
                    </svg>
                    <span>CONNECT WALLET</span>
                  </button>
                </div>
              )}
            </div>

            {/* 2. Navigation Links */}
            <div className="flex flex-col gap-1">
              <div className="px-1 text-[10px] font-black text-zinc-500 uppercase">
                // NAVIGATION
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {navLinks.map((link) => {
                  const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href))
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-bold transition-all border-2 ${
                        isActive
                          ? 'bg-[var(--theme-color)] text-black border-white shadow-[2px_2px_0px_0px_#ffffff]'
                          : 'bg-[#101317] text-zinc-300 border-zinc-800 hover:border-zinc-600 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-[11px] opacity-70">[{link.code}]</span>
                        <span className="text-sm font-mono">{link.label}</span>
                      </div>
                      <span className="text-xs">→</span>
                    </Link>
                  )
                })}
              </div>
            </div>

            {/* 3. Theme Quick Selector */}
            <div className="flex flex-col gap-1.5 pt-1 border-t border-zinc-800/80">
              <div className="px-1 flex items-center justify-between text-[10px] font-black text-zinc-500 uppercase">
                <span>// ACCENT_THEMES</span>
                <span className="text-zinc-400 font-mono">CURRENT: {theme.name.split(' ')[0]}</span>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                {themes.map((t) => {
                  const isSelected = t.id === theme.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setThemeId(t.id)}
                      className={`p-2 rounded-md flex flex-col items-center gap-1 border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-zinc-800 border-white shadow-[2px_2px_0px_0px_#ffffff]'
                          : 'bg-[#101317] border-zinc-800 hover:border-zinc-600'
                      }`}
                    >
                      <div
                        className="w-3.5 h-3.5 border border-black"
                        style={{ backgroundColor: t.color }}
                      />
                      <span className="text-[9px] font-mono text-zinc-400 truncate max-w-full">
                        {t.name.split(' ')[0]}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Live Token Activity Ticker Bar below Navbar */}
      <LiveTicker />
    </header>
  )
}