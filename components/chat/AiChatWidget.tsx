'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
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
import { usePrivy, useLoginWithOAuth, useWallets } from '@privy-io/react-auth'
import { useWallet } from '@/hooks/useWallet'
import { activeChain, robinhoodChain } from '@/lib/chains'
import { PONS_CURVE_ABI, getPonsTokenInfo } from '@/lib/pons-v2'
import Button from '@/components/ui/Button'
import SparkleIcon from '@/components/ui/SparkleIcon'
import Spinner from '@/components/ui/Spinner'
import toast from 'react-hot-toast'
import { useTheme } from '@/context/ThemeContext'
import { ChatMessage, ParsedActionData } from '@/lib/chat-agent'
import CreateTokenModal from '@/components/launchpad/CreateTokenModal'

interface AiChatWidgetProps {
  initialTokenAddress?: string
  initialTokenSymbol?: string
  fullScreen?: boolean
  onClose?: () => void
}

const ROBINHOOD_CHAIN_ID = 4663
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as `0x${string}`
const UNIVERSAL_ROUTER = '0x8876789976decbfcbbbe364623c63652db8c0904' as `0x${string}`

const PERMIT2_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
    ],
    outputs: [],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
] as const

const QUICK_SUGGESTIONS = [
  { label: 'Check Points', prompt: 'check my points' },
  { label: 'Check Balance', prompt: 'check my balance' },
  { label: 'How to launch token', prompt: 'how to launch a new token?' },
  { label: 'Buy $10 of Token', prompt: 'buy 10$ ' },
  { label: 'Sell All Tokens', prompt: 'sell all ' },
]

export default function AiChatWidget({
  initialTokenAddress,
  initialTokenSymbol,
  fullScreen = false,
  onClose,
}: AiChatWidgetProps) {
  const { theme } = useTheme()
  const { user, authenticated, ready } = usePrivy()
  const { wallets } = useWallets()
  const { address, balance, embeddedWallet, refetchBalance } = useWallet()
  const [, setLoggingIn] = useState(false)
  const { initOAuth } = useLoginWithOAuth({
    onComplete: () => setLoggingIn(false),
    onError: () => setLoggingIn(false),
  })

  // Chat message state
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    return [
      {
        id: 'welcome-1',
        role: 'assistant',
        content:
          'PONSCORE AI Agent online.\nI can parse and execute DeFi trading commands directly on Robinhood Chain.\n\nExamples:\n- `buy 10$ 0xf373...` or `buy 0.005 ETH 0x...`\n- `sell all 0xf373...` or `sell 50% 0x...`\n- `check balance` or `launch token $PEPE`\n\nEnter your command below.',
        timestamp: Date.now(),
      },
    ]
  })

  const [input, setInput] = useState('')
  const [loadingAi, setLoadingAi] = useState(false)
  const [executingMap, setExecutingMap] = useState<Record<string, boolean>>({})
  const [txSuccessMap, setTxSuccessMap] = useState<Record<string, string>>({})
  const [statusStepMap, setStatusStepMap] = useState<Record<string, string>>({})
  const [launchModalOpen, setLaunchModalOpen] = useState(false)
  const [launchModalData, setLaunchModalData] = useState<{ symbol?: string; name?: string }>({})

  const chatEndRef = useRef<HTMLDivElement>(null)

  // Auto scroll to bottom
  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, loadingAi, scrollToBottom])

  // Handle Send Message
  async function handleSendMessage(customText?: string) {
    const textToSend = (customText || input).trim()
    if (!textToSend || loadingAi) return

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: Date.now(),
    }

    setMessages((prev) => [...prev, userMsg])
    if (!customText) setInput('')
    setLoadingAi(true)

    try {
      const history = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-6)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          history,
          userAddress: address,
          userTwitter: user?.twitter?.username,
        }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        const assistantMsg: ChatMessage = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: data.reply,
          timestamp: Date.now(),
          action: data.action,
        }
        setMessages((prev) => [...prev, assistantMsg])
      } else {
        throw new Error(data.error || 'Failed to process AI command')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error reaching AI server'
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `Unable to process command: ${msg}`,
          timestamp: Date.now(),
        },
      ])
    } finally {
      setLoadingAi(false)
    }
  }

  // Handle Swap Execution from Action Card (Always use Server Wallet)
  async function handleExecuteTrade(msgId: string, action: ParsedActionData) {
    if (!action.tokenAddress || !isAddress(action.tokenAddress)) {
      toast.error('Invalid token contract address')
      return
    }

    if (!address) {
      toast('Please connect your account first')
      setLoggingIn(true)
      await initOAuth({ provider: 'twitter' })
      return
    }

    const isBuy = action.intent === 'BUY'
    const tokenAddr = getAddress(action.tokenAddress)
    const externalWallet = wallets?.find((w) => w.walletClientType !== 'privy')

    setExecutingMap((prev) => ({ ...prev, [msgId]: true }))

    try {
      const pubClient = createPublicClient({
        chain: robinhoodChain,
        transport: http('https://robinhood-rpc.publicnode.com'),
      })

      // Ensure full token info is loaded
      let token = action.tokenInfo
      if (!token || !token.curveAddress) {
        token = await getPonsTokenInfo(tokenAddr)
      }

      const symbol = token?.symbol || action.tokenSymbol || 'TOKEN'
      const isGraduated = token?.graduated || token?.phase === 2
      const isCurve = !isGraduated && (token?.phase === 0 || token?.phase === undefined)
      const curveAddress = token?.curveAddress

      // Calculate exact amount for sell
      let amountToSwap = action.amount || (isBuy ? '0.001' : 'all')
      let tokensInWei = 0n

      if (!isBuy) {
        setStatusStepMap((prev) => ({ ...prev, [msgId]: 'Verifying token balance...' }))
        const userBalRaw = await pubClient.readContract({
          address: tokenAddr,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [getAddress(address)],
        }).catch(() => 0n)

        if (userBalRaw <= 0n) {
          throw new Error(`Your balance for $${symbol} is 0. Nothing to sell.`)
        }

        if (action.isAll || action.amount === 'all' || !action.amount || action.percentage === 100) {
          tokensInWei = userBalRaw
        } else if (action.percentage && action.percentage > 0) {
          tokensInWei = (userBalRaw * BigInt(action.percentage)) / 100n
        } else {
          try {
            tokensInWei = parseUnits(action.amount, 18)
          } catch {
            tokensInWei = userBalRaw
          }
        }

        if (tokensInWei > userBalRaw) tokensInWei = userBalRaw
        if (tokensInWei <= 0n) throw new Error('Calculated sell amount is 0.')

        amountToSwap = formatUnits(tokensInWei, 18)
      }

      // ── ROUTE 1: CONNECTED EXTERNAL WALLET (MetaMask, Rabby, WalletConnect) ──
      if (externalWallet) {
        setStatusStepMap((prev) => ({ ...prev, [msgId]: 'Awaiting MetaMask signature...' }))
        try {
          await externalWallet.switchChain(ROBINHOOD_CHAIN_ID)
        } catch { /* ignore */ }
        const provider = await externalWallet.getEthereumProvider()

        const { createWalletClient, custom } = await import('viem')
        const walletClient = createWalletClient({
          chain: activeChain,
          transport: custom(provider),
        })
        const [account] = await walletClient.getAddresses()
        const userAddr = getAddress(account || address)

        const ethBal = await pubClient.getBalance({ address: userAddr })
        if (ethBal === 0n || (isBuy && ethBal < parseEther(amountToSwap))) {
          throw new Error(
            isBuy
              ? `Insufficient ETH balance (${formatUnits(ethBal, 18)} ETH) to buy.`
              : 'Insufficient ETH in your wallet to cover the transaction gas fee.'
          )
        }

        let txHash = ''

        if (isCurve && curveAddress) {
          if (isBuy) {
            setStatusStepMap((prev) => ({ ...prev, [msgId]: 'Submitting buy order to curve...' }))
            const quoteIn = parseEther(amountToSwap)
            const calldata = encodeFunctionData({
              abi: PONS_CURVE_ABI,
              functionName: 'buy',
              args: [quoteIn, 0n, userAddr],
            })

            let gasLimit: bigint | undefined = undefined
            try {
              const est = await pubClient.estimateGas({
                account,
                to: getAddress(curveAddress),
                value: quoteIn,
                data: calldata,
              })
              gasLimit = (est * 120n) / 100n
            } catch {
              gasLimit = 250000n
            }

            txHash = await walletClient.sendTransaction({
              account,
              to: getAddress(curveAddress),
              value: quoteIn,
              data: calldata,
              ...(gasLimit ? { gas: gasLimit } : {}),
            })
          } else {
            setStatusStepMap((prev) => ({ ...prev, [msgId]: 'Checking token allowance...' }))
            const currentAllowance = await pubClient.readContract({
              address: tokenAddr,
              abi: erc20Abi,
              functionName: 'allowance',
              args: [userAddr, getAddress(curveAddress)],
            })

            if (currentAllowance < tokensInWei) {
              setStatusStepMap((prev) => ({ ...prev, [msgId]: 'Approving token on blockchain...' }))
              const approveHash = await walletClient.writeContract({
                account,
                address: tokenAddr,
                abi: erc20Abi,
                functionName: 'approve',
                args: [getAddress(curveAddress), maxUint256],
              })
              await pubClient.waitForTransactionReceipt({ hash: approveHash })
            }

            setStatusStepMap((prev) => ({ ...prev, [msgId]: 'Submitting sell order to curve...' }))
            const calldata = encodeFunctionData({
              abi: PONS_CURVE_ABI,
              functionName: 'sell',
              args: [tokensInWei, 0n, userAddr],
            })

            let gasLimit: bigint | undefined = undefined
            try {
              const est = await pubClient.estimateGas({
                account,
                to: getAddress(curveAddress),
                data: calldata,
              })
              gasLimit = (est * 120n) / 100n
            } catch {
              gasLimit = 250000n
            }

            txHash = await walletClient.sendTransaction({
              account,
              to: getAddress(curveAddress),
              data: calldata,
              ...(gasLimit ? { gas: gasLimit } : {}),
            })
          }
        } else {
          // Uniswap V4
          if (!isBuy) {
            setStatusStepMap((prev) => ({ ...prev, [msgId]: 'Checking Permit2 allowance...' }))
            const erc20Allowance = await pubClient.readContract({
              address: tokenAddr,
              abi: erc20Abi,
              functionName: 'allowance',
              args: [userAddr, PERMIT2],
            })
            if (erc20Allowance < tokensInWei) {
              setStatusStepMap((prev) => ({ ...prev, [msgId]: 'Approving Permit2 on blockchain...' }))
              const appHash = await walletClient.writeContract({
                account,
                address: tokenAddr,
                abi: erc20Abi,
                functionName: 'approve',
                args: [PERMIT2, maxUint256],
              })
              await pubClient.waitForTransactionReceipt({ hash: appHash })
            }

            const [permit2Allowance, expiration] = (await pubClient.readContract({
              address: PERMIT2,
              abi: PERMIT2_ABI,
              functionName: 'allowance',
              args: [userAddr, tokenAddr, UNIVERSAL_ROUTER],
            })) as [bigint, number, number]

            const nowSec = BigInt(Math.floor(Date.now() / 1000))
            if (permit2Allowance < tokensInWei || BigInt(expiration) <= nowSec) {
              setStatusStepMap((prev) => ({ ...prev, [msgId]: 'Authorizing Universal Router...' }))
              const p2AppHash = await walletClient.writeContract({
                account,
                address: PERMIT2,
                abi: PERMIT2_ABI,
                functionName: 'approve',
                args: [
                  tokenAddr,
                  UNIVERSAL_ROUTER,
                  (1n << 160n) - 1n,
                  Math.floor(Date.now() / 1000) + 30 * 86400,
                ],
              })
              await pubClient.waitForTransactionReceipt({ hash: p2AppHash })
            }
          }

          setStatusStepMap((prev) => ({ ...prev, [msgId]: 'Fetching Uniswap route...' }))
          const amountInWei = isBuy
            ? parseEther(amountToSwap).toString()
            : tokensInWei.toString()

          const swapRes = await fetch('/api/uniswap/swap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              isBuy,
              tokenAddress: tokenAddr,
              amountIn: amountInWei,
              minAmountOut: '1',
              deadline: Math.floor(Date.now() / 1000) + 1200,
              hookAddress: token?.poolKey?.hooks || '0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044',
              fee: token?.poolFee || 0,
              tickSpacing: token?.tickSpacing || 200,
            }),
          })

          const swapJson = await swapRes.json()
          if (!swapJson.success && swapJson.error) {
            throw new Error(swapJson.error)
          }

          const targetTo = (swapJson.to || UNIVERSAL_ROUTER) as `0x${string}`
          const targetValue = isBuy ? parseEther(amountToSwap) : 0n
          const targetData = (swapJson.data || '0x') as `0x${string}`

          let gasLimit: bigint | undefined = undefined
          try {
            const est = await pubClient.estimateGas({
              account,
              to: targetTo,
              value: targetValue,
              data: targetData,
            })
            gasLimit = (est * 120n) / 100n
          } catch {
            gasLimit = 350000n
          }

          setStatusStepMap((prev) => ({ ...prev, [msgId]: 'Confirming transaction in wallet...' }))
          txHash = await walletClient.sendTransaction({
            account,
            to: targetTo,
            value: targetValue,
            data: targetData,
            ...(gasLimit ? { gas: gasLimit } : {}),
          })
        }

        setStatusStepMap((prev) => ({ ...prev, [msgId]: 'Waiting block confirmation...' }))
        await pubClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` })

        toast.success(isBuy ? `Swap Successful: Bought $${symbol}` : `Swap Successful: Sold $${symbol}`)
        setTxSuccessMap((prev) => ({ ...prev, [msgId]: txHash }))
        setStatusStepMap((prev) => ({ ...prev, [msgId]: 'Confirmed on-chain' }))
        await refetchBalance()
      } else {
        // ── ROUTE 2: SOCIAL / SERVER WALLET (Twitter, Google) ──
        setStatusStepMap((prev) => ({ ...prev, [msgId]: 'Signing via Privy Server Wallet...' }))
        const srvSwapRes = await fetch('/api/launchpad/swap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address,
            twitterHandle: user?.twitter?.username,
            tokenAddress: tokenAddr,
            isBuy,
            amount: amountToSwap,
            slippage: action.slippage || 1.0,
          }),
        })

        const srvJson = await srvSwapRes.json().catch(() => ({}))

        if (!srvSwapRes.ok || !srvJson?.success) {
          throw new Error(srvJson?.error || 'Swap execution failed on server wallet')
        }

        toast.success(
          isBuy
            ? `Swap Successful: Bought $${symbol}`
            : `Swap Successful: Sold $${symbol} for ETH`
        )
        setTxSuccessMap((prev) => ({
          ...prev,
          [msgId]: srvJson.txHash || 'confirmed',
        }))
        setStatusStepMap((prev) => ({ ...prev, [msgId]: 'Confirmed on-chain via Server Wallet' }))
        await refetchBalance()
      }
    } catch (err: unknown) {
      console.error('Trade Execution error:', err)
      let rawMsg = err instanceof Error ? err.message : String(err)
      if (rawMsg.toLowerCase().includes('exceeds the balance') || rawMsg.toLowerCase().includes('insufficient funds')) {
        rawMsg = 'Insufficient ETH in wallet to cover gas fee. Please deposit a small amount of ETH.'
      }
      toast.error(rawMsg.slice(0, 100))
      setStatusStepMap((prev) => ({ ...prev, [msgId]: `Failed: ${rawMsg.slice(0, 55)}` }))
    } finally {
      setExecutingMap((prev) => ({ ...prev, [msgId]: false }))
    }
  }

  return (
    <div
      style={{
        boxShadow: fullScreen ? 'none' : `6px 6px 0px 0px ${theme.color}`,
      }}
      className={`flex flex-col bg-[#0b0d10] border-2 border-white rounded-xl overflow-hidden font-mono select-none ${
        fullScreen ? 'w-full h-full min-h-[75vh]' : 'w-full max-w-2xl h-[560px]'
      }`}
    >
      {/* Header Bar */}
      <div className="bg-[#12151a] border-b-2 border-zinc-800 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <SparkleIcon size={24} className="animate-spin-slow" />
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-black" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-black uppercase text-white tracking-wider">
                PONSCORE AI TRADING AGENT
              </span>
              <span className="text-[9px] font-black bg-[var(--theme-color)] text-black px-1.5 py-0.2 border border-black shadow-[1px_1px_0px_0px_#000000]">
                ONLINE
              </span>
            </div>
            <span className="text-[10px] text-zinc-400 font-sans hidden sm:inline">
              Natural Language DeFi Commands // Robinhood Chain
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className="text-xs font-black text-zinc-400 hover:text-white px-2 py-1 rounded bg-[#181b20] border border-zinc-700 hover:border-white cursor-pointer"
            >
              [CLOSE]
            </button>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5 custom-scrollbar bg-[#080a0d]">
        {messages.map((msg) => {
          const isUser = msg.role === 'user'
          const action = msg.action
          const isTradeAction = action && (action.intent === 'BUY' || action.intent === 'SELL') && (!!action.tokenAddress || !!action.tokenSymbol)
          const isExecuting = executingMap[msg.id]
          const txHash = txSuccessMap[msg.id]
          const statusStep = statusStepMap[msg.id]
          const token = action?.tokenInfo
          const isBuy = action?.intent === 'BUY'
          const externalWallet = wallets?.find((w) => w.walletClientType !== 'privy')

          return (
            <div
              key={msg.id}
              className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}
            >
              {/* Sender Label */}
              <span className="text-[10px] font-black text-zinc-500 uppercase px-1">
                {isUser ? '// USER' : '// PONSCORE_AGENT'}
              </span>

              {/* Chat Bubble */}
              <div
                style={{
                  boxShadow: isUser
                    ? '2px 2px 0px 0px #000000'
                    : `3px 3px 0px 0px ${theme.color}`,
                }}
                className={`max-w-[88%] sm:max-w-[80%] rounded-xl p-3.5 text-xs sm:text-sm border-2 ${
                  isUser
                    ? 'bg-[#181d24] text-white border-zinc-600 rounded-tr-none'
                    : 'bg-[#101318] text-zinc-200 border-white rounded-tl-none'
                }`}
              >
                <p className="whitespace-pre-line leading-relaxed">{msg.content}</p>

                {/* Interactive Action Card if AI parsed trade */}
                {isTradeAction && action && (
                  <div className="mt-3.5 bg-[#07090c] border-2 border-zinc-700 rounded-lg p-3 sm:p-4 flex flex-col gap-3 shadow-[2px_2px_0px_0px_#000000]">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-black px-2 py-0.5 border border-black uppercase ${
                            isBuy
                              ? 'bg-[var(--theme-color)] text-black shadow-[1px_1px_0px_0px_#ffffff]'
                              : 'bg-rose-600 text-white shadow-[1px_1px_0px_0px_#ffffff]'
                          }`}
                        >
                          {isBuy ? 'BUY ORDER' : 'SELL ORDER'}
                        </span>
                        <span className="text-xs font-black text-white">
                          ${token?.symbol || action.tokenSymbol || 'TOKEN'}
                        </span>
                      </div>

                      {token?.graduated ? (
                        <span className="text-[9px] font-black bg-purple-500 text-black px-1.5 py-0.2 border border-black">
                          UNISWAP V4
                        </span>
                      ) : (
                        <span className="text-[9px] font-black bg-amber-400 text-black px-1.5 py-0.2 border border-black">
                          BONDING CURVE
                        </span>
                      )}
                    </div>

                    {/* Token & Amount Info Grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-[#101317] p-2 rounded border border-zinc-800 flex flex-col">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase">
                          {isBuy ? 'PAY AMOUNT' : 'SELL AMOUNT'}
                        </span>
                        <span className="font-black text-white truncate mt-0.5">
                          {action.amountType === 'USD'
                            ? `$${action.amountRawValue} (~${action.amount} ETH)`
                            : action.isAll
                            ? `MAX (ALL BAL)`
                            : `${action.amount} ${isBuy ? 'ETH' : token?.symbol || 'TOKENS'}`}
                        </span>
                      </div>

                      <div className="bg-[#101317] p-2 rounded border border-zinc-800 flex flex-col">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase">
                          TOKEN ADDRESS
                        </span>
                        <span className="font-mono text-[11px] text-theme-light truncate mt-0.5">
                          {action.tokenAddress
                            ? `${action.tokenAddress.slice(0, 6)}...${action.tokenAddress.slice(-4)}`
                            : 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Progress / Status Step */}
                    {statusStep && (
                      <div className="flex items-center gap-2 bg-[#12161d] px-2.5 py-1.5 rounded border border-zinc-800 text-[11px] text-zinc-300">
                        {isExecuting ? (
                          <Spinner size="sm" />
                        ) : txHash ? (
                          <span className="text-emerald-400 font-black">OK</span>
                        ) : null}
                        <span className="truncate">{statusStep}</span>
                      </div>
                    )}

                    {/* Tx Success Explorer Link */}
                    {txHash && (
                      <div className="bg-emerald-950/40 border border-emerald-500/60 rounded p-2 flex items-center justify-between text-xs">
                        <span className="text-emerald-400 font-black">TRANSACTION CONFIRMED</span>
                        <a
                          href={`https://robinhoodchain.blockscout.com/tx/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-white bg-emerald-600 hover:bg-emerald-500 px-2 py-0.5 rounded font-black text-[10px] uppercase shadow-[1px_1px_0px_0px_#000000]"
                        >
                          EXPLORER // TX
                        </a>
                      </div>
                    )}

                    {/* Action Button */}
                    {!txHash && (
                      <Button
                        variant={isBuy ? 'primary' : 'danger'}
                        size="sm"
                        loading={isExecuting}
                        disabled={isExecuting}
                        onClick={() => handleExecuteTrade(msg.id, action)}
                        className="w-full py-2.5 text-xs font-black uppercase shadow-[2px_2px_0px_0px_#000000]"
                      >
                        {isExecuting
                          ? 'EXECUTING SWAP...'
                          : isBuy
                          ? `CONFIRM BUY $${token?.symbol || action.tokenSymbol || ''}`
                          : `CONFIRM SELL $${token?.symbol || action.tokenSymbol || ''}`}
                      </Button>
                    )}
                  </div>
                )}

                {/* Interactive Launch Card if AI parsed token launch */}
                {action && action.intent === 'LAUNCH' && (
                  <div className="mt-3.5 bg-[#07090c] border-2 border-zinc-700 rounded-lg p-3 sm:p-4 flex flex-col gap-3 shadow-[2px_2px_0px_0px_#000000]">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black px-2 py-0.5 border border-black uppercase bg-cyan-400 text-black shadow-[1px_1px_0px_0px_#ffffff]">
                          TOKEN LAUNCHER
                        </span>
                        <span className="text-xs font-black text-white">
                          ${action.tokenSymbol || action.tokenName || 'TOKEN'}
                        </span>
                      </div>

                      <span className="text-[9px] font-black bg-emerald-400 text-black px-1.5 py-0.2 border border-black">
                        PONS V2 CURVE
                      </span>
                    </div>

                    {/* Token Info Grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-[#101317] p-2 rounded border border-zinc-800 flex flex-col">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase">
                          TOKEN SYMBOL
                        </span>
                        <span className="font-black text-white truncate mt-0.5">
                          ${action.tokenSymbol || 'TOKEN'}
                        </span>
                      </div>

                      <div className="bg-[#101317] p-2 rounded border border-zinc-800 flex flex-col">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase">
                          LAUNCH FEE
                        </span>
                        <span className="font-mono text-[11px] text-theme-light truncate mt-0.5">
                          ~0.0005 ETH
                        </span>
                      </div>
                    </div>

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setLaunchModalData({
                          symbol: action.tokenSymbol,
                          name: action.tokenName || action.tokenSymbol,
                        })
                        setLaunchModalOpen(true)
                      }}
                      className="w-full py-2.5 text-xs font-black uppercase flex items-center justify-center gap-2 shadow-[2px_2px_0px_0px_#000000]"
                    >
                      <SparkleIcon size={14} />
                      DEPLOY ${action.tokenSymbol || 'TOKEN'} ON LAUNCHPAD
                    </Button>
                  </div>
                )}

                {/* Interactive Wallet Overview Card if AI parsed wallet balance check */}
                {action && action.intent === 'WALLET_QUERY' && (
                  <div className="mt-3.5 bg-[#07090c] border-2 border-zinc-700 rounded-lg p-3 sm:p-4 flex flex-col gap-3 shadow-[2px_2px_0px_0px_#000000]">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black px-2 py-0.5 border border-black uppercase bg-[var(--theme-color)] text-black shadow-[1px_1px_0px_0px_#ffffff]">
                          WALLET OVERVIEW
                        </span>
                        <span className="text-xs font-black text-white uppercase">
                          {externalWallet ? 'CONNECTED WALLET' : 'PRIVY SERVER WALLET'}
                        </span>
                      </div>

                      <span className="text-[9px] font-black bg-emerald-400 text-black px-1.5 py-0.2 border border-black">
                        ROBINHOOD CHAIN
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-[#101317] p-2 rounded border border-zinc-800 flex flex-col">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase">
                          ETH BALANCE
                        </span>
                        <span className="font-black text-white truncate mt-0.5 text-sm sm:text-base text-emerald-400">
                          {balance?.formatted ? `${parseFloat(balance.formatted).toFixed(4)} ETH` : '0.0000 ETH'}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          ≈ ${balance?.formatted ? (parseFloat(balance.formatted) * 2500).toFixed(2) : '0.00'} USD
                        </span>
                      </div>

                      <div className="bg-[#101317] p-2 rounded border border-zinc-800 flex flex-col justify-between">
                        <div>
                          <span className="text-[9px] text-zinc-500 font-bold uppercase">
                            ACTIVE ADDRESS
                          </span>
                          <span className="font-mono text-[11px] text-theme-light truncate block mt-0.5">
                            {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not Connected'}
                          </span>
                        </div>

                        {address && (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(address)
                              toast.success('Wallet address copied to clipboard!')
                            }}
                            className="text-[10px] text-zinc-400 hover:text-white bg-[#181d24] px-1.5 py-0.5 rounded border border-zinc-700 hover:border-white mt-1.5 self-start cursor-pointer transition-colors"
                          >
                            [COPY ADDRESS]
                          </button>
                        )}
                      </div>
                    </div>

                    {address && (
                      <div className="flex gap-2">
                        <a
                          href={`https://robinhoodchain.blockscout.com/address/${address}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 text-center py-2 text-[11px] font-black uppercase bg-[#14181f] hover:bg-[#1c222b] text-white border border-zinc-700 hover:border-white rounded transition-all shadow-[1px_1px_0px_0px_#000000]"
                        >
                          VIEW ON EXPLORER ↗
                        </a>
                        <button
                          type="button"
                          onClick={() => refetchBalance()}
                          className="px-3 py-2 text-[11px] font-black uppercase bg-[var(--theme-color)] text-black border border-black hover:brightness-110 rounded transition-all shadow-[1px_1px_0px_0px_#ffffff] cursor-pointer"
                        >
                          REFRESH
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Render Points Overview Card on POINTS_QUERY */}
                {msg.action?.intent === 'POINTS_QUERY' && (
                  <div
                    style={{ boxShadow: `3px 3px 0px 0px ${theme.color}` }}
                    className="mt-3 bg-[#0e1115] border-2 border-white rounded-lg p-3.5 flex flex-col gap-3 font-mono"
                  >
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                      <span className="text-[10px] font-black text-zinc-400 uppercase">
                        // PONS_POINTS_STATUS
                      </span>
                      <span className="text-[10px] bg-[var(--theme-color)] text-black px-1.5 py-0.5 font-black uppercase">
                        TWITTER DEPLOYER
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1">
                      <div className="flex flex-col">
                        <span className="text-[11px] text-zinc-400">Account:</span>
                        <span className="text-xs font-black text-white">
                          {user?.twitter?.username ? `@${user.twitter.username}` : (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'GUEST')}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-zinc-400">Reward per Action:</span>
                        <div className="text-xs font-black text-[var(--theme-color)]">+10 PTS</div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Link
                        href="/dashboard"
                        className="flex-1 text-center py-2 text-[11px] font-black uppercase bg-[var(--theme-color)] text-black border border-black hover:brightness-110 rounded transition-all shadow-[1px_1px_0px_0px_#ffffff]"
                      >
                        VIEW DASHBOARD & LEADERBOARD ↗
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* AI Typing Spinner */}
        {loadingAi && (
          <div className="flex items-center gap-2 text-zinc-400 text-xs py-2 px-1">
            <Spinner size="sm" />
            <span className="animate-pulse">Analyzing command parameters...</span>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Quick Suggestion Chips */}
      <div className="bg-[#0e1115] border-t border-zinc-800 px-3 py-2 flex items-center gap-1.5 overflow-x-auto custom-scrollbar flex-shrink-0">
        <span className="text-[10px] font-black text-zinc-500 uppercase flex-shrink-0">
          PROMPTS:
        </span>
        {QUICK_SUGGESTIONS.map((s, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSendMessage(s.prompt)}
            className="text-[11px] font-bold text-zinc-300 hover:text-black hover:bg-[var(--theme-color)] px-2.5 py-1 rounded bg-[#161a21] border border-zinc-700 hover:border-white whitespace-nowrap transition-all cursor-pointer flex-shrink-0 shadow-[1px_1px_0px_0px_#000000]"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Chat Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleSendMessage()
        }}
        className="bg-[#12151a] border-t-2 border-zinc-800 p-2.5 sm:p-3 flex items-center gap-2 flex-shrink-0"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type 'buy 10$ 0x...', 'sell all 0x...', 'check balance'..."
          disabled={loadingAi}
          className="flex-1 bg-[#181d24] border-2 border-zinc-700 focus:border-white rounded-lg px-3.5 py-2 text-xs sm:text-sm text-white placeholder-zinc-500 font-mono focus:outline-none shadow-[2px_2px_0px_0px_#000000]"
        />

        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={!input.trim() || loadingAi}
          loading={loadingAi}
          className="px-4 py-2 text-xs font-black uppercase flex-shrink-0 shadow-[2px_2px_0px_0px_#000000]"
        >
          SEND [ENTER]
        </Button>
      </form>

      {/* Embedded Create Token Modal */}
      <CreateTokenModal
        open={launchModalOpen}
        onClose={() => setLaunchModalOpen(false)}
        initialSymbol={launchModalData.symbol}
        initialName={launchModalData.name}
        onTokenCreated={async (newTokenCa) => {
          if (!newTokenCa) return
          let info = null
          try {
            info = await getPonsTokenInfo(newTokenCa)
          } catch {
            /* continue */
          }
          const sym = info?.symbol || launchModalData.symbol || 'TOKEN'
          const successMsg: ChatMessage = {
            id: `agent-launched-${Date.now()}`,
            role: 'assistant',
            content: `Token $${sym} has been successfully deployed to the Pons V2 Bonding Curve on Robinhood Chain!\n\nContract Address:\n${newTokenCa}\n\nYou can now trade $${sym} directly below:`,
            timestamp: Date.now(),
            action: {
              intent: 'BUY',
              tokenAddress: newTokenCa,
              tokenSymbol: sym,
              tokenInfo: info,
              amount: '0.001',
              amountType: 'ETH',
              confidence: 1.0,
            },
          }
          setMessages((prev) => [...prev, successMsg])
          setTimeout(() => {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
          }, 100)
        }}
      />
    </div>
  )
}
