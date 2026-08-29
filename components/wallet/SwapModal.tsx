'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import SparkleIcon from '@/components/ui/SparkleIcon'
import {
  parseEther,
  parseUnits,
  maxUint256,
  createPublicClient,
  createWalletClient,
  custom,
  http,
  isAddress,
  encodeFunctionData,
  getAddress,
  erc20Abi,
  zeroAddress,
} from 'viem'
import { useWallet } from '@/hooks/useWallet'
import { activeChain } from '@/lib/chains'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'
import { usePrivy, useLoginWithOAuth } from '@privy-io/react-auth'
import { trackTokenAddress } from '@/hooks/useTokens'
import type { TokenPrice } from '@/app/api/token-price/route'
import { PONS_CURVE_ABI } from '@/lib/pons-v2'
import { useTheme } from '@/context/ThemeContext'

interface SwapModalProps {
  open: boolean
  onClose: () => void
  initialCa?: string
}

const SWAP_ROUTER = '0x1e406484F1F204b23cE84B9901C0171a738fd406' as `0x${string}`
const WETH        = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73' as `0x${string}`

const SWAP_ABI = [
  {
    name: 'exactInputSingle',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenIn',            type: 'address' },
          { name: 'tokenOut',           type: 'address' },
          { name: 'fee',                type: 'uint24'  },
          { name: 'recipient',          type: 'address' },
          { name: 'deadline',           type: 'uint256' },
          { name: 'amountIn',           type: 'uint256' },
          { name: 'amountOutMinimum',   type: 'uint256' },
          { name: 'sqrtPriceLimitX96',  type: 'uint160' },
        ],
      },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
  {
    name: 'unwrapWETH9',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'amountMinimum', type: 'uint256' },
      { name: 'recipient',     type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'multicall',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'data', type: 'bytes[]' }],
    outputs: [{ name: 'results', type: 'bytes[]' }],
  },
] as const

function calcOutput(
  isBuy: boolean,
  amountIn: number,
  tokenInfo: TokenPrice,
  slippage: number,
) {
  if (amountIn <= 0 || tokenInfo.priceNative <= 0) return { output: 0, minimum: 0 }
  
  // feeBps (e.g. 100 = 1%) + creatorTaxBps (e.g. 30 = 0.3%)
  const feeBps = tokenInfo.poolFee || 100
  const creatorTaxBps = tokenInfo.creatorTaxBps || 0
  const totalFeeFraction = (feeBps + creatorTaxBps) / 10_000

  let raw = 0
  if (isBuy) {
    // In Pons V2 curve: fee and tax come off quoteIn before pricing
    const netSpend = amountIn * (1 - totalFeeFraction)
    raw = netSpend / tokenInfo.priceNative
  } else {
    // In Pons V2 curve: gross output is calculated first, then fees deducted
    const gross = amountIn * tokenInfo.priceNative
    raw = gross * (1 - totalFeeFraction)
  }

  const minimum = raw * (1 - slippage / 100)
  return { output: raw, minimum }
}

function fmt(n: number, decimals = 6): string {
  if (n === 0) return '0'
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (n >= 1)    return n.toFixed(4)
  return n.toFixed(decimals)
}

export default function SwapModal({ open, onClose, initialCa }: SwapModalProps) {
  const { user, authenticated } = usePrivy()
  const { balance, address, embeddedWallet, refetchBalance } = useWallet()
  const { theme } = useTheme()
  const [loggingIn, setLoggingIn] = useState(false)

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

  // â”€â”€ State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [caInput,      setCaInput]      = useState(initialCa || '')
  const [tokenInfo,    setTokenInfo]    = useState<TokenPrice | null>(null)
  const [fetchingInfo, setFetchingInfo] = useState(false)
  const [infoError,    setInfoError]    = useState('')

  const [isBuy,    setIsBuy]    = useState(true)
  const [amount,   setAmount]   = useState('')
  const [slippage, setSlippage] = useState(0.5)
  const [showSettings, setShowSettings] = useState(false)

  const [tokenBalance,    setTokenBalance]    = useState(0)
  const [fetchingBalance, setFetchingBalance] = useState(false)

  const [needsApproval, setNeedsApproval] = useState(false)
  const [approving,     setApproving]     = useState(false)
  const [swapping,      setSwapping]      = useState(false)

  // â”€â”€ Derived â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const amountNum   = parseFloat(amount) || 0
  const ethBalance  = balance ? parseFloat(balance.formatted) : 0
  const maxBalance  = isBuy ? Math.max(0, ethBalance - 0.0005) : tokenBalance

  const { output, minimum } = tokenInfo
    ? calcOutput(isBuy, amountNum, tokenInfo, slippage)
    : { output: 0, minimum: 0 }

  const fromSymbol = isBuy ? 'ETH' : (tokenInfo?.symbol ?? 'TOKEN')
  const toSymbol   = isBuy ? (tokenInfo?.symbol ?? 'TOKEN') : 'ETH'

  const hasEnough  = amountNum > 0 && amountNum <= maxBalance
  const hasPrice   = tokenInfo ? tokenInfo.priceNative > 0 : false
  const canSwap    = hasEnough && !!tokenInfo && !swapping && !approving && hasPrice && !!address

  // â”€â”€ Fetch token info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const fetchTokenInfo = useCallback(async (addr: string) => {
    const clean = addr.trim()
    const isTxUrl = clean.includes('/tx/') || (clean.startsWith('0x') && clean.length === 66)
    if (!clean || (!isAddress(clean) && !isTxUrl)) {
      setTokenInfo(null)
      setInfoError(clean ? 'Invalid contract address or transaction link' : '')
      return
    }
    setFetchingInfo(true)
    setInfoError('')
    try {
      const res = await fetch('/api/token-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: clean }),
      })
      if (res.ok) {
        const data: TokenPrice = await res.json()
        setTokenInfo(data)
        if (data.address && data.address.toLowerCase() !== clean.toLowerCase() && isAddress(data.address)) {
          setCaInput(data.address)
        }
        if (data.priceNative === 0) {
          setInfoError('Token price not found on DEX')
        }
      } else {
        setInfoError('Token not found on DEX')
        setTokenInfo(null)
      }
    } catch {
      setInfoError('Failed to fetch token info')
      setTokenInfo(null)
    } finally {
      setFetchingInfo(false)
    }
  }, [])

  // Debounced fetch on CA change
  useEffect(() => {
    const t = setTimeout(() => { fetchTokenInfo(caInput) }, 400)
    return () => clearTimeout(t)
  }, [caInput, fetchTokenInfo])

  // Sync initialCa
  useEffect(() => {
    const t = setTimeout(() => { if (initialCa) setCaInput(initialCa) }, 0)
    return () => clearTimeout(t)
  }, [initialCa])

  // â”€â”€ Fetch token balance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const fetchTokenBalance = useCallback(async (tokenAddr: string) => {
    if (!address || !isAddress(tokenAddr)) return
    setFetchingBalance(true)
    try {
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress: address, tokenAddresses: [tokenAddr] }),
      })
      if (res.ok) {
        const data = await res.json()
        const found = data.holdings?.find(
          (h: { address: string; balanceNumber: number }) =>
            h.address.toLowerCase() === tokenAddr.toLowerCase()
        )
        setTokenBalance(found?.balanceNumber ?? 0)
      }
    } catch { /* ignore */ } finally {
      setFetchingBalance(false)
    }
  }, [address])

  useEffect(() => {
    const t = setTimeout(() => {
      if (tokenInfo?.address && address) fetchTokenBalance(tokenInfo.address)
    }, 0)
    return () => clearTimeout(t)
  }, [tokenInfo?.address, address, fetchTokenBalance])

  // â”€â”€ Helper: Determine Approval Spender â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const getSpender = useCallback(() => {
    if (!tokenInfo) return SWAP_ROUTER
    if (tokenInfo.dexType === 'pons-v2') {
      const targetCurve = tokenInfo.curveAddress || tokenInfo.poolAddress
      if (targetCurve && isAddress(targetCurve)) return getAddress(targetCurve)
    }
    return SWAP_ROUTER
  }, [tokenInfo])

  // â”€â”€ Check Allowance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const checkAllowance = useCallback(async () => {
    if (isBuy || !address || !tokenInfo?.address) {
      setNeedsApproval(false)
      return
    }
    const tokenAddr = getAddress(tokenInfo.address)
    const userAddr  = getAddress(address)
    const targetSpender = getSpender()

    try {
      const pubClient = createPublicClient({ chain: activeChain, transport: http('https://robinhood-rpc.publicnode.com') })
      const allowance = await pubClient.readContract({
        address:      tokenAddr,
        abi:          erc20Abi,
        functionName: 'allowance',
        args:         [userAddr, targetSpender],
      })

      const amountInUnits = amountNum > 0 ? parseUnits(amount, tokenInfo.decimals) : 1n
      setNeedsApproval(allowance < amountInUnits)
    } catch {
      setNeedsApproval(false)
    }
  }, [isBuy, address, tokenInfo, amount, amountNum, getSpender])

  useEffect(() => {
    const t = setTimeout(() => {
      checkAllowance()
    }, 0)
    return () => clearTimeout(t)
  }, [checkAllowance])

  // â”€â”€ Helper: Get Viem Wallet Client â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function getViemWalletClient() {
    if (!embeddedWallet) throw new Error('Embedded wallet not available. Please ensure you are logged in.')
    await embeddedWallet.switchChain(activeChain.id)
    const provider = await embeddedWallet.getEthereumProvider()
    const client = createWalletClient({
      chain: activeChain,
      transport: custom(provider),
    })
    const [account] = await client.getAddresses()
    return { client, account }
  }

  // â”€â”€ Approve Token Execution â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function handleApprove() {
    if (!tokenInfo?.address || !address || !embeddedWallet) return
    setApproving(true)
    try {
      const { client, account } = await getViemWalletClient()
      const tokenAddr = getAddress(tokenInfo.address)
      const targetSpender = getSpender()

      const approveData = encodeFunctionData({
        abi:          erc20Abi,
        functionName: 'approve',
        args:         [targetSpender, maxUint256],
      })

      toast('Approving token access in wallet...')
      const hash = await client.sendTransaction({
        account,
        to:   tokenAddr,
        data: approveData,
        gas:  100000n,
      })

      toast.success(`${tokenInfo.symbol} access approved! You can now swap.`)
      setNeedsApproval(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed'
      if (msg.includes('cancel') || msg.includes('reject') || msg.includes('denied')) {
        toast.error('Approval canceled.')
      } else {
        toast.error(`${msg.slice(0, 120)}`)
      }
    } finally {
      setApproving(false)
    }
  }

  // â”€â”€ Swap Execution â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function handleSwap() {
    if (!canSwap || !tokenInfo || !embeddedWallet || !address) return

    const tokenAddr = getAddress(tokenInfo.address)
    const userAddr  = getAddress(address)
    const fee       = tokenInfo.poolFee
    const deadline  = BigInt(Math.floor(Date.now() / 1000) + 1200)
    const minOut    = BigInt(0)

    setSwapping(true)

    try {
      const { client, account } = await getViemWalletClient()

      // Verify allowance before sell execution
      if (!isBuy) {
        const targetSpender = getSpender()
        const pubClient = createPublicClient({ chain: activeChain, transport: http('https://robinhood-rpc.publicnode.com') })
        const currentAllowance = await pubClient.readContract({
          address:      tokenAddr,
          abi:          erc20Abi,
          functionName: 'allowance',
          args:         [userAddr, targetSpender],
        })
        const amountInUnits = parseUnits(amount, tokenInfo.decimals)
        if (currentAllowance < amountInUnits) {
          toast('Step 1/2: Approving token access in wallet...')
          const approveData = encodeFunctionData({
            abi:          erc20Abi,
            functionName: 'approve',
            args:         [targetSpender, maxUint256],
          })
          await client.sendTransaction({
            account,
            to:   tokenAddr,
            data: approveData,
            gas:  100000n,
          })
          toast.success(`${tokenInfo.symbol} access approved! Please click Swap again.`)
          setNeedsApproval(false)
          setSwapping(false)
          return
        }
      }

      const isPonsV2 = tokenInfo.dexType === 'pons-v2' || tokenInfo.source === 'onchain_reserves'

      let txHash = ''

      if (isPonsV2) {
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // â”€â”€ ROUTE 1: PONS V2 BONDING CURVE â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        const curveAddr = getAddress(tokenInfo.curveAddress || tokenInfo.poolAddress || tokenAddr)
        const isNative = tokenInfo.isNative !== false && (!tokenInfo.pairToken || tokenInfo.pairToken === zeroAddress || tokenInfo.pairToken === '0x0000000000000000000000000000000000000000')

        if (isBuy) {
          const amountInWei = parseEther(amount)
          const buyData = encodeFunctionData({
            abi: PONS_CURVE_ABI,
            functionName: 'buy',
            args: [amountInWei, minOut, userAddr],
          })

          txHash = await client.sendTransaction({
            account,
            to:    curveAddr,
            value: isNative ? amountInWei : 0n,
            data:  buyData,
            gas:   400000n,
          })
        } else {
          // Sell Pons Token directly to Curve
          const pubClient = createPublicClient({ chain: activeChain, transport: http('https://robinhood-rpc.publicnode.com') })
          const exactBal = await pubClient.readContract({
            address: tokenAddr,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [userAddr],
          }).catch(() => 0n)

          let amountInUnits = parseUnits(amount, tokenInfo.decimals)
          if (amountInUnits > exactBal && exactBal > 0n) {
            amountInUnits = exactBal
          }

          const sellData = encodeFunctionData({
            abi: PONS_CURVE_ABI,
            functionName: 'sell',
            args: [amountInUnits, minOut, userAddr],
          })

          txHash = await client.sendTransaction({
            account,
            to:   curveAddr,
            data: sellData,
            gas:  400000n,
          })
        }
      } else {
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // â”€â”€ ROUTE 2: SUSHISWAP V3 ROUTER â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        if (isBuy) {
          const amountInWei = parseEther(amount)
          const calldata = encodeFunctionData({
            abi: SWAP_ABI,
            functionName: 'exactInputSingle',
            args: [{
              tokenIn:           WETH,
              tokenOut:          tokenAddr,
              fee,
              recipient:         userAddr,
              deadline,
              amountIn:          amountInWei,
              amountOutMinimum:  minOut,
              sqrtPriceLimitX96: BigInt(0),
            }],
          })

          txHash = await client.sendTransaction({
            account,
            to:    SWAP_ROUTER,
            value: amountInWei,
            data:  calldata,
            gas:   400000n,
          })
        } else {
          // Sell Token to Native ETH via Sushi V3 + Atomic Unwrap
          const pubClient = createPublicClient({ chain: activeChain, transport: http('https://robinhood-rpc.publicnode.com') })
          const exactBal = await pubClient.readContract({
            address:      tokenAddr,
            abi:          erc20Abi,
            functionName: 'balanceOf',
            args:         [userAddr],
          }).catch(() => 0n)

          let amountInUnits = parseUnits(amount, tokenInfo.decimals)
          if (amountInUnits > exactBal && exactBal > 0n) {
            amountInUnits = exactBal
          }

          // 1. Exact Input Single: Token -> WETH (recipient: SWAP_ROUTER)
          const swapCall = encodeFunctionData({
            abi: SWAP_ABI,
            functionName: 'exactInputSingle',
            args: [{
              tokenIn:           tokenAddr,
              tokenOut:          WETH,
              fee,
              recipient:         SWAP_ROUTER,
              deadline,
              amountIn:          amountInUnits,
              amountOutMinimum:  minOut,
              sqrtPriceLimitX96: BigInt(0),
            }],
          })

          // 2. Unwrap WETH -> Native ETH directly to userAddr
          const unwrapCall = encodeFunctionData({
            abi: SWAP_ABI,
            functionName: 'unwrapWETH9',
            args: [0n, userAddr],
          })

          // 3. Execute Atomic Multicall for Native ETH payout
          const calldata = encodeFunctionData({
            abi: SWAP_ABI,
            functionName: 'multicall',
            args: [[swapCall, unwrapCall]],
          })

          txHash = await client.sendTransaction({
            account,
            to:   SWAP_ROUTER,
            data: calldata,
            gas:  450000n,
          })
        }
      }

      toast.success(`Swap ${fromSymbol} → ${toSymbol} successful!`)

      if (isBuy && tokenInfo?.address) {
        if (user?.id) trackTokenAddress(user.id, tokenInfo.address)
        if (address) trackTokenAddress(address, tokenInfo.address)
      }
      await refetchBalance()
      if (tokenInfo.address) fetchTokenBalance(tokenInfo.address)
      onClose()

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed'
      if (msg.includes('cancel') || msg.includes('reject') || msg.includes('denied') || msg.includes('User rejected')) {
        toast.error('Transaction canceled.')
      } else if (msg.includes('insufficient funds') || msg.includes('exceeds the balance')) {
        toast.error('Insufficient funds for swap + gas.')
      } else {
        toast.error(`${msg.slice(0, 120)}`)
      }
    } finally {
      setSwapping(false)
    }
  }

  // â”€â”€ UI Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function handleFlip() {
    setIsBuy(p => !p)
    setAmount('')
  }

  function handleMax() {
    if (maxBalance > 0) {
      if (isBuy) {
        setAmount(maxBalance.toFixed(4))
      } else {
        setAmount(maxBalance >= 1 ? Math.floor(maxBalance).toString() : maxBalance.toString())
      }
    }
  }

  function handleClose() {
    setCaInput('')
    setTokenInfo(null)
    setAmount('')
    setInfoError('')
    setIsBuy(true)
    setNeedsApproval(false)
    onClose()
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Modal open={open} onClose={handleClose} title="// DEX_SWAP">
      <div className="flex flex-col gap-3 font-mono select-none">

        {/* Network & Slippage Header */}
        <div className="flex items-center gap-2 text-xs font-black uppercase text-zinc-300 bg-[#121519] border-2 border-zinc-800 rounded-lg px-3 py-2 shadow-[2px_2px_0px_0px_#000000]">
          <span
            className="w-1.5 h-1.5 rounded-none"
            style={{ backgroundColor: theme.color }}
          />
          <span>ROBINHOOD MAINNET [4663]</span>
          <button
            onClick={() => setShowSettings(p => !p)}
            className="ml-auto text-zinc-400 hover:text-white transition-colors text-xs flex items-center gap-1 cursor-pointer"
            title="Slippage settings"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>{slippage}%</span>
          </button>
        </div>

        {/* Slippage Settings Drawer */}
        {showSettings && (
          <div className="bg-[#121519] border-2 border-zinc-700 rounded-lg p-2.5 flex flex-col gap-2 animate-fadeIn shadow-[2px_2px_0px_0px_#000000]">
            <span className="text-xs font-black uppercase text-zinc-300">// SLIPPAGE_TOLERANCE</span>
            <div className="flex gap-2">
              {[0.1, 0.5, 1.0, 3.0].map(s => (
                <button
                  key={s}
                  onClick={() => setSlippage(s)}
                  className={`flex-1 py-1 text-xs rounded border transition-all cursor-pointer font-black ${
                    slippage === s
                      ? 'bg-[var(--theme-color)] text-black border-black shadow-[1px_1px_0px_0px_#000000]'
                      : 'bg-black text-zinc-400 border-zinc-700 hover:text-white'
                  }`}
                >
                  {s}%
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Token CA Input */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-black uppercase text-zinc-300">TARGET TOKEN (CA / LINK)</label>
            {fetchingInfo && (
              <span className="text-[10px] font-black text-theme-light animate-pulse uppercase">
                FETCHING POOL...
              </span>
            )}
          </div>
          <input
            type="text"
            value={caInput}
            onChange={e => setCaInput(e.target.value)}
            placeholder="0x... or https://robinhood.social/tx/..."
            className="w-full bg-[#121519] border-2 border-zinc-700 focus:border-white rounded-lg px-3.5 py-2 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none transition-colors shadow-[2px_2px_0px_0px_#000000]"
          />
          {infoError && (
            <p className="text-[11px] text-rose-400 mt-1 font-bold">{infoError}</p>
          )}

          {/* Quick pick chips */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className="text-[10px] text-zinc-500 font-black uppercase tracking-wider">QUICK PICK:</span>
            <button
              onClick={() => setCaInput('0x5fc5360d0400a0fd4f2af552add042d716f1d168')}
              className="text-[10px] font-black px-2 py-0.5 rounded bg-zinc-900 hover:bg-white text-zinc-300 hover:text-black border border-zinc-700 hover:border-white shadow-[1px_1px_0px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer uppercase"
            >
              $USDG
            </button>
          </div>
        </div>

        {/* Token Card preview */}
        {tokenInfo && (
          <div className="bg-[#121519] border-2 border-zinc-700 rounded-lg p-2.5 flex items-center justify-between gap-3 shadow-[2px_2px_0px_0px_#000000] animate-fadeIn">
            <div className="flex items-center gap-2.5 min-w-0">
              <SparkleIcon size={28} className="flex-shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-white truncate uppercase">{tokenInfo.name}</span>
                  <span className="text-[11px] text-zinc-400 font-bold">(${tokenInfo.symbol})</span>
                </div>
                <div className="text-[10px] text-theme-light">
                  {tokenInfo.priceNative > 0
                    ? `1 ${tokenInfo.symbol} ≈ ${tokenInfo.priceNative < 0.0001 ? tokenInfo.priceNative.toFixed(10) : tokenInfo.priceNative.toFixed(6)} ETH`
                    : 'Pool not active'}
                </div>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="text-[9px] font-black px-1.5 py-0.5 bg-[var(--theme-color)] text-black border border-black uppercase">
                {tokenInfo.dexType === 'pons-v2' ? 'PONS V2' : 'SUSHI V3'}
              </span>
            </div>
          </div>
        )}

        {/* FROM */}
        <div className="bg-[#121519] border-2 border-zinc-700 rounded-lg p-3 shadow-[2px_2px_0px_0px_#000000]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-black uppercase text-zinc-400">// YOU_PAY</span>
            <div className="flex items-center gap-1 text-[11px] text-zinc-400">
              <span>BAL: {maxBalance.toFixed(4)} {fromSymbol}</span>
              {maxBalance > 0 && (
                <button
                  onClick={handleMax}
                  className="text-theme-light hover:underline font-black ml-1 cursor-pointer uppercase"
                >
                  [MAX]
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.0"
              min="0"
              step="any"
              className="flex-1 min-w-0 bg-transparent text-xl font-black text-white focus:outline-none placeholder-zinc-600"
            />
            <div className="flex items-center gap-1.5 bg-black border border-zinc-700 rounded px-2.5 py-1 text-xs font-black text-white select-none flex-shrink-0">
              <SparkleIcon size={14} className="flex-shrink-0" />
              <span>{fromSymbol}</span>
            </div>
          </div>
        </div>

        {/* Flip button */}
        <div className="flex justify-center -my-1">
          <button
            onClick={handleFlip}
            className="bg-[#181b20] hover:bg-white text-zinc-400 hover:text-black border-2 border-zinc-700 hover:border-white rounded-lg p-1.5 transition-all cursor-pointer shadow-[2px_2px_0px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5"
            title="Switch Direction"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </button>
        </div>

        {/* TO */}
        <div className="bg-[#121519] border-2 border-zinc-700 rounded-lg p-3 shadow-[2px_2px_0px_0px_#000000]">
          <div className="flex flex-wrap items-center justify-between gap-1 mb-1.5">
            <span className="text-xs font-black uppercase text-zinc-400">// YOU_RECEIVE (EST)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 text-xl font-black text-theme-light truncate">
              {tokenInfo && amountNum > 0 && output > 0 ? fmt(output) : '0.0'}
            </div>
            <div className="flex items-center gap-1.5 bg-black border border-zinc-700 rounded px-2.5 py-1 text-xs font-black text-white select-none flex-shrink-0">
              <SparkleIcon size={14} className="flex-shrink-0" />
              <span>{toSymbol}</span>
            </div>
          </div>
        </div>

        {/* Rate summary */}
        {tokenInfo && amountNum > 0 && output > 0 && (
          <div className="bg-black border-2 border-zinc-800 rounded-lg p-2.5 flex flex-col gap-1 text-[11px] text-zinc-400 font-mono">
            <div className="flex justify-between">
              <span>MARKET RATE:</span>
              <span className="text-white font-bold">
                {tokenInfo.priceNative > 0
                  ? isBuy
                    ? `1 ETH ≈ ${fmt(1 / tokenInfo.priceNative, 0)} ${tokenInfo.symbol}`
                    : `1 ${tokenInfo.symbol} ≈ ${tokenInfo.priceNative < 0.0001 ? tokenInfo.priceNative.toFixed(10) : tokenInfo.priceNative.toFixed(6)} ETH`
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>POOL FEE:</span>
              <span className="text-zinc-200 font-bold">{tokenInfo.poolFee / 10000}%</span>
            </div>
            <div className="flex justify-between">
              <span>MIN. RECEIVED ({slippage}% SLIP):</span>
              <span className="text-theme-light font-bold">{fmt(minimum)} {toSymbol}</span>
            </div>
          </div>
        )}

        {/* Action button */}
        {!authenticated || !address ? (
          <Button
            variant="primary"
            onClick={handleLogin}
            loading={loggingIn}
            className="w-full text-xs font-black py-3 uppercase"
          >
            CONNECT WALLET TO SWAP
          </Button>
        ) : !tokenInfo ? (
          <Button variant="secondary" disabled className="w-full py-2.5 text-xs font-black opacity-60">
            ENTER TOKEN CONTRACT ADDRESS
          </Button>
        ) : !hasPrice ? (
          <Button variant="secondary" disabled className="w-full py-2.5 text-xs font-black opacity-60">
            {tokenInfo.source === 'not_found'
              ? 'POOL NOT YET CREATED ON DEX'
              : 'PRICE NOT AVAILABLE'}
          </Button>
        ) : !hasEnough && amountNum > 0 ? (
          <Button variant="secondary" disabled className="w-full py-2.5 text-xs font-black text-rose-400 border-rose-500">
            INSUFFICIENT {fromSymbol} BALANCE
          </Button>
        ) : needsApproval ? (
          <Button
            variant="accent"
            onClick={handleApprove}
            disabled={approving}
            loading={approving}
            className="w-full text-xs font-black py-3 uppercase"
          >
            {approving ? 'APPROVING...' : `1. APPROVE ${tokenInfo.symbol}`}
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={handleSwap}
            disabled={!canSwap}
            loading={swapping}
            className="w-full text-xs font-black py-3 uppercase"
          >
            {swapping ? 'SWAPPING...' : `SWAP ${fromSymbol} → ${toSymbol}`}
          </Button>
        )}

      </div>
    </Modal>
  )
}

