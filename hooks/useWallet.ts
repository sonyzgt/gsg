'use client'

import { useWallets, usePrivy, useCreateWallet, getEmbeddedConnectedWallet } from '@privy-io/react-auth'
import { parseEther, createWalletClient, custom, type Hash } from 'viem'
import { activeChain } from '@/lib/chains'
import { useEffect, useState, useCallback, useRef } from 'react'

export function useWallet() {
  const { wallets } = useWallets()
  const { user, authenticated, ready } = usePrivy()
  const { createWallet } = useCreateWallet()
  const [sending, setSending] = useState(false)
  const [creatingWallet, setCreatingWallet] = useState(false)
  const [txHash, setTxHash] = useState<Hash | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Saldo state (fetch dari server-side API agar tidak kena rate-limit RPC)
  const [balanceEth, setBalanceEth] = useState<string | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [unifiedServerAddress, setUnifiedServerAddress] = useState<`0x${string}` | null>(null)

  // User authentication check
  const isAuth = ready && (authenticated || !!user)

  // 1. Check if user explicitly connected an external wallet (MetaMask, Rabby, WalletConnect)
  const externalWallet = wallets?.find((w) => w.walletClientType !== 'privy')
  const embeddedWallet = isAuth
    ? (getEmbeddedConnectedWallet(wallets) ??
       wallets?.find((w) => w.walletClientType === 'privy') ??
       wallets?.[0])
    : undefined
  const isExternalWallet = !!externalWallet

  // 2. Resolve Privy Server Wallet for Social login (Twitter / Google)
  const twitterHandle = user?.twitter?.username || user?.email?.address?.split('@')[0]

  useEffect(() => {
    if (!twitterHandle || isExternalWallet) return
    fetch(`/api/bot/wallet?handle=${encodeURIComponent(twitterHandle)}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.walletAddress) {
          setUnifiedServerAddress(data.walletAddress as `0x${string}`)
        }
      })
      .catch(console.error)
  }, [twitterHandle, isExternalWallet])

  // 3. Active address: External wallet if connected, otherwise Server Wallet
  const address = isAuth
    ? ((externalWallet?.address as `0x${string}` | undefined) ?? unifiedServerAddress ?? (user?.wallet?.address as `0x${string}` | undefined))
    : undefined

  // 4. Fetch balance dari server-side API (hindari RPC rate-limit & CORS)
  const refetchBalance = useCallback(async () => {
    if (!address) return
    setBalanceLoading(true)
    try {
      const res = await fetch('/api/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      })
      if (res.ok) {
        const data = await res.json()
        setBalanceEth(data.balanceEth ?? '0.00000000')
      }
    } catch (e) {
      console.error('Balance fetch error:', e)
    } finally {
      setBalanceLoading(false)
    }
  }, [address])

  // Auto-fetch balance saat address tersedia, polling tiap 5 detik, dan auto-refresh saat window focus
  useEffect(() => {
    if (!address) return

    const timeout = setTimeout(() => { refetchBalance() }, 0)
    const interval = setInterval(() => { refetchBalance() }, 5000)

    const handleFocus = () => { refetchBalance() }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refetchBalance()
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [address, refetchBalance])

  /**
   * Kirim ETH ke alamat tujuan (to) dengan jumlah `amount`.
   * Menggunakan viem walletClient langsung — bypass popup UI Privy sepenuhnya.
   */
  async function sendEth(to: string, amount: string): Promise<Hash> {
    if (!embeddedWallet) throw new Error('No embedded wallet found')
    setSending(true)
    setError(null)
    setTxHash(null)

    try {
      // Paksa switch ke Robinhood Chain Mainnet
      await embeddedWallet.switchChain(activeChain.id)
      const provider = await embeddedWallet.getEthereumProvider()

      // Gunakan viem walletClient langsung — bypass semua popup Privy
      const client = createWalletClient({
        chain: activeChain,
        transport: custom(provider),
      })

      const [account] = await client.getAddresses()
      const hash = await client.sendTransaction({
        account,
        to: to as `0x${string}`,
        value: parseEther(amount),
        gas: BigInt(50_000),
      })

      setTxHash(hash)
      // Refresh balance setelah transaksi
      setTimeout(() => refetchBalance(), 3000)
      return hash
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaksi gagal'
      setError(msg)
      throw err
    } finally {
      setSending(false)
    }
  }

  const balance = balanceEth !== null
    ? {
        formatted: balanceEth,
        symbol: 'ETH',
        value: BigInt(0), // placeholder for compatibility
        decimals: 18,
      }
    : undefined

  return {
    address,
    balance,
    balanceLoading,
    sending,
    creatingWallet,
    txHash,
    error,
    sendEth,
    createWallet,
    refetchBalance,
    user,
    embeddedWallet,
  }
}
