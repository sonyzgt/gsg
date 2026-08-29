import { NextRequest, NextResponse } from 'next/server'
import { isAddress, createPublicClient, http, erc20Abi, getAddress } from 'viem'
import { robinhoodChain } from '@/lib/chains'
import { getPonsTokenInfo } from '@/lib/pons-v2'

export const dynamic = 'force-dynamic'

const rpcClient = createPublicClient({
  chain: robinhoodChain,
  transport: http('https://robinhood-rpc.publicnode.com'),
})

const GT_BASE  = 'https://api.geckoterminal.com/api/v2'
const GT_NET   = 'robinhood'
const WETH     = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73'
const FACTORY  = '0xE51960f1B45f1C9FB6D166E6a884F866fC70433B' as `0x${string}`
const FEE_TIERS = [10000, 3000, 500, 100, 2500, 200]

const FACTORY_ABI = [
  {
    name: 'getPool',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'fee',    type: 'uint24'  },
    ],
    outputs: [{ name: 'pool', type: 'address' }],
  },
] as const

const POOL_ABI = [
  {
    name: 'slot0',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick',         type: 'int24'   },
      { name: 'obs',          type: 'uint16'  },
      { name: 'obsCard',      type: 'uint16'  },
      { name: 'obsCardNext',  type: 'uint16'  },
      { name: 'feeProtocol',  type: 'uint8'   },
      { name: 'unlocked',     type: 'bool'    },
    ],
  },
  {
    name: 'token0',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

function tickToNative(tick: number, isTokenToken0: boolean, tokenDecimals: number): number {
  const t = Math.max(-887272, Math.min(887272, tick))
  const rawPrice = Math.pow(1.0001, t)
  if (rawPrice <= 0) return 0

  if (isTokenToken0) {
    return rawPrice * Math.pow(10, tokenDecimals - 18)
  } else {
    const tokenPerEth = rawPrice * Math.pow(10, 18 - tokenDecimals)
    return tokenPerEth > 0 ? 1 / tokenPerEth : 0
  }
}

export interface TokenPrice {
  address: string
  symbol: string
  name: string
  decimals: number
  priceNative: number   // ETH per 1 Token
  priceUsd: number
  ethPriceUsd: number
  poolFee: number       // e.g. 10000 = 1%, 3000 = 0.3%
  poolAddress: string | null
  dexType: string
  isUsdgPaired: boolean
  source: string
  phase?: number
  graduated?: boolean
  curveAddress?: string
  pairToken?: string
  tickSpacing?: number
  creatorTaxBps?: number
  isNative?: boolean
  poolId?: string | null
  poolKey?: Record<string, unknown> | null
  route?: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    let rawInput = String(body.address || '').trim()

    // Clean URL if user pasted full tx explorer URL
    if (rawInput.includes('/tx/')) {
      rawInput = rawInput.split('/tx/')[1]?.split('/')[0]?.split('?')[0] || rawInput
    }

    let targetTokenAddress = rawInput

    // If user passed a 66-character Tx Hash instead of Token Address, extract token CA from receipt
    if (rawInput.startsWith('0x') && rawInput.length === 66) {
      try {
        const receipt = await rpcClient.getTransactionReceipt({ hash: rawInput as `0x${string}` })
        for (const log of receipt.logs) {
          if (
            log.topics &&
            log.topics.length >= 3 &&
            log.topics[0] === '0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607'
          ) {
            targetTokenAddress = getAddress('0x' + (log.topics[1] ?? '').slice(26))
            break
          }
        }
      } catch { /* ignore */ }
    }

    if (!targetTokenAddress || !isAddress(targetTokenAddress)) {
      return NextResponse.json({ error: 'Address / Tx Hash tidak valid' }, { status: 400 })
    }

    const ca    = getAddress(targetTokenAddress)
    const caLow = ca.toLowerCase()

    let symbol      = ''
    let name        = ''
    let decimals    = 18
    let ethPriceUsd = 2500

    // ── 1. Baca metadata on-chain ─────────────────────────────────────────
    try {
      const [d, n, s] = await Promise.all([
        rpcClient.readContract({ address: ca, abi: erc20Abi, functionName: 'decimals' }).catch(() => 18),
        rpcClient.readContract({ address: ca, abi: erc20Abi, functionName: 'name'     }).catch(() => ''),
        rpcClient.readContract({ address: ca, abi: erc20Abi, functionName: 'symbol'   }).catch(() => ''),
      ])
      decimals = Number(d)
      name     = String(n)
      symbol   = String(s)
    } catch { /* ignore */ }

    // ── 2. Primary Pons V2 Token Resolver ────────────────────────────────
    const ponsInfo = await getPonsTokenInfo(ca)
    if (ponsInfo) {
      if (!name) name = symbol || 'Pons Token'

      // If graduated, check if DexScreener has active pool price
      let livePriceNative = ponsInfo.priceNative
      let livePriceUsd = ponsInfo.priceUsd
      if (ponsInfo.graduated || ponsInfo.phase === 2) {
        try {
          const dxRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`, { cache: 'no-store' })
          if (dxRes.ok) {
            const dxData = await dxRes.json()
            const pair = dxData?.pairs?.find((p: { chainId?: string }) => p.chainId === 'robinhood') || dxData?.pairs?.[0]
            if (pair && parseFloat(pair.priceNative) > 0) {
              livePriceNative = parseFloat(pair.priceNative)
              livePriceUsd = parseFloat(pair.priceUsd) || livePriceNative * ethPriceUsd
            }
          }
        } catch { /* continue */ }
      }

      return NextResponse.json({
        source: 'onchain',
        dexType: 'pons-v2',
        phase: ponsInfo.phase,
        graduated: ponsInfo.graduated,
        tokenAddress: ca,
        curveAddress: ponsInfo.curveAddress,
        creatorAddress: ponsInfo.creatorAddress,
        pairToken: ponsInfo.pairToken,
        poolFee: ponsInfo.poolFee || 10000,
        tickSpacing: ponsInfo.tickSpacing || 200,
        poolAddress: ponsInfo.poolAddress,
        poolId: ponsInfo.poolId,
        poolKey: ponsInfo.poolKey,
        route: ponsInfo.route,
        isUsdgPaired: ponsInfo.isUsdgPaired,
        isNative: ponsInfo.isNative,
        creatorTaxBps: ponsInfo.creatorTaxBps,
        address: ca,
        symbol: symbol || 'TOKEN',
        name: name || symbol || 'Token Target',
        decimals,
        priceNative: livePriceNative,
        priceUsd: livePriceUsd,
        ethPriceUsd,
      })
    }

    // ── 3. Non-Pons DEX Fallback (SushiSwap V3, DexScreener, GeckoTerminal) ──
    let priceNative = 0
    let priceUsd    = 0
    let poolFee     = caLow === '0x5fc5360d0400a0fd4f2af552add042d716f1d168' ? 500 : 10000
    let poolAddress: string | null = caLow === '0x5fc5360d0400a0fd4f2af552add042d716f1d168' ? '0x9B050cb1F265094b0977160a2BD7dA8C9E529c3C' : null
    let dexType     = 'sushiswap-v3'
    let isUsdgPaired = false
    let source      = 'not_found'

    // GeckoTerminal Token & Pools
    try {
      const gtRes = await fetch(`${GT_BASE}/networks/${GT_NET}/tokens/${caLow}`, {
        headers: { Accept: 'application/json;version=20230302' },
        cache: 'no-store',
      })
      if (gtRes.ok) {
        const gtData = await gtRes.json()
        const attrs  = gtData?.data?.attributes
        if (attrs) {
          if (!name   && attrs.name)   name   = attrs.name
          if (!symbol && attrs.symbol) symbol = attrs.symbol
          if (attrs.decimals)  decimals = Number(attrs.decimals)
          if (attrs.price_usd) priceUsd = parseFloat(attrs.price_usd) || 0

          const pools: Array<{ id: string }> = gtData?.data?.relationships?.top_pools?.data || []
          if (pools.length > 0) {
            const pAddr = pools[0].id.replace(`${GT_NET}_`, '')
            poolAddress = pAddr

            try {
              const pRes = await fetch(`${GT_BASE}/networks/${GT_NET}/pools/${pAddr}`, {
                headers: { Accept: 'application/json;version=20230302' },
                cache: 'no-store',
              })
              if (pRes.ok) {
                const pd = await pRes.json()
                const pa = pd?.data?.attributes
                const dt = pd?.data?.relationships?.dex?.data?.id
                if (dt) dexType = dt

                if (pa) {
                  const USDG_ADDR = '0x5fc5360d0400a0fd4f2af552add042d716f1d168'
                  const quoteTokenId: string = pd?.data?.relationships?.quote_token?.data?.id || ''
                  const isWethQuote = quoteTokenId.toLowerCase().includes(WETH.toLowerCase())
                  if (caLow !== USDG_ADDR.toLowerCase()) {
                    if (quoteTokenId.toLowerCase().includes(USDG_ADDR.toLowerCase()) || (pa.name?.includes('USDG') && !pa.name?.startsWith('USDG/'))) {
                      isUsdgPaired = true
                    }
                  }

                  if (isWethQuote && pa.quote_token_price_usd && parseFloat(pa.quote_token_price_usd) > 500) {
                    ethPriceUsd = parseFloat(pa.quote_token_price_usd)
                  }

                  const baseId  = pd?.data?.relationships?.base_token?.data?.id || ''
                  const isBase  = baseId.toLowerCase().includes(caLow)

                  if (isBase && pa.base_token_price_native_currency && parseFloat(pa.base_token_price_native_currency) > 0) {
                    priceNative = parseFloat(pa.base_token_price_native_currency)
                    source = 'geckoterminal'
                  } else if (!isBase && pa.quote_token_price_native_currency && parseFloat(pa.quote_token_price_native_currency) > 0) {
                    priceNative = parseFloat(pa.quote_token_price_native_currency)
                    source = 'geckoterminal'
                  }

                  if (pa.pool_fee_percentage !== undefined && pa.pool_fee_percentage !== null) {
                    poolFee = Math.round(parseFloat(pa.pool_fee_percentage) * 10000)
                  }
                }
              }
            } catch { /* ignore */ }

            if (priceNative === 0 && priceUsd > 0) {
              priceNative = priceUsd / ethPriceUsd
              source = 'geckoterminal'
            }
          }
        }
      }
    } catch { /* ignore */ }

    // DexScreener Fallback
    if (priceNative === 0) {
      try {
        const dxRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`, { cache: 'no-store' })
        if (dxRes.ok) {
          const dxData = await dxRes.json()
          const pairs  = dxData?.pairs || []
          const pair   = pairs.find((p: { chainId?: string }) => p.chainId === 'robinhood') || pairs[0]
          if (pair) {
            if (!name   && pair.baseToken?.name)   name   = pair.baseToken.name
            if (!symbol && pair.baseToken?.symbol) symbol = pair.baseToken.symbol
            const pn = parseFloat(pair.priceNative) || 0
            const pu = parseFloat(pair.priceUsd)    || 0
            if (pn > 0) { priceNative = pn; source = 'dexscreener' }
            if (pu > 0) priceUsd = pu
            if (pn > 0 && pu > 0 && pair.quoteToken?.symbol === 'WETH') ethPriceUsd = pu / pn
            if (pair.pairAddress) poolAddress = pair.pairAddress
          }
        }
      } catch { /* ignore */ }
    }

    // Uniswap/Sushi V3 Factory query
    if (priceNative === 0) {
      const wethAddr = getAddress(WETH)
      for (const fee of FEE_TIERS) {
        try {
          const pAddr = await rpcClient.readContract({
            address:      FACTORY,
            abi:          FACTORY_ABI,
            functionName: 'getPool',
            args:         [ca, wethAddr, fee],
          })

          const ZERO = '0x0000000000000000000000000000000000000000'
          if (!pAddr || pAddr === ZERO) continue

          const [slot0Result, token0Result] = await Promise.all([
            rpcClient.readContract({ address: pAddr, abi: POOL_ABI, functionName: 'slot0' }),
            rpcClient.readContract({ address: pAddr, abi: POOL_ABI, functionName: 'token0' }),
          ])

          const sqrtPriceX96 = slot0Result[0]
          const tick = slot0Result[1]
          if (sqrtPriceX96 === 0n) continue

          const isTokenToken0 = token0Result.toLowerCase() === ca.toLowerCase()
          const calcPrice = tickToNative(Number(tick), isTokenToken0, decimals)

          if (calcPrice > 0) {
            priceNative = calcPrice
            priceUsd    = priceNative * ethPriceUsd
            poolFee     = fee
            poolAddress = pAddr
            source      = 'onchain_v3'
            break
          }
        } catch { /* continue */ }
      }
    }

    // Universal Fallback for Valid ERC-20 Tokens
    if (priceNative === 0 && symbol && symbol !== 'TOKEN') {
      priceNative = 0.000000001
      priceUsd    = priceNative * ethPriceUsd
      dexType     = 'sushiswap-v3'
      source      = 'fallback_erc20'
    }

    return NextResponse.json({
      address: ca,
      symbol: symbol || 'TOKEN',
      name: name || symbol || 'Token Target',
      decimals,
      priceNative,
      priceUsd,
      ethPriceUsd,
      poolFee,
      poolAddress,
      dexType,
      isUsdgPaired,
      source,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
