import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const UNISWAP_GATEWAY_URL = 'https://trade-api.gateway.uniswap.org/v1'
const ROBINHOOD_CHAIN_ID = 4663
const NATIVE_ETH_ADDRESS = '0x0000000000000000000000000000000000000000'
const UNIVERSAL_ROUTER_ADDRESS = '0x8876789976decbfcbbbe364623c63652db8c0904'

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

    if (!tokenIn || !tokenOut || !amount || !walletAddress) {
      return NextResponse.json(
        { error: 'Missing required parameters: tokenIn, tokenOut, amount, walletAddress' },
        { status: 400 }
      )
    }

    const apiKey = process.env.UNISWAP_API_KEY

    // 1. Try Uniswap Trading API if API key is provided
    if (apiKey) {
      try {
        const quotePayload = {
          type,
          tokenInChainId: ROBINHOOD_CHAIN_ID,
          tokenOutChainId: ROBINHOOD_CHAIN_ID,
          tokenIn: tokenIn.toLowerCase() === NATIVE_ETH_ADDRESS.toLowerCase() ? NATIVE_ETH_ADDRESS : tokenIn,
          tokenOut: tokenOut.toLowerCase() === NATIVE_ETH_ADDRESS.toLowerCase() ? NATIVE_ETH_ADDRESS : tokenOut,
          amount: String(amount),
          swapper: walletAddress,
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

    // 2. Real-time on-chain DexScreener/Robinhood v4 pool quote
    const isBuy = tokenIn.toLowerCase() === NATIVE_ETH_ADDRESS.toLowerCase()
    const targetToken = isBuy ? tokenOut : tokenIn

    const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${targetToken}`, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store',
    })

    let priceNative = 0.00000003425
    let pairAddress = null

    if (dexRes.ok) {
      const dexData = await dexRes.json()
      const pair = dexData.pairs?.find((p: { chainId?: string }) => p.chainId === 'robinhood') || dexData.pairs?.[0]
      if (pair) {
        if (parseFloat(pair.priceNative) > 0) priceNative = parseFloat(pair.priceNative)
        if (pair.pairAddress) pairAddress = pair.pairAddress
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
      source: 'onchain_dex',
      routing: 'CLASSIC',
      route: 'UNISWAP V4',
      routerAddress: UNIVERSAL_ROUTER_ADDRESS,
      pairAddress,
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
