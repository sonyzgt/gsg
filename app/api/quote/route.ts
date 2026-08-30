import { NextRequest, NextResponse } from 'next/server'
import {
  createPublicClient,
  http,
  parseEther,
  parseUnits,
  formatEther,
  formatUnits,
  parseAbi,
  getAddress,
  isAddress,
} from 'viem'
import { robinhoodChain } from '@/lib/chains'
import { getPonsTokenInfo } from '@/lib/pons-v2'

export const dynamic = 'force-dynamic'

const CURVE_ABI = parseAbi([
  'function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) payable returns (uint256 tokensOut)',
  'function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) returns (uint256 quoteOut)',
])

const DUMMY_ACCOUNT = '0x5093B38d28E9E8F571157C61762FdA15c30670a6' as `0x${string}`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { tokenAddress, amount, isBuy = true, slippage = 1.0 } = body

    if (!tokenAddress || !isAddress(tokenAddress) || !amount || parseFloat(amount) <= 0) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
    }

    const numAmount = parseFloat(amount)
    const slipBps = Math.floor(Number(slippage) * 100)
    const slipMultiplier = 1 - slipBps / 10000

    const publicClient = createPublicClient({
      chain: robinhoodChain,
      transport: http('https://robinhood-rpc.publicnode.com'),
    })

    const tokenInfo = await getPonsTokenInfo(tokenAddress)
    if (!tokenInfo) {
      return NextResponse.json({ error: 'Token info not found' }, { status: 404 })
    }

    const isGraduated = tokenInfo.graduated || tokenInfo.phase === 2
    const tokenCa = getAddress(tokenAddress)

    if (!isGraduated && tokenInfo.curveAddress) {
      // ══════════════════════════════════════════════════════════════════
      // ── ROUTE 1: EXACT BONDING CURVE SIMULATION ──
      // ══════════════════════════════════════════════════════════════════
      const curveAddress = getAddress(tokenInfo.curveAddress)

      if (isBuy) {
        const quoteIn = parseEther(String(amount))
        try {
          const sim = await publicClient.simulateContract({
            address: curveAddress,
            abi: CURVE_ABI,
            functionName: 'buy',
            args: [quoteIn, 0n, DUMMY_ACCOUNT],
            value: quoteIn,
            account: DUMMY_ACCOUNT,
          })
          const tokensOut = sim.result
          const tokensOutNum = parseFloat(formatUnits(tokensOut, 18))
          const minTokensOutNum = tokensOutNum * slipMultiplier

          return NextResponse.json({
            success: true,
            isGraduated: false,
            estimatedOutput: tokensOutNum,
            minReceived: minTokensOutNum,
            estimatedOutputRaw: tokensOut.toString(),
            priceNative: tokenInfo.priceNative,
            route: 'PONS V2 BONDING CURVE',
          })
        } catch {
          const pNat = tokenInfo.priceNative > 0 ? tokenInfo.priceNative : 0.0000000025
          const est = (numAmount * 0.985) / pNat
          return NextResponse.json({
            success: true,
            isGraduated: false,
            estimatedOutput: est,
            minReceived: est * slipMultiplier,
            priceNative: pNat,
            route: 'PONS V2 BONDING CURVE',
          })
        }
      } else {
        const tokensIn = parseUnits(String(amount), 18)
        try {
          const sim = await publicClient.simulateContract({
            address: curveAddress,
            abi: CURVE_ABI,
            functionName: 'sell',
            args: [tokensIn, 0n, DUMMY_ACCOUNT],
            account: DUMMY_ACCOUNT,
          })
          const ethOut = sim.result
          const ethOutNum = parseFloat(formatEther(ethOut))
          const minEthOutNum = ethOutNum * slipMultiplier

          return NextResponse.json({
            success: true,
            isGraduated: false,
            estimatedOutput: ethOutNum,
            minReceived: minEthOutNum,
            estimatedOutputRaw: ethOut.toString(),
            priceNative: tokenInfo.priceNative,
            route: 'PONS V2 BONDING CURVE',
          })
        } catch {
          const pNat = tokenInfo.priceNative > 0 ? tokenInfo.priceNative : 0.0000000025
          const est = numAmount * pNat * 0.985
          return NextResponse.json({
            success: true,
            isGraduated: false,
            estimatedOutput: est,
            minReceived: est * slipMultiplier,
            priceNative: pNat,
            route: 'PONS V2 BONDING CURVE',
          })
        }
      }
    } else {
      // ══════════════════════════════════════════════════════════════════
      // ── ROUTE 2: UNISWAP V4 GRADUATED LIVE MARKET PRICE ──
      // ══════════════════════════════════════════════════════════════════
      let livePriceNative = tokenInfo.priceNative

      try {
        const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenCa}`, {
          headers: { 'Accept': 'application/json' },
          next: { revalidate: 10 },
          signal: AbortSignal.timeout(2000),
        })
        if (dexRes.ok) {
          const dexData = await dexRes.json()
          const pair = dexData.pairs?.[0]
          const pNat = parseFloat(pair?.priceNative || '0')
          if (pNat > 0) {
            livePriceNative = pNat
          }
        }
      } catch {
        /* fallback */
      }

      if (!livePriceNative || livePriceNative <= 0) {
        livePriceNative = 0.00000000588
      }

      let estOut = 0
      if (isBuy) {
        estOut = (numAmount * 0.99) / livePriceNative
      } else {
        estOut = numAmount * livePriceNative * 0.99
      }

      const minRec = estOut * slipMultiplier

      return NextResponse.json({
        success: true,
        isGraduated: true,
        estimatedOutput: estOut,
        minReceived: minRec,
        priceNative: livePriceNative,
        route: 'UNISWAP V4',
      })
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to calculate quote'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
