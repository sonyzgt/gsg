'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import SparkleIcon from '@/components/ui/SparkleIcon'
import TokenImage from '@/components/ui/TokenImage'
import {
  parseEther,
  parseUnits,
  formatUnits,
  getAddress,
  encodeFunctionData,
  maxUint256,
  erc20Abi,
  createPublicClient,
  http,
  isAddress,
} from 'viem'
import { usePrivy, useLoginWithOAuth } from '@privy-io/react-auth'
import { useWallet } from '@/hooks/useWallet'
import { activeChain, robinhoodChain } from '@/lib/chains'
import {
  PonsV2TokenInfo,
  PONS_CURVE_ABI,
} from '@/lib/pons-v2'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'
import { useTheme } from '@/context/ThemeContext'

interface TokenSwapWidgetProps {
  token: PonsV2TokenInfo
  onSwapSuccess?: () => void
}

const SWAP_ROUTER = '0x1e406484F1F204b23cE84B9901C0171a738fd406' as `0x${string}`
const WETH = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73' as `0x${string}`

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
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'deadline', type: 'uint256' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
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
      { name: 'recipient', type: 'address' },
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

export default function TokenSwapWidget({ token, onSwapSuccess }: TokenSwapWidgetProps) {
  const { authenticated } = usePrivy()
  const { address, balance, embeddedWallet, refetchBalance } = useWallet()
  const { theme } = useTheme()
  const [loggingIn, setLoggingIn] = useState(false)

  const { initOAuth } = useLoginWithOAuth({
    onComplete: () => setLoggingIn(false),
    onError: () => setLoggingIn(false),
  })

  const [mode, setMode] = useState<'BUY' | 'SELL'>('BUY')
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState(1.0)
  const [showSettings, setShowSettings] = useState(false)

  const [tokenBalanceRaw, setTokenBalanceRaw] = useState<bigint>(0n)
  const [, setTokenBalanceFormatted] = useState('0')
  const [, setFetchingTokenBal] = useState(false)

  const [needsApproval, setNeedsApproval] = useState(false)
  const [approving, setApproving] = useState(false)
  const [swapping, setSwapping] = useState(false)

  const isBuy = mode === 'BUY'
  const isGraduated = token.graduated || token.phase === 2
  const isCurve = !isGraduated && (token.phase === 0 || token.phase === undefined)
  const curveAddress = token.curveAddress
  const targetSpender = isCurve ? curveAddress : SWAP_ROUTER

  // Fetch token balance
  const fetchTokenBal = useCallback(async () => {
    if (!address || !token.tokenAddress || !isAddress(token.tokenAddress)) return
    setFetchingTokenBal(true)
    try {
      const pubClient = createPublicClient({
        chain: robinhoodChain,
        transport: http('https://robinhood-rpc.publicnode.com'),
      })
      const bal = await pubClient.readContract({
        address: token.tokenAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [getAddress(address)],
      })
      setTokenBalanceRaw(bal)
      const formatted = formatUnits(bal, 18)
      setTokenBalanceFormatted(
        parseFloat(formatted) < 0.01 && bal > 0n
          ? formatted.slice(0, 8)
          : parseFloat(formatted).toLocaleString('en-US', { maximumFractionDigits: 2 })
      )
    } catch {
      // ignore
    } finally {
      setFetchingTokenBal(false)
    }
  }, [address, token.tokenAddress])

  // Check allowance on sell
  const checkAllowance = useCallback(async () => {
    if (isBuy || !address || !token.tokenAddress) {
      setNeedsApproval(false)
      return
    }
    try {
      const pubClient = createPublicClient({
        chain: robinhoodChain,
        transport: http('https://robinhood-rpc.publicnode.com'),
      })
      const spender = targetSpender
      const allowance = await pubClient.readContract({
        address: token.tokenAddress,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [getAddress(address), spender],
      })
      const inputAmount = parseFloat(amount) || 0
      if (inputAmount > 0) {
        const requiredWei = parseUnits(amount, 18)
        setNeedsApproval(allowance < requiredWei)
      } else {
        setNeedsApproval(allowance === 0n)
      }
    } catch {
      setNeedsApproval(false)
    }
  }, [isBuy, address, token.tokenAddress, targetSpender, amount])

  useEffect(() => {
    fetchTokenBal()
  }, [fetchTokenBal])

  useEffect(() => {
    checkAllowance()
  }, [checkAllowance])

  // Derived calculations
  const ethBalanceNum = balance ? parseFloat(balance.formatted) : 0
  const tokenBalanceNum = parseFloat(formatUnits(tokenBalanceRaw, 18))
  const amountNum = parseFloat(amount) || 0

  // Output estimation
  const estimatedOutput = useMemo(() => {
    if (amountNum <= 0) return 0
    const priceNative =
      token.priceNative > 0 ? token.priceNative : isGraduated ? 0.000000007 : 0.0000000025
    if (isBuy) {
      const feeDeduction = amountNum * 0.985
      return feeDeduction / priceNative
    } else {
      const grossEth = amountNum * priceNative
      return grossEth * 0.985
    }
  }, [amountNum, isBuy, token.priceNative, isGraduated])

  const minReceived = useMemo(() => {
    return estimatedOutput * (1 - slippage / 100)
  }, [estimatedOutput, slippage])

  const hasSufficientBalance = isBuy
    ? amountNum > 0 && amountNum <= Math.max(0, ethBalanceNum - 0.0001)
    : amountNum > 0 && amountNum <= tokenBalanceNum

  // Handle Token Approval
  async function handleApprove() {
    if (!address || !embeddedWallet || !token.tokenAddress) return
    setApproving(true)
    try {
      await embeddedWallet.switchChain(activeChain.id)
      const provider = await embeddedWallet.getEthereumProvider()
      const { createWalletClient, custom } = await import('viem')
      const walletClient = createWalletClient({
        chain: activeChain,
        transport: custom(provider),
      })
      const [account] = await walletClient.getAddresses()

      const calldata = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [targetSpender, maxUint256],
      })

      toast(`Approving $${token.symbol} access in wallet...`)

      await walletClient.sendTransaction({
        account,
        to: token.tokenAddress,
        data: calldata,
        gas: 100000n,
      })

      setNeedsApproval(false)
      toast.success(`Access approved for $${token.symbol}!`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Approval failed'
      if (msg.includes('cancel') || msg.includes('reject')) {
        toast.error('Approval canceled.')
      } else {
        toast.error(msg.slice(0, 100))
      }
    } finally {
      setApproving(false)
    }
  }

  // Handle Swap Execution
  async function handleSwap() {
    if (!address || !embeddedWallet || !hasSufficientBalance) return
    setSwapping(true)

    try {
      await embeddedWallet.switchChain(activeChain.id)
      const provider = await embeddedWallet.getEthereumProvider()
      const { createWalletClient, custom } = await import('viem')
      const walletClient = createWalletClient({
        chain: activeChain,
        transport: custom(provider),
      })
      const [account] = await walletClient.getAddresses()
      const userAddr = getAddress(address)

      if (isCurve) {
        // Active Bonding Curve Route
        if (isBuy) {
          toast(`Buying $${token.symbol} on Bonding Curve...`)
          const quoteIn = parseEther(amount)
          const minTokensOut = 0n

          const calldata = encodeFunctionData({
            abi: PONS_CURVE_ABI,
            functionName: 'buy',
            args: [quoteIn, minTokensOut, userAddr],
          })

          await walletClient.sendTransaction({
            account,
            to: curveAddress,
            value: quoteIn,
            data: calldata,
            gas: 300000n,
          })
        } else {
          toast(`Selling $${token.symbol} to Bonding Curve...`)
          const tokensIn = parseUnits(amount, 18)
          const minQuoteOut = 0n

          const calldata = encodeFunctionData({
            abi: PONS_CURVE_ABI,
            functionName: 'sell',
            args: [tokensIn, minQuoteOut, userAddr],
          })

          await walletClient.sendTransaction({
            account,
            to: curveAddress,
            data: calldata,
            gas: 300000n,
          })
        }
      } else {
        // Graduated DEX Route
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200)
        const fee = token.poolFee || 10000
        const tokenAddr = getAddress(token.tokenAddress)

        if (isBuy) {
          toast(`Buying $${token.symbol} on Uniswap v4 / DEX...`)
          const amountInWei = parseEther(amount)
          const calldata = encodeFunctionData({
            abi: SWAP_ABI,
            functionName: 'exactInputSingle',
            args: [
              {
                tokenIn: WETH,
                tokenOut: tokenAddr,
                fee,
                recipient: userAddr,
                deadline,
                amountIn: amountInWei,
                amountOutMinimum: 0n,
                sqrtPriceLimitX96: 0n,
              },
            ],
          })

          await walletClient.sendTransaction({
            account,
            to: SWAP_ROUTER,
            value: amountInWei,
            data: calldata,
            gas: 400000n,
          })
        } else {
          toast(`Selling $${token.symbol} on Uniswap v4 / DEX...`)
          const tokensIn = parseUnits(amount, 18)
          const swapCall = encodeFunctionData({
            abi: SWAP_ABI,
            functionName: 'exactInputSingle',
            args: [
              {
                tokenIn: tokenAddr,
                tokenOut: WETH,
                fee,
                recipient: SWAP_ROUTER,
                deadline,
                amountIn: tokensIn,
                amountOutMinimum: 0n,
                sqrtPriceLimitX96: 0n,
              },
            ],
          })

          const unwrapCall = encodeFunctionData({
            abi: SWAP_ABI,
            functionName: 'unwrapWETH9',
            args: [0n, userAddr],
          })

          const calldata = encodeFunctionData({
            abi: SWAP_ABI,
            functionName: 'multicall',
            args: [[swapCall, unwrapCall]],
          })

          await walletClient.sendTransaction({
            account,
            to: SWAP_ROUTER,
            data: calldata,
            gas: 450000n,
          })
        }
      }

      toast.success(
        `Swap ${isBuy ? `ETH → $${token.symbol}` : `$${token.symbol} → ETH`} successful!`
      )
      setAmount('')
      await Promise.all([refetchBalance(), fetchTokenBal()])
      if (onSwapSuccess) onSwapSuccess()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Swap failed'
      if (
        msg.includes('cancel') ||
        msg.includes('reject') ||
        msg.includes('denied') ||
        msg.includes('User rejected')
      ) {
        toast.error('Transaction canceled.')
      } else if (msg.includes('insufficient funds') || msg.includes('exceeds')) {
        toast.error('Insufficient funds for amount + gas fee.')
      } else {
        toast.error(msg.slice(0, 120))
      }
    } finally {
      setSwapping(false)
    }
  }

  return (
    <div
      style={{
        boxShadow: `5px 5px 0px 0px ${isBuy ? theme.color : '#f43f5e'}`,
      }}
      className="flex flex-col bg-[#0e1115] border-2 border-white rounded-xl p-5 sm:p-6 gap-4 font-mono select-none"
    >
      {/* Buy / Sell Tabs */}
      <div className="flex items-center justify-between gap-3">
        <div className="grid grid-cols-2 bg-black p-1 rounded-lg border-2 border-zinc-700 w-full shadow-[2px_2px_0px_0px_#000000]">
          <button
            type="button"
            onClick={() => {
              setMode('BUY')
              setAmount('')
            }}
            className={`py-2 text-xs font-black uppercase rounded transition-all cursor-pointer ${
              isBuy
                ? 'bg-[var(--theme-color)] text-black border border-black shadow-[2px_2px_0px_0px_#ffffff]'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            BUY ${token.symbol}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('SELL')
              setAmount('')
            }}
            className={`py-2 text-xs font-black uppercase rounded transition-all cursor-pointer ${
              !isBuy
                ? 'bg-rose-600 text-white border border-black shadow-[2px_2px_0px_0px_#ffffff]'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            SELL ${token.symbol}
          </button>
        </div>

        {/* Slippage Settings Button */}
        <button
          type="button"
          onClick={() => setShowSettings((p) => !p)}
          className="p-2 rounded bg-[#181b20] hover:bg-white text-zinc-400 hover:text-black border-2 border-zinc-700 hover:border-white transition-all text-xs font-black flex items-center gap-1 flex-shrink-0 cursor-pointer shadow-[2px_2px_0px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5"
          title="Slippage Settings"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>{slippage}%</span>
        </button>
      </div>

      {/* Slippage Settings Drawer */}
      {showSettings && (
        <div className="bg-[#121519] border-2 border-zinc-700 rounded-lg p-3 flex flex-col gap-2 animate-fadeIn shadow-[2px_2px_0px_0px_#000000]">
          <div className="flex justify-between items-center text-xs">
            <span className="font-black uppercase text-zinc-300">// SLIPPAGE_TOLERANCE</span>
            <span className="text-theme-light font-black">{slippage}%</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[0.5, 1.0, 2.5, 5.0].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSlippage(s)}
                className={`py-1 rounded text-xs font-black uppercase transition-all cursor-pointer border ${
                  slippage === s
                    ? 'bg-[var(--theme-color)] text-black border-black shadow-[2px_2px_0px_0px_#000000]'
                    : 'bg-black text-zinc-400 border-zinc-700 hover:text-white'
                }`}
              >
                {s}%
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Graduated Notification Banner */}
      {isGraduated && (
        <div className="bg-[#121519] border-2 border-amber-400/80 rounded-lg p-3 flex items-center justify-between gap-2 shadow-[2px_2px_0px_0px_#f59e0b] animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black px-1.5 py-0.5 bg-amber-400 text-black border border-black uppercase">
              GRADUATED
            </span>
            <span className="text-[11px] text-zinc-300 font-bold">100% Raised → Uniswap v4 Locked</span>
          </div>
          <span className="text-[10px] text-amber-300 font-mono font-bold uppercase hidden sm:inline">DEX LIVE</span>
        </div>
      )}

      {/* Amount Input Box */}
      <div className="bg-[#121519] border-2 border-zinc-700 rounded-lg p-4 flex flex-col gap-3 shadow-[3px_3px_0px_0px_#000000]">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span className="font-black uppercase">{isBuy ? '// YOU_PAY (ETH)' : `// YOU_PAY ($${token.symbol})`}</span>
          <div className="flex items-center gap-1 font-bold">
            <span>
              BAL: {isBuy ? `${ethBalanceNum.toFixed(4)} ETH` : `${tokenBalanceNum.toLocaleString()} $${token.symbol}`}
            </span>
            <button
              type="button"
              onClick={() =>
                setAmount(
                  isBuy
                    ? Math.max(0, ethBalanceNum - 0.0002).toFixed(4)
                    : tokenBalanceNum >= 1
                    ? Math.floor(tokenBalanceNum).toString()
                    : tokenBalanceNum.toString()
                )
              }
              className="text-theme-light hover:underline font-black cursor-pointer uppercase"
            >
              [MAX]
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <input
            type="number"
            step="any"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            className="flex-1 w-0 min-w-0 bg-transparent text-2xl sm:text-3xl font-black text-white placeholder-zinc-700 focus:outline-none"
          />

          <div className="flex items-center gap-2 bg-black px-3 py-1.5 rounded border border-zinc-700 flex-shrink-0">
            {isBuy ? (
              <>
                <SparkleIcon size={18} className="flex-shrink-0" />
                <span className="text-xs font-black text-white">ETH</span>
              </>
            ) : (
              <>
                <div className="w-5 h-5 rounded-none overflow-hidden border border-white flex items-center justify-center bg-black">
                  <TokenImage
                    src={token.logo}
                    alt={token.symbol}
                    size={20}
                    sparkleSize={14}
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="text-xs font-black text-white truncate max-w-[80px]">
                  {token.symbol}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Quick Amount Pills */}
        <div className="grid grid-cols-4 gap-1.5 pt-1">
          {isBuy
            ? [
                { label: '0.001', val: '0.001' },
                { label: '0.005', val: '0.005' },
                { label: '0.01', val: '0.01' },
                { label: '0.05', val: '0.05' },
              ].map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => setAmount(c.val)}
                  className="py-1 rounded bg-black hover:bg-white text-zinc-300 hover:text-black border border-zinc-700 hover:border-white text-[10px] sm:text-xs font-black transition-all shadow-[1px_1px_0px_0px_#000000] cursor-pointer"
                >
                  {c.label} ETH
                </button>
              ))
            : [
                { label: '25%', pct: 0.25 },
                { label: '50%', pct: 0.5 },
                { label: '75%', pct: 0.75 },
                { label: '100%', pct: 1.0 },
              ].map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => {
                    const raw = tokenBalanceNum * c.pct
                    setAmount(raw >= 1 ? Math.floor(raw).toString() : raw.toFixed(2))
                  }}
                  className="py-1 rounded bg-black hover:bg-rose-600 text-zinc-300 hover:text-white border border-zinc-700 hover:border-white text-[10px] sm:text-xs font-black transition-all shadow-[1px_1px_0px_0px_#000000] cursor-pointer"
                >
                  {c.label}
                </button>
              ))}
        </div>
      </div>

      {/* Output Preview */}
      <div className="bg-[#121519] border-2 border-zinc-700 rounded-lg p-4 flex flex-col gap-2 shadow-[3px_3px_0px_0px_#000000]">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span className="font-black uppercase">{isBuy ? '// YOU_RECEIVE' : '// YOU_RECEIVE (ETH)'}</span>
          <span className="text-[10px] text-zinc-500 font-bold uppercase">EST. OUTPUT</span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-xl sm:text-2xl font-black text-theme-light truncate">
            {estimatedOutput > 0
              ? isBuy
                ? estimatedOutput.toLocaleString('en-US', { maximumFractionDigits: 2 })
                : estimatedOutput.toFixed(6)
              : '0.00'}
          </span>
          <span className="text-xs font-black text-white bg-black px-3 py-1.5 rounded border border-zinc-700 flex-shrink-0">
            {isBuy ? `$${token.symbol}` : 'ETH'}
          </span>
        </div>
      </div>

      {/* Breakdown Details */}
      <div className="bg-black border-2 border-zinc-800 rounded-lg p-3 flex flex-col gap-1.5 text-xs text-zinc-400">
        <div className="flex justify-between">
          <span>MIN. RECEIVED ({slippage}% SLIP):</span>
          <span className="text-white font-bold">
            {minReceived > 0
              ? isBuy
                ? `${minReceived.toLocaleString('en-US', { maximumFractionDigits: 2 })} $${token.symbol}`
                : `${minReceived.toFixed(6)} ETH`
              : '—'}
          </span>
        </div>
        <div className="flex justify-between">
          <span>CREATOR TAX:</span>
          <span className="font-bold text-theme-light">{(token.creatorTaxBps / 100).toFixed(1)}%</span>
        </div>
        <div className="flex justify-between">
          <span>EXECUTION ROUTE:</span>
          <span className={`font-bold ${isGraduated ? 'text-amber-400' : 'text-zinc-300'}`}>
            {isGraduated ? 'UNISWAP V4 (DEX ROUTER)' : 'PONS V2 BONDING CURVE'}
          </span>
        </div>
      </div>

      {/* Action Button */}
      {!authenticated || !address ? (
        <Button
          variant="primary"
          onClick={async () => {
            setLoggingIn(true)
            await initOAuth({ provider: 'twitter' })
          }}
          loading={loggingIn}
          className="w-full py-3.5 text-xs font-black uppercase"
        >
          CONNECT WALLET TO SWAP
        </Button>
      ) : !isBuy && needsApproval ? (
        <Button
          variant="primary"
          onClick={handleApprove}
          loading={approving}
          disabled={approving || swapping}
          className="w-full py-3.5 text-xs font-black uppercase"
        >
          {approving ? 'APPROVING TOKEN...' : `APPROVE $${token.symbol} ACCESS`}
        </Button>
      ) : (
        <Button
          variant={isBuy ? 'primary' : 'danger'}
          onClick={handleSwap}
          disabled={!hasSufficientBalance || swapping || approving}
          loading={swapping}
          className="w-full py-3.5 text-xs font-black uppercase"
        >
          {swapping
            ? 'SWAPPING ON DEX...'
            : !hasSufficientBalance
            ? 'INSUFFICIENT BALANCE'
            : isBuy
            ? isGraduated
              ? `SWAP ETH → $${token.symbol}`
              : `BUY $${token.symbol} ON CURVE`
            : isGraduated
            ? `SWAP $${token.symbol} → ETH`
            : `SELL $${token.symbol} TO CURVE`}
        </Button>
      )}

      {/* Quick External DEX links */}
      {isGraduated && (
        <div className="grid grid-cols-3 gap-1.5 pt-1">
          <a
            href={`https://dexscreener.com/robinhood/${token.tokenAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="py-1.5 bg-[#121519] hover:bg-white text-zinc-300 hover:text-black border border-zinc-700 hover:border-white text-[10px] font-black uppercase text-center rounded transition-all"
          >
            DEXSCREENER ↗
          </a>
          <a
            href={`https://gmgn.ai/robinhood/token/${token.tokenAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="py-1.5 bg-[#121519] hover:bg-amber-400 text-zinc-300 hover:text-black border border-zinc-700 hover:border-amber-400 text-[10px] font-black uppercase text-center rounded transition-all"
          >
            GMGN.AI ↗
          </a>
          <a
            href={`https://robinhoodchain.blockscout.com/token/${token.tokenAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="py-1.5 bg-[#121519] hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 text-[10px] font-bold uppercase text-center rounded transition-all"
          >
            EXPLORER ↗
          </a>
        </div>
      )}
    </div>
  )
}
