import { NextRequest, NextResponse } from 'next/server'
import { isAddress, createPublicClient, http, erc20Abi, formatUnits, getAddress } from 'viem'
import { robinhoodChain } from '@/lib/chains'
import { getCachedPrice, setCachedPrice } from '@/lib/priceCache'
import { getPonsTokenInfo } from '@/lib/pons-v2'

export const dynamic = 'force-dynamic'

const client = createPublicClient({
  chain: robinhoodChain,
  transport: http('https://robinhood-rpc.publicnode.com'),
})

export interface TokenHolding {
  address: string
  name: string
  symbol: string
  decimals: number
  balanceRaw: string
  balanceFormatted: string
  balanceNumber: number
  usdPrice: number
  valueUsd: number
  icon: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userAddress, tokenAddresses } = body

    if (!userAddress || !isAddress(userAddress)) {
      return NextResponse.json({ error: 'User address tidak valid' }, { status: 400 })
    }

    const cleanUserAddr = getAddress(userAddress)
    const discoveredSet = new Set<string>()

    // 1. Auto-discover all tokens held by the user from Blockscout Token Balances API
    try {
      const blockscoutUrl = `https://robinhoodchain.blockscout.com/api/v2/addresses/${cleanUserAddr}/token-balances`
      const bsRes = await fetch(blockscoutUrl, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
      if (bsRes.ok) {
        const items = await bsRes.json()
        if (Array.isArray(items)) {
          for (const item of items) {
            const addr = item?.token?.address_hash || item?.token?.address
            if (addr && isAddress(addr)) {
              discoveredSet.add(getAddress(addr))
            }
          }
        }
      }
    } catch { /* ignore */ }

    // 2. Auto-discover platform launched tokens from registry
    try {
      const { readFile } = await import('fs/promises')
      const path = await import('path')
      const regFile = path.join(process.cwd(), 'data', 'launched_tokens.json')
      const rawReg = await readFile(regFile, 'utf-8')
      const regTokens = JSON.parse(rawReg)
      if (Array.isArray(regTokens)) {
        for (const t of regTokens) {
          if (isAddress(t)) discoveredSet.add(getAddress(t))
        }
      }
    } catch { /* ignore */ }

    // 3. Also include explicitly requested tokens (e.g. from local storage or newly swapped)
    if (Array.isArray(tokenAddresses)) {
      for (const t of tokenAddresses) {
        if (t && isAddress(t)) {
          discoveredSet.add(getAddress(t))
        }
      }
    }

    const addressesToFetch: `0x${string}`[] = Array.from(discoveredSet) as `0x${string}`[]
    const holdings: TokenHolding[] = []

    for (const tokenAddr of addressesToFetch) {
      try {
        // 4. Baca data saldo on-chain langsung via RPC untuk akurasi mutlak
        const [rawBalance, decimals, onChainName, onChainSymbol] = await Promise.all([
          client.readContract({
            address: tokenAddr,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [cleanUserAddr],
          }).catch(() => BigInt(0)),
          client.readContract({
            address: tokenAddr,
            abi: erc20Abi,
            functionName: 'decimals',
          }).catch(() => 18),
          client.readContract({
            address: tokenAddr,
            abi: erc20Abi,
            functionName: 'name',
          }).catch(() => 'Robinhood Token'),
          client.readContract({
            address: tokenAddr,
            abi: erc20Abi,
            functionName: 'symbol',
          }).catch(() => 'TOKEN'),
        ])

        const dec = Number(decimals) || 18
        const formatted = formatUnits(rawBalance, dec)
        const balanceNum = parseFloat(formatted) || 0

        // HANYA simpan token jika saldonya > 0
        if (rawBalance === 0n || balanceNum <= 0) {
          continue
        }

        // 4. Ambil harga dari Cache / Pons V2 Resolver / GeckoTerminal / DexScreener
        let tokenName = onChainName
        let tokenSymbol = onChainSymbol
        let usdPrice = 0
        let priceNative = 0

        const cached = getCachedPrice(tokenAddr)
        if (cached) {
          usdPrice = cached.priceUsd
          priceNative = cached.priceNative
          if (cached.name) tokenName = cached.name
          if (cached.symbol) tokenSymbol = cached.symbol
        } else {
          // Check Pons V2 first
          const ponsInfo = await getPonsTokenInfo(tokenAddr).catch(() => null)
          if (ponsInfo && ponsInfo.priceUsd > 0) {
            usdPrice = ponsInfo.priceUsd
            priceNative = ponsInfo.priceNative
          }

          if (usdPrice === 0) {
            try {
              const gtRes = await fetch(`https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/${tokenAddr.toLowerCase()}`, {
                headers: { Accept: 'application/json;version=20230302' },
                cache: 'no-store',
              })
              if (gtRes.ok) {
                const gtData = await gtRes.json()
                const attrs = gtData?.data?.attributes
                if (attrs) {
                  if (attrs.name) tokenName = attrs.name
                  if (attrs.symbol) tokenSymbol = attrs.symbol
                  if (attrs.price_usd) usdPrice = parseFloat(attrs.price_usd) || 0
                }
              }
            } catch { /* ignore */ }
          }

          if (usdPrice === 0) {
            try {
              const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddr}`, {
                cache: 'no-store',
              })
              if (dexRes.ok) {
                const dexData = await dexRes.json()
                const pairs = dexData?.pairs || []
                const pair = pairs.find((p: { chainId?: string }) => p.chainId === 'robinhood') || pairs[0]
                if (pair) {
                  if (!tokenName && pair.baseToken?.name) tokenName = pair.baseToken.name
                  if (!tokenSymbol && pair.baseToken?.symbol) tokenSymbol = pair.baseToken.symbol
                  usdPrice = parseFloat(pair.priceUsd) || 0
                }
              }
            } catch { /* ignore */ }
          }

          if (usdPrice > 0) {
            setCachedPrice(tokenAddr, {
              priceUsd: usdPrice,
              priceNative: priceNative || usdPrice / 2500,
              name: tokenName,
              symbol: tokenSymbol,
              decimals: dec,
            })
          }
        }

        const valueUsd = balanceNum * usdPrice

        holdings.push({
          address: tokenAddr,
          name: tokenName,
          symbol: tokenSymbol,
          decimals: dec,
          balanceRaw: rawBalance.toString(),
          balanceFormatted: balanceNum.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: balanceNum < 1 ? 6 : 2,
          }),
          balanceNumber: balanceNum,
          usdPrice,
          valueUsd,
          icon: '/logo.svg',
        })
      } catch (e: unknown) {
        console.error(`Error fetching token ${tokenAddr}:`, e)
      }
    }

    // Sort by USD value descending
    holdings.sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0))

    return NextResponse.json({ holdings })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gagal'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
