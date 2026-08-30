import { NextRequest, NextResponse } from 'next/server'
import {
  createPublicClient,
  http,
  parseEther,
  parseUnits,
  formatEther,
  formatUnits,
  encodeFunctionData,
  encodeAbiParameters,
  getAddress,
  isAddress,
  erc20Abi,
  maxUint256,
  parseAbi,
} from 'viem'
import { robinhoodChain } from '@/lib/chains'
import { getPrivyClient } from '@/lib/privy-server'
import { getPonsTokenInfo } from '@/lib/pons-v2'

export const dynamic = 'force-dynamic'

const CURVE_ABI = parseAbi([
  'function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) payable returns (uint256 tokensOut)',
  'function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) returns (uint256 quoteOut)',
])

const UNIVERSAL_ROUTER = '0x8876789976decbfcbbbe364623c63652db8c0904' as `0x${string}`
const MEME_HOOK = '0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044' as `0x${string}`
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as `0x${string}`
const NATIVE_ETH = '0x0000000000000000000000000000000000000000' as `0x${string}`

const UR_ABI = parseAbi([
  'function execute(bytes commands, bytes[] inputs, uint256 deadline) payable',
])

const PERMIT2_ABI = parseAbi([
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
  'function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
])

function buildV4SwapCalldata({
  isBuy,
  tokenAddress,
  amountIn,
  minAmountOut,
  deadline,
  hookAddress = MEME_HOOK,
  fee = 0,
  tickSpacing = 200,
}: {
  isBuy: boolean
  tokenAddress: string
  amountIn: string
  minAmountOut: string
  deadline: number
  hookAddress?: string
  fee?: number
  tickSpacing?: number
}) {
  const token = getAddress(tokenAddress)
  const currency0 = NATIVE_ETH
  const currency1 = token
  const zeroForOne = isBuy

  const swapParam = encodeAbiParameters(
    [
      {
        name: 'ExactInputSingleParams',
        type: 'tuple',
        components: [
          {
            name: 'poolKey',
            type: 'tuple',
            components: [
              { name: 'currency0', type: 'address' },
              { name: 'currency1', type: 'address' },
              { name: 'fee', type: 'uint24' },
              { name: 'tickSpacing', type: 'int24' },
              { name: 'hooks', type: 'address' },
            ],
          },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'amountIn', type: 'uint128' },
          { name: 'amountOutMinimum', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    [
      {
        poolKey: {
          currency0,
          currency1,
          fee,
          tickSpacing,
          hooks: getAddress(hookAddress),
        },
        zeroForOne,
        amountIn: BigInt(amountIn),
        amountOutMinimum: BigInt(minAmountOut || '1'),
        hookData: '0x',
      },
    ]
  )

  let actions = '0x060c0f'
  let settleParam: `0x${string}`

  if (isBuy) {
    actions = '0x060c0f'
    settleParam = encodeAbiParameters(
      [
        { name: 'currency', type: 'address' },
        { name: 'maxAmount', type: 'uint256' },
      ],
      [currency0, BigInt(amountIn)]
    )
  } else {
    actions = '0x060b0f'
    settleParam = encodeAbiParameters(
      [
        { name: 'currency', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'payerIsUser', type: 'bool' },
      ],
      [currency1, BigInt(amountIn), true]
    )
  }

  const outputCurrency = zeroForOne ? currency1 : currency0
  const takeParam = encodeAbiParameters(
    [
      { name: 'currency', type: 'address' },
      { name: 'minAmount', type: 'uint256' },
    ],
    [outputCurrency, BigInt(minAmountOut || '1')]
  )

  const commands = '0x10' as `0x${string}`
  const v4Input = encodeAbiParameters(
    [
      { name: 'actions', type: 'bytes' },
      { name: 'params', type: 'bytes[]' },
    ],
    [actions as `0x${string}`, [swapParam, settleParam, takeParam] as `0x${string}`[]]
  )

  return encodeFunctionData({
    abi: UR_ABI,
    functionName: 'execute',
    args: [commands, [v4Input], BigInt(deadline)],
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { twitterHandle, address, tokenAddress, isBuy, amount, slippage = 1.0, percentage } = body

    if ((!twitterHandle && !address) || !tokenAddress || !isAddress(tokenAddress) || !amount) {
      return NextResponse.json({ error: 'Missing required swap parameters' }, { status: 400 })
    }

    const { getOrCreateTwitterUserWallet } = await import('@/lib/privy-server')
    const { getBotUsers } = await import('@/lib/bot-wallet')
    const users = await getBotUsers()
    const foundUser = users.find(u =>
      (address && u.walletAddress?.toLowerCase() === address.toLowerCase()) ||
      (twitterHandle && u.twitterHandle?.toLowerCase() === twitterHandle.replace('@', '').toLowerCase())
    )

    let senderAddress = foundUser?.walletAddress || address
    let senderWalletId = (foundUser as any)?.walletId

    if (!senderWalletId && twitterHandle) {
      const mapping = await getOrCreateTwitterUserWallet(
        '',
        twitterHandle.replace('@', '')
      )
      if (mapping) {
        senderAddress = mapping.walletAddress
        senderWalletId = mapping.walletId
      }
    }

    if (!senderAddress || !senderWalletId) {
      return NextResponse.json({ error: 'Server wallet not found for address' }, { status: 404 })
    }

    const publicClient = createPublicClient({
      chain: robinhoodChain,
      transport: http('https://robinhood-rpc.publicnode.com'),
    })

    const privy = getPrivyClient()
    if (!privy) {
      return NextResponse.json({ error: 'Privy server client not configured' }, { status: 500 })
    }

    const tokenInfo = await getPonsTokenInfo(tokenAddress)
    if (!tokenInfo) {
      return NextResponse.json({ error: 'Token info not found on Pons v2' }, { status: 404 })
    }

    const isGraduated = tokenInfo.graduated || tokenInfo.phase === 2
    const curveAddress = getAddress(tokenInfo.curveAddress)
    const tokenCa = getAddress(tokenAddress)
    const slipBps = Math.floor(Number(slippage) * 100)

    const rawGasPrice = await publicClient.getGasPrice()
    const gasPrice = (rawGasPrice * 125n) / 100n
    let nonce = await publicClient.getTransactionCount({ address: senderAddress })

    if (isGraduated) {
      // ══════════════════════════════════════════════════════════════════
      // ── ROUTE: UNISWAP V4 GRADUATED POOL (UNIVERSAL ROUTER) ──
      // ══════════════════════════════════════════════════════════════════
      const deadline = Math.floor(Date.now() / 1000) + 1200

      if (isBuy) {
        const quoteIn = parseEther(String(amount))
        const balance = await publicClient.getBalance({ address: senderAddress })
        const minGasCost = gasPrice * 350000n

        if (balance < quoteIn + minGasCost) {
          return NextResponse.json({
            error: `Insufficient ETH balance (${formatEther(balance)} ETH) to cover buy amount (${formatEther(quoteIn)} ETH) + gas.`,
          }, { status: 400 })
        }

        const calldata = buildV4SwapCalldata({
          isBuy: true,
          tokenAddress: tokenCa,
          amountIn: quoteIn.toString(),
          minAmountOut: '1',
          deadline,
          hookAddress: tokenInfo.poolKey?.hooks || MEME_HOOK,
          fee: tokenInfo.poolFee || 0,
          tickSpacing: tokenInfo.tickSpacing || 200,
        })

        const signRes = await privy.walletApi.ethereum.signTransaction({
          walletId: senderWalletId,
          transaction: {
            to: UNIVERSAL_ROUTER,
            value: `0x${quoteIn.toString(16)}`,
            data: calldata,
            chainId: 4663,
            nonce,
            gasLimit: '0x55730', // 350,000 gas
            gasPrice: `0x${gasPrice.toString(16)}`,
            type: 0,
          },
        })

        const txHash = await publicClient.sendRawTransaction({
          serializedTransaction: signRes.signedTransaction as `0x${string}`,
        })

        await publicClient.waitForTransactionReceipt({ hash: txHash })

        return NextResponse.json({
          success: true,
          txHash,
          isBuy: true,
          message: `Successfully bought $${tokenInfo.symbol} on Uniswap v4 for ${amount} ETH!`,
        })
      } else {
        const tokenBal = await publicClient.readContract({
          address: tokenCa,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [senderAddress],
        })

        if (tokenBal <= 0n) {
          return NextResponse.json({
            error: `Insufficient $${tokenInfo.symbol} balance (0) to sell.`,
          }, { status: 400 })
        }

        const pct = percentage || (String(amount).endsWith('%') ? parseFloat(String(amount)) : undefined)
        const isAllAmount = String(amount).toLowerCase() === 'all' || String(amount).toLowerCase() === 'max' || pct === 100
        const tokensIn = isAllAmount
          ? tokenBal
          : pct && pct > 0
          ? (tokenBal * BigInt(Math.floor(pct))) / 100n
          : parseUnits(String(amount), 18)

        if (tokenBal < tokensIn) {
          return NextResponse.json({
            error: `Insufficient $${tokenInfo.symbol} balance (${formatUnits(tokenBal, 18)}) to sell ${amount}.`,
          }, { status: 400 })
        }

        // 1. Check & execute ERC20 approval to Permit2
        const allowancePermit2 = await publicClient.readContract({
          address: tokenCa,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [senderAddress, PERMIT2],
        })

        if (allowancePermit2 < tokensIn) {
          console.log(`[Swap API] Approving $${tokenInfo.symbol} for Permit2: ${PERMIT2}...`)
          const approveData = encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [PERMIT2, maxUint256],
          })

          const signApprove = await privy.walletApi.ethereum.signTransaction({
            walletId: senderWalletId,
            transaction: {
              to: tokenCa,
              value: '0x0',
              data: approveData,
              chainId: 4663,
              nonce,
              gasLimit: '0x186A0',
              gasPrice: `0x${gasPrice.toString(16)}`,
              type: 0,
            },
          })

          const approveTx = await publicClient.sendRawTransaction({
            serializedTransaction: signApprove.signedTransaction as `0x${string}`,
          })
          await publicClient.waitForTransactionReceipt({ hash: approveTx })
          nonce += 1
        }

        // 2. Check & execute Permit2 internal approval to Universal Router
        const permit2Info = await publicClient.readContract({
          address: PERMIT2,
          abi: PERMIT2_ABI,
          functionName: 'allowance',
          args: [senderAddress, tokenCa, UNIVERSAL_ROUTER],
        }).catch(() => [0n, 0, 0] as const)

        const nowSec = Math.floor(Date.now() / 1000)
        if (BigInt(permit2Info[0]) < tokensIn || Number(permit2Info[1]) <= nowSec) {
          console.log(`[Swap API] Authorizing Universal Router on Permit2 for $${tokenInfo.symbol}...`)
          const maxUint160 = (1n << 160n) - 1n
          const expiration = nowSec + 86400 * 365
          const p2ApproveData = encodeFunctionData({
            abi: PERMIT2_ABI,
            functionName: 'approve',
            args: [tokenCa, UNIVERSAL_ROUTER, maxUint160, expiration],
          })

          const signP2 = await privy.walletApi.ethereum.signTransaction({
            walletId: senderWalletId,
            transaction: {
              to: PERMIT2,
              value: '0x0',
              data: p2ApproveData,
              chainId: 4663,
              nonce,
              gasLimit: '0x186A0',
              gasPrice: `0x${gasPrice.toString(16)}`,
              type: 0,
            },
          })

          const txP2 = await publicClient.sendRawTransaction({
            serializedTransaction: signP2.signedTransaction as `0x${string}`,
          })
          await publicClient.waitForTransactionReceipt({ hash: txP2 })
          nonce += 1
        }

        const calldata = buildV4SwapCalldata({
          isBuy: false,
          tokenAddress: tokenCa,
          amountIn: tokensIn.toString(),
          minAmountOut: '1',
          deadline,
          hookAddress: tokenInfo.poolKey?.hooks || MEME_HOOK,
          fee: tokenInfo.poolFee || 0,
          tickSpacing: tokenInfo.tickSpacing || 200,
        })

        const signSell = await privy.walletApi.ethereum.signTransaction({
          walletId: senderWalletId,
          transaction: {
            to: UNIVERSAL_ROUTER,
            value: '0x0',
            data: calldata,
            chainId: 4663,
            nonce,
            gasLimit: '0x55730', // 350,000 gas
            gasPrice: `0x${gasPrice.toString(16)}`,
            type: 0,
          },
        })

        const txHash = await publicClient.sendRawTransaction({
          serializedTransaction: signSell.signedTransaction as `0x${string}`,
        })

        await publicClient.waitForTransactionReceipt({ hash: txHash })

        return NextResponse.json({
          success: true,
          txHash,
          isBuy: false,
          message: `Successfully sold ${amount} $${tokenInfo.symbol} on Uniswap v4 for ETH!`,
        })
      }
    } else {
      // ══════════════════════════════════════════════════════════════════
      // ── ROUTE: ACTIVE PONS V2 BONDING CURVE ──
      // ══════════════════════════════════════════════════════════════════
      if (isBuy) {
        // ── BUY ACTION ──
        const quoteIn = parseEther(String(amount))
        const balance = await publicClient.getBalance({ address: senderAddress })
        const minGasCost = gasPrice * 300000n

        if (balance < quoteIn + minGasCost) {
          return NextResponse.json({
            error: `Insufficient ETH balance (${formatEther(balance)} ETH) to cover buy amount (${formatEther(quoteIn)} ETH) + gas.`,
          }, { status: 400 })
        }

        // Simulate buy to get expected tokens out
        let minTokensOut = 0n
        try {
          const sim = await publicClient.simulateContract({
            address: curveAddress,
            abi: CURVE_ABI,
            functionName: 'buy',
            args: [quoteIn, 0n, senderAddress],
            value: quoteIn,
            account: senderAddress,
          })
          const tokensOutEst = sim.result
          if (tokensOutEst > 0n) {
            minTokensOut = (tokensOutEst * BigInt(10000 - slipBps)) / 10000n
          }
        } catch {
          minTokensOut = 0n
        }

        const calldata = encodeFunctionData({
          abi: CURVE_ABI,
          functionName: 'buy',
          args: [quoteIn, minTokensOut, senderAddress],
        })

        const signRes = await privy.walletApi.ethereum.signTransaction({
          walletId: senderWalletId,
          transaction: {
            to: curveAddress,
            value: `0x${quoteIn.toString(16)}`,
            data: calldata,
            chainId: 4663,
            nonce,
            gasLimit: '0x493E0', // 300,000 gas
            gasPrice: `0x${gasPrice.toString(16)}`,
            type: 0,
          },
        })

        const txHash = await publicClient.sendRawTransaction({
          serializedTransaction: signRes.signedTransaction as `0x${string}`,
        })

        await publicClient.waitForTransactionReceipt({ hash: txHash })

        return NextResponse.json({
          success: true,
          txHash,
          isBuy: true,
          message: `Successfully bought $${tokenInfo.symbol} for ${amount} ETH!`,
        })
      } else {
        // ── SELL ACTION ──
        const tokenBal = await publicClient.readContract({
          address: tokenCa,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [senderAddress],
        })

        if (tokenBal <= 0n) {
          return NextResponse.json({
            error: `Insufficient $${tokenInfo.symbol} balance (0) to sell.`,
          }, { status: 400 })
        }

        const pct = percentage || (String(amount).endsWith('%') ? parseFloat(String(amount)) : undefined)
        const isAllAmount = String(amount).toLowerCase() === 'all' || String(amount).toLowerCase() === 'max' || pct === 100
        const tokensIn = isAllAmount
          ? tokenBal
          : pct && pct > 0
          ? (tokenBal * BigInt(Math.floor(pct))) / 100n
          : parseUnits(String(amount), 18)

        if (tokenBal < tokensIn) {
          return NextResponse.json({
            error: `Insufficient $${tokenInfo.symbol} balance (${formatUnits(tokenBal, 18)}) to sell ${amount}.`,
          }, { status: 400 })
        }

        // Check allowance
        const allowance = await publicClient.readContract({
          address: tokenCa,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [senderAddress, curveAddress],
        })

        if (allowance < tokensIn) {
          console.log(`[Swap API] Approving $${tokenInfo.symbol} for curve: ${curveAddress}...`)
          const approveData = encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [curveAddress, maxUint256],
          })

          const signApprove = await privy.walletApi.ethereum.signTransaction({
            walletId: senderWalletId,
            transaction: {
              to: tokenCa,
              value: '0x0',
              data: approveData,
              chainId: 4663,
              nonce,
              gasLimit: '0x186A0', // 100,000 gas
              gasPrice: `0x${gasPrice.toString(16)}`,
              type: 0,
            },
          })

          const approveTx = await publicClient.sendRawTransaction({
            serializedTransaction: signApprove.signedTransaction as `0x${string}`,
          })
          await publicClient.waitForTransactionReceipt({ hash: approveTx })
          nonce += 1
        }

        // Simulate sell to get expected quote out
        let minQuoteOut = 0n
        try {
          const sim = await publicClient.simulateContract({
            address: curveAddress,
            abi: CURVE_ABI,
            functionName: 'sell',
            args: [tokensIn, 0n, senderAddress],
            account: senderAddress,
          })
          const quoteOutEst = sim.result
          if (quoteOutEst > 0n) {
            minQuoteOut = (quoteOutEst * BigInt(10000 - slipBps)) / 10000n
          }
        } catch {
          minQuoteOut = 0n
        }

        const sellData = encodeFunctionData({
          abi: CURVE_ABI,
          functionName: 'sell',
          args: [tokensIn, minQuoteOut, senderAddress],
        })

        const signSell = await privy.walletApi.ethereum.signTransaction({
          walletId: senderWalletId,
          transaction: {
            to: curveAddress,
            value: '0x0',
            data: sellData,
            chainId: 4663,
            nonce,
            gasLimit: '0x493E0', // 300,000 gas
            gasPrice: `0x${gasPrice.toString(16)}`,
            type: 0,
          },
        })

        const txHash = await publicClient.sendRawTransaction({
          serializedTransaction: signSell.signedTransaction as `0x${string}`,
        })

        await publicClient.waitForTransactionReceipt({ hash: txHash })

        return NextResponse.json({
          success: true,
          txHash,
          isBuy: false,
          message: `Successfully sold ${amount} $${tokenInfo.symbol} for ETH!`,
        })
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Swap failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
