'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useWallet } from './useWallet'
import { isAddress, getAddress } from 'viem'

export interface TokenHolding {
  address: string
  name: string
  symbol: string
  decimals: number
  balanceRaw: string
  balanceFormatted: string
  balanceNumber: number
  usdPrice: number
  valueUsd: number
  icon: string
}

function getStoredArray(key: string, fallback: string[]): string[] {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

// Daftar token default resmi di Robinhood Chain (hanya stablecoin USDG)
const DEFAULT_TOKENS: string[] = [
  '0x5fc5360d0400a0fd4f2af552add042d716f1d168', // USDG (Global Dollar)
]

export function useTokens() {
  const { user } = usePrivy()
  const { address } = useWallet()

  const userId = user?.id || address || 'guest'
  const STORAGE_KEY = `rh_tracked_tokens_${userId}`

  const [trackedAddresses, setTrackedAddresses] = useState<string[]>(() =>
    getStoredArray(STORAGE_KEY, DEFAULT_TOKENS)
  )
  const [holdings, setHoldings] = useState<TokenHolding[]>([])
  const [loading, setLoading] = useState<boolean>(false)

  const trackedRef = useRef<string[]>(trackedAddresses)
  const isFetchingRef = useRef(false)

  useEffect(() => {
    trackedRef.current = trackedAddresses
  }, [trackedAddresses])

  // Listen to tokens_updated event from SwapModal or other components
  useEffect(() => {
    const handleTokensUpdated = () => {
      const updated = getStoredArray(STORAGE_KEY, DEFAULT_TOKENS)
      setTrackedAddresses(updated)
    }
    window.addEventListener('rh_tokens_updated', handleTokensUpdated)
    return () => window.removeEventListener('rh_tokens_updated', handleTokensUpdated)
  }, [STORAGE_KEY])

  const saveTrackedAddresses = useCallback(
    (newAddrs: string[]) => {
      const uniqueChecksum = Array.from(
        new Set(newAddrs.filter((a) => isAddress(a)).map((a) => getAddress(a)))
      )
      setTrackedAddresses(uniqueChecksum)
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(uniqueChecksum))
      }
    },
    [STORAGE_KEY]
  )

  // Fetch on-chain balances for tracked tokens without causing UI flickering
  const refetchTokenBalances = useCallback(async (isInitial = false) => {
    if (!address || isFetchingRef.current) return
    isFetchingRef.current = true

    if (isInitial) {
      setLoading(true)
    }

    try {
      const currentTracked = trackedRef.current
      const normalizedTracked = currentTracked.filter((a) => isAddress(a)).map((a) => getAddress(a))
      const normalizedDefaults = DEFAULT_TOKENS.filter((a) => isAddress(a)).map((a) => getAddress(a))
      const tokensToQuery = Array.from(new Set([...normalizedTracked, ...normalizedDefaults]))

      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: address,
          tokenAddresses: tokensToQuery,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const allHoldings: TokenHolding[] = data.holdings || []

        // De-duplikasi berdasarkan address (case-insensitive)
        const uniqueHoldingsMap = new Map<string, TokenHolding>()
        for (const h of allHoldings) {
          if (!isAddress(h.address)) continue
          const clean = getAddress(h.address)
          if (!uniqueHoldingsMap.has(clean)) {
            uniqueHoldingsMap.set(clean, { ...h, address: clean })
          }
        }
        const uniqueHoldings: TokenHolding[] = Array.from(uniqueHoldingsMap.values())

        // Tampilkan semua token dengan saldo > 0
        const visibleHoldings = uniqueHoldings
          .filter((h: TokenHolding) => h.balanceNumber > 0)
          .sort((a: TokenHolding, b: TokenHolding) => (b.valueUsd || 0) - (a.valueUsd || 0))

        setHoldings(visibleHoldings)
      }
    } catch (e) {
      console.error('Error fetching token balances:', e)
    } finally {
      isFetchingRef.current = false
      if (isInitial) {
        setLoading(false)
      }
    }
  }, [address])

  // Polling every 5 seconds without restarting interval or triggering cascading renders
  useEffect(() => {
    if (!address) return

    const timer = setTimeout(() => {
      refetchTokenBalances(true)
    }, 0)

    const interval = setInterval(() => {
      refetchTokenBalances(false)
    }, 5000)

    const handleFocus = () => { refetchTokenBalances(false) }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refetchTokenBalances(false)
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearTimeout(timer)
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [address, refetchTokenBalances])

  // Import custom token CA manual
  const importToken = useCallback(
    (customCa: string) => {
      if (!isAddress(customCa)) return
      const cleanCa = getAddress(customCa)
      const updated = Array.from(new Set([...trackedRef.current, cleanCa]))
      saveTrackedAddresses(updated)
      setTimeout(() => refetchTokenBalances(false), 50)
    },
    [saveTrackedAddresses, refetchTokenBalances]
  )

  // Hapus / sembunyikan token dari tampilan portofolio
  const removeToken = useCallback(
    (targetCa: string) => {
      if (!isAddress(targetCa)) return
      const cleanTarget = getAddress(targetCa)
      const updated = trackedRef.current.filter((a) => getAddress(a) !== cleanTarget)
      saveTrackedAddresses(updated)
      setHoldings((prev) => prev.filter((h) => getAddress(h.address) !== cleanTarget))
    },
    [saveTrackedAddresses]
  )

  return {
    holdings,
    loading,
    importToken,
    removeToken,
    refetchTokenBalances,
  }
}

/**
 * Helper function global untuk mendaftarkan token baru (misal setelah berhasil Swap)
 */
export function trackTokenAddress(userIdOrAddress: string, tokenAddress: string) {
  if (!isAddress(tokenAddress) || typeof window === 'undefined') return
  const cleanAddr = getAddress(tokenAddress)
  const key = `rh_tracked_tokens_${userIdOrAddress}`
  const existing = getStoredArray(key, DEFAULT_TOKENS)
  const updated = Array.from(new Set([...existing.map((a) => (isAddress(a) ? getAddress(a) : a)), cleanAddr]))
  localStorage.setItem(key, JSON.stringify(updated))
  window.dispatchEvent(new Event('rh_tokens_updated'))
}
