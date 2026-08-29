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
  FEE_ESCROW,
} from '@/lib/pons-v2'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'
import { useTheme } from '@/context/ThemeContext'

interface TokenSwapWidgetProps {
  token: PonsV2TokenInfo
  onSwapSuccess?: () => void
}

export default function TokenSwapWidget({ token, onSwapSuccess }: TokenSwapWidgetProps) {
  const { user, authenticated } = usePrivy()
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
  const [tokenBalanceFormatted, setTokenBalanceFormatted] = useState('0')
  const [fetchingTokenBal, setFetchingTokenBal] = useState(false)

  const [needsApproval, setNeedsApproval] = useState(false)
  const [approving, setApproving] = useState(false)
  const [swapping, setSwapping] = useState(false)

  const isBuy = mode === 'BUY'
  const isCurve = token.phase === 0 || !token.graduated
  const curveAddress = token.curveAddress

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
      setTokenBalanceFormatted(parseFloat(formatted) < 0.01 && bal > 0n ? formatted.slice(0, 8) : parseFloat(formatted).toLocaleString('en-US', { maximumFractionDigits: 2 }))
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
      const spender = curveAddress
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
  }, [isBuy, address, token.tokenAddress, curveAddress, amount])

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

  // Bonding curve estimate output calculation
  const estimatedOutput = useMemo(() => {
    if (amountNum <= 0) return 0
    const priceNative = token.priceNative > 0 ? token.priceNative : 0.0000000025
    if (isBuy) {
      // ETH in -> Tokens out (accounting for curve tax & fee ~2%)
      const feeDeduction = amountNum * 0.98
      return feeDeduction / priceNative
    } else {
      // Tokens in -> ETH out (accounting for curve tax & fee ~2%)
      const grossEth = amountNum * priceNative
      return grossEth * 0.98
    }
  }, [amountNum, isBuy, token.priceNative])

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
        args: [curveAddress, maxUint256],
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

      if (isBuy) {
        toast(`Buying $${token.symbol} on Robinhood Chain...`)
        const quoteIn = parseEther(amount)
        const minTokensOut = 0n // Slippage tolerance

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
        toast(`Selling $${token.symbol} for ETH...`)
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

      toast.success(`Swap ${isBuy ? `ETH → $${token.symbol}` : `$${token.symbol} → ETH`} successful!`)
      setAmount('')
      await Promise.all([refetchBalance(), fetchTokenBal()])
      if (onSwapSuccess) onSwapSuccess()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Swap failed'
      if (msg.includes('cancel') || msg.includes('reject') || msg.includes('denied') || msg.includes('User rejected')) {
        toast.error('Transaction canceled.')
      } else if (msg.includes('insufficient funds') || msg.includes('exceeds')) {
        toast.error('Insufficient funds for amount + gas fee.')
      } else {
        toast.error(msg.slice(0, 120))
      }
    } finally {
      setSwapping(false)
    }
  }  return (
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
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

      {/* Input Box */}
      <div className="bg-[#121519] border-2 border-zinc-700 rounded-lg p-4 flex flex-col gap-3 shadow-[3px_3px_0px_0px_#000000]">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span className="font-black uppercase">// YOU_PAY</span>
          <div className="flex items-center gap-1.5">
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
          <span>CURVE EXECUTION:</span>
          <span className="text-zinc-300">PONS V2 BONDING CURVE</span>
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
      ) : amountNum <= 0 ? (
        <Button variant="secondary" disabled className="w-full py-3.5 text-xs font-black opacity-60">
          ENTER AMOUNT TO SWAP
        </Button>
      ) : !hasSufficientBalance ? (
        <Button variant="secondary" disabled className="w-full py-3.5 text-xs font-black text-rose-300 border-rose-500">
          INSUFFICIENT {isBuy ? 'ETH' : `$${token.symbol}`} BALANCE
        </Button>
      ) : needsApproval && !isBuy ? (
        <Button
          variant="accent"
          onClick={handleApprove}
          loading={approving}
          disabled={approving}
          className="w-full py-3.5 text-xs font-black uppercase shadow-xl"
        >
          {approving ? 'APPROVING...' : `1. APPROVE $${token.symbol}`}
        </Button>
      ) : (
        <Button
          variant={isBuy ? 'primary' : 'danger'}
          onClick={handleSwap}
          loading={swapping}
          disabled={swapping}
          className="w-full py-3.5 text-xs font-black uppercase shadow-xl"
        >
          {swapping
            ? 'CONFIRMING TX...'
            : isBuy
            ? `BUY $${token.symbol} WITH ETH`
            : `SELL $${token.symbol} FOR ETH`}
        </Button>
      )}
    </div>
  )
}

