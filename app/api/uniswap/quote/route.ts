import { NextRequest, NextResponse } from 'next/server'
import {
  createPublicClient,
  http,
  encodeAbiParameters,
  encodeFunctionData,
  parseAbi,
  parseEther,
  parseUnits,
  getAddress,
  isAddress,
} from 'viem'
import { robinhoodChain } from '@/lib/chains'

export const dynamic = 'force-dynamic'

const UNISWAP_GATEWAY_URL = 'https://trade-api.gateway.uniswap.org/v1'
const ROBINHOOD_CHAIN_ID = 4663
const NATIVE_ETH = '0x0000000000000000000000000000000000000000'
const UNIVERSAL_ROUTER = '0x8876789976decbfcbbbe364623c63652db8c0904' as `0x${string}`
const MEME_HOOK = '0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044' as `0x${string}`
const DUMMY_ACCOUNT = '0x5093B38d28E9E8F571157C61762FdA15c30670a6' as `0x${string}`

const rpcClient = createPublicClient({
  chain: robinhoodChain,
  transport: http('https://robinhood-rpc.publicnode.com'),
})

const UR_ABI = parseAbi([
  'function execute(bytes commands, bytes[] inputs, uint256 deadline) payable',
])

function buildV4SwapCalldata({
  isBuy,
  tokenAddress,
  amountIn,
  minAmountOut,
  deadline,
}: {
  isBuy: boolean
  tokenAddress: string
  amountIn: bigint
  minAmountOut: bigint
  deadline: number
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
          fee: 0,
          tickSpacing: 200,
          hooks: MEME_HOOK,
        },
        zeroForOne,
        amountIn,
        amountOutMinimum: minAmountOut,
        hookData: '0x',
      },
    ]
  )

  const inputCurrency = zeroForOne ? currency0 : currency1
  const settleParam = encodeAbiParameters(
    [
      { name: 'currency', type: 'address' },
      { name: 'maxAmount', type: 'uint256' },
    ],
    [inputCurrency, amountIn]
  )

  const outputCurrency = zeroForOne ? currency1 : currency0
  const takeParam = encodeAbiParameters(
    [
      { name: 'currency', type: 'address' },
      { name: 'minAmount', type: 'uint256' },
    ],
    [outputCurrency, minAmountOut]
  )

  const v4Input = encodeAbiParameters(
    [
      { name: 'actions', type: 'bytes' },
      { name: 'params', type: 'bytes[]' },
    ],
    ['0x060c0f', [swapParam, settleParam, takeParam]]
  )

  return encodeFunctionData({
    abi: UR_ABI,
    functionName: 'execute',
    args: ['0x10', [v4Input], BigInt(deadline)],
  })
}

async function getExactOnChainQuote(
  isBuy: boolean,
  tokenAddress: string,
  amountInWei: bigint
): Promise<bigint> {
  const deadline = Math.floor(Date.now() / 1000) + 1200
  let low = 0n
  let high = isBuy ? parseUnits('100000000', 18) : parseEther('1000')
  let best = 0n

  // Binary search for exact v4 curve output
  for (let i = 0; i < 16; i++) {
    const mid = (low + high) / 2n
    if (mid === 0n) break

    const calldata = buildV4SwapCalldata({
      isBuy,
      tokenAddress,
      amountIn: amountInWei,
      minAmountOut: mid,
      deadline,
    })

    const pass = await rpcClient
      .call({
        account: DUMMY_ACCOUNT,
        to: UNIVERSAL_ROUTER,
        data: calldata,
        value: isBuy ? amountInWei : 0n,
      })
      .then(() => true)
      .catch(() => false)

    if (pass) {
      best = mid
      low = mid + 1n
    } else {
      high = mid - 1n
    }
  }

  return best
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      tokenIn,
      tokenOut,
      amount,
      walletAddress,
      slippage = 1.0,
      type = 'EXACT_INPUT',
    } = body

    if (!tokenIn || !tokenOut || !amount) {
      return NextResponse.json(
        { error: 'Missing required parameters: tokenIn, tokenOut, amount' },
        { status: 400 }
      )
    }

    const apiKey = process.env.UNISWAP_API_KEY
    const isBuy = tokenIn.toLowerCase() === NATIVE_ETH.toLowerCase()
    const targetToken = isBuy ? tokenOut : tokenIn
    const amountInWei = BigInt(amount)

    // 1. Try Uniswap Trading API if API key is provided
    if (apiKey) {
      try {
        const quotePayload = {
          type,
          tokenInChainId: ROBINHOOD_CHAIN_ID,
          tokenOutChainId: ROBINHOOD_CHAIN_ID,
          tokenIn: isBuy ? NATIVE_ETH : tokenIn,
          tokenOut: isBuy ? tokenOut : NATIVE_ETH,
          amount: String(amount),
          swapper: walletAddress || DUMMY_ACCOUNT,
          slippageTolerance: parseFloat(String(slippage)) || 1.0,
        }

        const apiRes = await fetch(`${UNISWAP_GATEWAY_URL}/quote`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify(quotePayload),
        })

        if (apiRes.ok) {
          const data = await apiRes.json()
          return NextResponse.json({
            success: true,
            source: 'uniswap_api',
            quote: data.quote,
            routing: data.routing || 'CLASSIC',
            route: data.route || 'UNISWAP V4',
            tokenIn: data.tokenIn || tokenIn,
            tokenOut: data.tokenOut || tokenOut,
            amountIn: data.quote?.amount || amount,
            amountOut: data.quote?.quote || '0',
            minAmountOut: data.quote?.minAmountOut || '0',
            slippage: data.quote?.slippage || slippage,
            gasFee: data.quote?.gasFee || '0',
            requestId: data.requestId,
            raw: data,
          })
        }
      } catch (err) {
        console.error('Uniswap Trading API error:', err)
      }
    }

    // 2. Exact On-chain Uniswap v4 Curve Simulation Quote
    if (isAddress(targetToken)) {
      try {
        const exactOutBigInt = await getExactOnChainQuote(isBuy, targetToken, amountInWei)
        if (exactOutBigInt > 0n) {
          const slipBps = BigInt(Math.floor((100 - slippage) * 100))
          const minReceivedBigInt = (exactOutBigInt * slipBps) / 10000n

          return NextResponse.json({
            success: true,
            source: 'uniswap_v4_onchain_pool',
            routing: 'CLASSIC',
            route: 'UNISWAP V4',
            routerAddress: UNIVERSAL_ROUTER,
            tokenIn,
            tokenOut,
            amountIn: String(amount),
            amountOut: exactOutBigInt.toString(),
            minAmountOut: minReceivedBigInt.toString(),
            slippage,
          })
        }
      } catch (err) {
        console.error('Exact on-chain v4 quote error:', err)
      }
    }

    // 3. Fallback Linear Approximation
    const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${targetToken}`, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store',
    })

    let priceNative = 0.00000003425
    if (dexRes.ok) {
      const dexData = await dexRes.json()
      const pair = dexData.pairs?.find((p: { chainId?: string }) => p.chainId === 'robinhood') || dexData.pairs?.[0]
      if (pair && parseFloat(pair.priceNative) > 0) {
        priceNative = parseFloat(pair.priceNative)
      }
    }

    const amountInNum = parseFloat(amount) / 1e18
    let amountOutBigInt = 0n
    let minReceivedBigInt = 0n

    if (isBuy) {
      const tokensOut = (amountInNum * 0.985) / priceNative
      amountOutBigInt = BigInt(Math.floor(tokensOut * 1e18))
      minReceivedBigInt = BigInt(Math.floor(tokensOut * (1 - slippage / 100) * 1e18))
    } else {
      const ethOut = amountInNum * priceNative * 0.985
      amountOutBigInt = BigInt(Math.floor(ethOut * 1e18))
      minReceivedBigInt = BigInt(Math.floor(ethOut * (1 - slippage / 100) * 1e18))
    }

    return NextResponse.json({
      success: true,
      source: 'onchain_dex_fallback',
      routing: 'CLASSIC',
      route: 'UNISWAP V4',
      routerAddress: UNIVERSAL_ROUTER,
      tokenIn,
      tokenOut,
      amountIn: String(amount),
      amountOut: amountOutBigInt.toString(),
      minAmountOut: minReceivedBigInt.toString(),
      priceNative,
      slippage,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch quote'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
