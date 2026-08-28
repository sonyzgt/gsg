'use client'

import { usePrivy, useLoginWithOAuth } from '@privy-io/react-auth'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import Button from '@/components/ui/Button'
import { useState } from 'react'
import LiveTicker from './LiveTicker'
import { useTheme } from '@/context/ThemeContext'
import SparkleIcon from '@/components/ui/SparkleIcon'

interface NavbarProps {
  onLogout: () => void
  loggingOut?: boolean
}

export default function Navbar({
  onLogout,
  loggingOut = false,
}: NavbarProps) {
  const pathname = usePathname()
  const { user, authenticated } = usePrivy()
  const [loggingIn, setLoggingIn] = useState(false)
  const { theme, setThemeId, themes } = useTheme()
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const { initOAuth } = useLoginWithOAuth({
    onComplete: () => {
      setLoggingIn(false)
    },
    onError: (err) => {
      console.error('Login error:', err)
      setLoggingIn(false)
    },
  })

  const handleLogin = async () => {
    try {
      setLoggingIn(true)
      await initOAuth({ provider: 'twitter' })
    } catch (err) {
      console.error('Login error:', err)
      setLoggingIn(false)
    }
  }

  const twitterAccount = user?.linkedAccounts?.find(
    (a) => a.type === 'twitter_oauth'
  ) as { username?: string } | undefined

  const displayName = twitterAccount?.username
    ? `@${twitterAccount.username}`
    : user?.email?.address ?? 'User'

  const navLinks = [
    {
      label: 'Coins',
      href: '/coin',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <circle cx="12" cy="12" r="9" strokeWidth="2" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12M15 9.5a3.5 3.5 0 00-6 0c0 2 3 2.5 3 4.5a3.5 3.5 0 01-6 0" />
        </svg>
      ),
    },
    {
      label: 'Launch',
      href: '/launch',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      label: 'Wallet',
      href: '/wallet',
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
    },
  ]

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.1] bg-black/80 backdrop-blur-2xl select-none shadow-[0_10px_35px_rgba(0,0,0,0.6)]">
      {/* Top subtle liquid refraction line */}
      <div
        className="h-[1px] w-full transition-all duration-500"
        style={{ background: `linear-gradient(to right, transparent, ${theme.color}, transparent)` }}
      />

      <div className="w-full max-w-[1720px] mx-auto px-2.5 sm:px-6 lg:px-8 py-2 sm:py-3 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Brand Logo */}
        <div className="flex items-center flex-shrink-0">
          <Link
            href="/coin"
            className="flex items-center gap-1.5 sm:gap-2.5 cursor-pointer group flex-shrink-0"
          >
            <div className="w-7 h-7 sm:w-8 sm:h-8 group-hover:scale-110 transition-transform flex items-center justify-center flex-shrink-0">
              <SparkleIcon size={28} />
            </div>
            <span className="font-extrabold text-sm sm:text-base tracking-tight text-white drop-shadow-md">
              SPARKLE
            </span>
          </Link>
        </div>

        {/* Center: Navigation Links Tab (Coins, Launch, Wallet) - Hidden on mobile */}
        <nav className="hidden md:flex items-center gap-1 sm:gap-1.5 liquid-pill p-1 rounded-2xl flex-shrink-0">
          {navLinks.map((link) => {
            const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href))
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2 px-3.5 sm:px-4 py-1.5 rounded-xl text-xs sm:text-sm transition-all ${
                  isActive
                    ? 'liquid-pill-active font-bold'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] font-medium'
                }`}
              >
                <span className="opacity-90">{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Right: Auth Profile, Theme Switcher & Dropdown */}
        <div className="flex items-center gap-2 sm:gap-2.5 relative">
          {/* Theme Palette Switcher Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setThemeMenuOpen((prev) => !prev)
                setDropdownOpen(false)
              }}
              title="Change Theme Color"
              className="flex items-center gap-1.5 liquid-pill px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold text-zinc-200 hover:text-white transition-all cursor-pointer group shadow-md"
            >
              {/* Colored glowing indicator */}
              <div
                className="w-3.5 h-3.5 rounded-full border border-white/40 shadow-sm transition-transform group-hover:scale-110 flex-shrink-0"
                style={{ backgroundColor: theme.color, boxShadow: `0 0 10px ${theme.color}` }}
              />
              <svg className="w-3.5 h-3.5 text-zinc-400 group-hover:text-white transition-colors hidden sm:inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4 4 4 0 014-4h1a4 4 0 014 4 4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
            </button>

            {/* Theme Picker Dropdown */}
            {themeMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setThemeMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2.5 w-52 bg-black/95 backdrop-blur-2xl border border-white/15 rounded-2xl p-2.5 z-50 flex flex-col gap-1.5 shadow-[0_25px_60px_rgba(0,0,0,0.95)] ring-1 ring-white/10 animate-fadeIn">
                  <div className="px-2 py-1 flex items-center justify-between border-b border-white/[0.08] mb-0.5">
                    <span className="text-[11px] font-extrabold text-zinc-300 uppercase tracking-wider font-mono">Theme Colors</span>
                    <span className="text-[10px] text-zinc-500 font-mono">{themes.length} themes</span>
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
                          className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-white/[0.12] text-white shadow-inner'
                              : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-white/30 shadow-sm flex-shrink-0"
                              style={{ backgroundColor: t.color, boxShadow: isSelected ? `0 0 12px ${t.color}` : 'none' }}
                            />
                            <span>{t.name}</span>
                          </div>
                          {isSelected && (
                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {authenticated ? (
            <div className="relative">
              {/* Clickable Username Button with Dropdown Trigger */}
              <button
                type="button"
                onClick={() => setDropdownOpen((prev) => !prev)}
                className="flex items-center gap-1.5 sm:gap-2 text-xs text-zinc-200 hover:text-white font-mono liquid-pill px-2.5 sm:px-3.5 py-1.5 rounded-xl transition-all cursor-pointer group flex-shrink-0"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor] flex-shrink-0"
                  style={{ backgroundColor: theme.color, color: theme.color }}
                />
                <span className="max-w-[70px] xs:max-w-[100px] sm:max-w-[140px] truncate">{displayName}</span>
                <svg
                  style={dropdownOpen ? { color: theme.color } : undefined}
                  className={`w-3.5 h-3.5 text-zinc-400 group-hover:text-white transition-transform duration-200 flex-shrink-0 ${
                    dropdownOpen ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {dropdownOpen && (
                <>
                  {/* Invisible backdrop to dismiss on outside click */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setDropdownOpen(false)}
                  />

                  <div className="absolute right-0 top-full mt-2.5 w-52 bg-black/95 backdrop-blur-2xl border border-white/15 rounded-2xl p-2 z-50 flex flex-col gap-1 shadow-[0_25px_60px_rgba(0,0,0,0.95)] ring-1 ring-white/15 animate-fadeIn">
                    {/* Coins */}
                    <Link
                      href="/coin"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-zinc-100 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer group/item"
                    >
                      <div
                        style={{ backgroundColor: `${theme.primary}20`, borderColor: `${theme.primary}40`, color: theme.color }}
                        className="w-7 h-7 rounded-lg border flex items-center justify-center group-hover/item:scale-110 transition-transform shadow-sm"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <span>Coins</span>
                    </Link>

                    {/* Launch */}
                    <Link
                      href="/launch"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-zinc-100 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer group/item"
                    >
                      <div
                        style={{ backgroundColor: `${theme.primary}20`, borderColor: `${theme.primary}40`, color: theme.color }}
                        className="w-7 h-7 rounded-lg border flex items-center justify-center group-hover/item:scale-110 transition-transform shadow-sm"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <span>Launch</span>
                    </Link>

                    {/* Wallet */}
                    <Link
                      href="/wallet"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-zinc-100 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer group/item"
                    >
                      <div
                        style={{ backgroundColor: `${theme.primary}20`, borderColor: `${theme.primary}40`, color: theme.color }}
                        className="w-7 h-7 rounded-lg border flex items-center justify-center group-hover/item:scale-110 transition-transform shadow-sm"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                        </svg>
                      </div>
                      <span>Wallet</span>
                    </Link>

                    <div className="my-1 border-t border-white/[0.1]" />

                    {/* Sign Out */}
                    <button
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false)
                        onLogout()
                      }}
                      disabled={loggingOut}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-rose-400 hover:text-rose-200 hover:bg-rose-500/15 transition-all w-full text-left cursor-pointer group/item"
                    >
                      <div className="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-400/40 flex items-center justify-center text-rose-400 group-hover/item:scale-110 transition-transform shadow-sm">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                      </div>
                      <span>Sign Out</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleLogin}
                loading={loggingIn}
                className="gap-1.5 sm:gap-2 text-xs font-bold py-1.5 sm:py-2 px-2.5 sm:px-4 shadow-lg shadow-emerald-950/40 flex-shrink-0"
              >
                {!loggingIn && (
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current flex-shrink-0" aria-hidden>
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.859L1.506 2.25h6.953l4.256 5.625 5.529-5.625Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                )}
                <span className="hidden sm:inline">Log in with X</span>
                <span className="sm:hidden">Login</span>
              </Button>

              {/* Mobile Nav Trigger when Logged Out */}
              <div className="relative md:hidden">
                <button
                  type="button"
                  onClick={() => setDropdownOpen((prev) => !prev)}
                  className="p-1.5 rounded-xl liquid-pill text-zinc-300 hover:text-white transition-all cursor-pointer flex items-center justify-center flex-shrink-0"
                  aria-label="Navigation Menu"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>

                {dropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                    <div className="absolute right-0 top-full mt-2.5 w-48 bg-black/95 backdrop-blur-2xl border border-white/15 rounded-2xl p-2 z-50 flex flex-col gap-1 shadow-[0_25px_60px_rgba(0,0,0,0.95)] ring-1 ring-white/15 animate-fadeIn">
                      <Link
                        href="/coin"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-zinc-100 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer group/item"
                      >
                        <div
                          style={{ backgroundColor: `${theme.primary}20`, borderColor: `${theme.primary}40`, color: theme.color }}
                          className="w-7 h-7 rounded-lg border flex items-center justify-center group-hover/item:scale-110 transition-transform shadow-sm"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <span>Coins</span>
                      </Link>
                      <Link
                        href="/launch"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-zinc-100 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer group/item"
                      >
                        <div
                          style={{ backgroundColor: `${theme.primary}20`, borderColor: `${theme.primary}40`, color: theme.color }}
                          className="w-7 h-7 rounded-lg border flex items-center justify-center group-hover/item:scale-110 transition-transform shadow-sm"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </div>
                        <span>Launch</span>
                      </Link>
                      <Link
                        href="/wallet"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-zinc-100 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer group/item"
                      >
                        <div
                          style={{ backgroundColor: `${theme.primary}20`, borderColor: `${theme.primary}40`, color: theme.color }}
                          className="w-7 h-7 rounded-lg border flex items-center justify-center group-hover/item:scale-110 transition-transform shadow-sm"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                          </svg>
                        </div>
                        <span>Wallet</span>
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Live Token Activity Ticker Bar below Navbar */}
      <LiveTicker />
    </header>
  )
}