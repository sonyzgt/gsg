import {
  createPublicClient,
  http,
  getAddress,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  parseAbi,
  zeroAddress,
  formatEther,
  toHex,
} from 'viem'
import { robinhoodChain } from './chains'

// ── Contract Addresses on Robinhood Chain (4663) ─────────────────────────────
export const PONS_V2_FACTORY      = '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e' as `0x${string}`
export const LAUNCH_AND_BUY_ROUTER = '0xe33E9E479dF8802cb0866d5d05258bEc4cF62948' as `0x${string}`
export const FEE_ESCROW           = '0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e' as `0x${string}`
export const BUYBACK_VAULT        = '0x42df2a798f82289E177311362e8f5ccC45c1219c' as `0x${string}`
export const MEME_HOOK            = '0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044' as `0x${string}`
export const LAUNCH_DEPLOYER      = '0x3711ceA4feaDE896C913C68F01Eda97Cb06D1A42' as `0x${string}`
export const GRADUATION_EXECUTOR  = '0xC7819B64A1dAECD7eC19856d026cb14EfBd89046' as `0x${string}`
export const GRADUATION_GUARD     = '0xf5695117b99B6f6401e67d4195BD653628176C6C' as `0x${string}`

export const WETH                 = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73' as `0x${string}`
export const USDG                 = '0x5fc5360d0400a0fd4f2af552add042d716f1d168' as `0x${string}`
export const WETH_USDG_POOL       = '0x52e65b17fb6e5ba00ed806f37afcd2daa50271ca' as `0x${string}`

// ── ABIs ─────────────────────────────────────────────────────────────────────
export const FACTORY_ABI = parseAbi([
  'struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }',
  'struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }',
  'struct LaunchConfig { uint256 supply; uint256 curveFeeBps; uint256 phantomQuote; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; bool enabled; }',
  'struct LaunchedToken { address token; address curve; address deployer; address creatorFeeRecipient; address pairToken; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; uint16 creatorTaxBps; bool buybackEnabled; uint8 phase; uint256 sweptQuote; uint256 sweptTokens; uint256 sweptAt; bool exists; }',
  'function launchToken(TokenParams params, uint256 launchConfigId, address pairToken) payable returns (address token, address curve)',
  'function launchToken(TokenParams params, uint256 launchConfigId, address pairToken, address[] snipeTaxExemptions) payable returns (address token, address curve)',
  'function previewLaunchEconomics(uint256 launchConfigId, address pairToken) view returns (bytes32)',
  'function launchFee() view returns (uint256)',
  'function launchConfigCount() view returns (uint256)',
  'function getLaunchConfig(uint256 id) view returns (LaunchConfig)',
  'function canLaunch(address caller) view returns (bool)',
  'function maxCreatorTaxBps() view returns (uint16)',
  'function getLaunchedToken(address token) view returns (LaunchedToken)',
  'function approvedPairTokens(address pairToken) view returns (bool)',
  'function pairTokenEconomics(address pairToken) view returns (uint256 phantomQuote, uint256 graduationThreshold, uint8 decimals)',
  'event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)',
])

export const LAUNCH_AND_BUY_ABI = parseAbi([
  'struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }',
  'struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }',
  'function launchAndBuy(TokenParams params, uint256 launchConfigId, address pairToken, uint256 quoteIn, uint256 minTokensOut, address recipient, address[] snipeTaxExemptions) payable returns (address token, address curve, uint256 tokensOut)',
])

export const PONS_CURVE_ABI = parseAbi([
  'function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) payable returns (uint256 tokensOut)',
  'function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) returns (uint256 quoteOut)',
  'function isNativeQuote() view returns (bool)',
  'function pairToken() view returns (address)',
  'function getReserves() view returns (uint256 quoteReserve, uint256 tokenReserve)',
  'function realQuoteReserve() view returns (uint256)',
  'function graduationThreshold() view returns (uint256)',
  'function sellableTokens() view returns (uint256)',
  'function reservedTokens() view returns (uint256)',
  'function readyToGraduate() view returns (bool)',
  'function graduated() view returns (bool)',
  'function feeBps() view returns (uint256)',
  'function creatorTaxBps() view returns (uint256)',
  'function currentSnipeTaxBps(address recipient) view returns (uint256)',
  'event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)',
  'event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)',
  'event CurveBuyRefunded(address indexed buyer, uint256 quoteRefunded)',
  'event CurveCompleted(uint256 sweptQuote, uint256 sweptTokens)',
])

export const FEE_ESCROW_ABI = parseAbi([
  'function balanceOf(address recipient) view returns (uint256)',
  'function balanceOfToken(address recipient, address token) view returns (uint256)',
  'function claim()',
  'function claimToken(address token)',
  'event Credited(address indexed recipient, uint256 amount)',
  'event Claimed(address indexed recipient, uint256 amount)',
  'event CreditedToken(address indexed recipient, address indexed token, uint256 amount)',
  'event ClaimedToken(address indexed recipient, address indexed token, uint256 amount)',
])

export const TOKEN_METADATA_ABI = parseAbi([
  'struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }',
  'function getTokenInfo() view returns (address tokenDeployer, string tokenLogo, string tokenDescription, Socials tokenSocials)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
])

export const rpcClient = createPublicClient({
  chain: robinhoodChain,
  transport: http('https://robinhood-rpc.publicnode.com'),
})

// Fallback client using Pocket Network / official
export const rpcClientFallback = createPublicClient({
  chain: robinhoodChain,
  transport: http('https://robinhood.api.pocket.network'),
})

// ── Types ────────────────────────────────────────────────────────────────────
export interface LaunchConfigData {
  id: bigint
  supply: bigint
  curveFeeBps: bigint
  phantomQuote: bigint
  graduationThreshold: bigint
  poolFee: number
  tickSpacing: number
  enabled: boolean
}

export interface PonsV2PoolKey {
  currency0: `0x${string}`
  currency1: `0x${string}`
  fee: number
  tickSpacing: number
  hooks: `0x${string}`
}

export interface SocialLinks {
  twitter: string
  telegram: string
  discord: string
  website: string
  farcaster: string
}

export const staticMetadataCache = new Map<
  string,
  { name: string; symbol: string; logo: string; description: string; socials: SocialLinks }
>()

export interface PonsV2TokenInfo {
  tokenAddress: `0x${string}`
  name: string
  symbol: string
  logo: string
  description: string
  socials: SocialLinks
  dexType: 'pons-v2'
  phase: number // 0 = NotGraduated (bonding curve), 1 = Swept (transition), 2 = PoolCreated (Uniswap V4), 3 = Rescued
  curveAddress: `0x${string}`
  creatorAddress: `0x${string}`
  pairToken: `0x${string}`
  poolFee: number
  tickSpacing: number
  creatorTaxBps: number
  graduationThreshold: string
  realQuoteReserve: string
  quoteReserve: string
  tokenReserve: string
  sellableTokens: string
  readyToGraduate: boolean
  graduated: boolean
  poolAddress: `0x${string}` | null
  poolId: `0x${string}` | null
  poolKey: PonsV2PoolKey | null
  route: 'BONDING_CURVE' | 'UNISWAP_V4' | 'TRANSITION' | 'RESCUED'
  isUsdgPaired: boolean
  isNative: boolean
  priceNative: number
  priceUsd: number
  progress: number // 0.0 to 1.0 (graduation progress)
}

/**
 * Derives Uniswap V4 PoolKey with strictly sorted currency0 < currency1
 */
export function getPonsV2PoolKey(
  tokenA: string,
  tokenB: string,
  poolFee: number,
  tickSpacing: number,
  hooks: string = MEME_HOOK
): PonsV2PoolKey {
  const addrA = getAddress(tokenA)
  const addrB = getAddress(tokenB)
  const isLower = addrA.toLowerCase() < addrB.toLowerCase()

  return {
    currency0: isLower ? addrA : addrB,
    currency1: isLower ? addrB : addrA,
    fee: poolFee,
    tickSpacing: tickSpacing,
    hooks: getAddress(hooks),
  }
}

/**
 * Derives Uniswap V4 PoolId = keccak256(abi.encode(poolKey))
 */
export function getPonsV2PoolId(poolKey: PonsV2PoolKey): `0x${string}` {
  const encoded = encodeAbiParameters(
    parseAbiParameters('address, address, uint24, int24, address'),
    [
      poolKey.currency0,
      poolKey.currency1,
      poolKey.fee,
      poolKey.tickSpacing,
      poolKey.hooks,
    ]
  )
  return keccak256(encoded)
}

/**
 * Fetch available launch configs from Factory
 */
export async function getOpenLaunchConfigs(): Promise<LaunchConfigData[]> {
  try {
    const count = await rpcClient.readContract({
      address: PONS_V2_FACTORY,
      abi: FACTORY_ABI,
      functionName: 'launchConfigCount',
    })

    const configs = await Promise.all(
      Array.from({ length: Number(count) }, async (_, id) => {
        const conf = await rpcClient.readContract({
          address: PONS_V2_FACTORY,
          abi: FACTORY_ABI,
          functionName: 'getLaunchConfig',
          args: [BigInt(id)],
        })
        return {
          id: BigInt(id),
          supply: conf.supply,
          curveFeeBps: conf.curveFeeBps,
          phantomQuote: conf.phantomQuote,
          graduationThreshold: conf.graduationThreshold,
          poolFee: Number(conf.poolFee),
          tickSpacing: Number(conf.tickSpacing),
          enabled: conf.enabled,
        }
      })
    )

    return configs.filter((c) => c.enabled)
  } catch (err) {
    console.error('[PONS V2] Failed to fetch launch configs:', err)
    // Fallback default config
    return [
      {
        id: 0n,
        supply: 1_000_000_000n * 10n ** 18n,
        curveFeeBps: 100n,
        phantomQuote: 2500000000000000000n,
        graduationThreshold: 5000000000000000000n,
        poolFee: 0,
        tickSpacing: 60,
        enabled: true,
      },
    ]
  }
}

/**
 * Preview economics hash from factory — try official RPC first, then fallback
 */
export async function getPreviewLaunchEconomics(
  launchConfigId: bigint = 0n,
  pairToken: `0x${string}` = zeroAddress
): Promise<`0x${string}`> {
  const args = [launchConfigId, pairToken] as const
  for (const client of [rpcClient, rpcClientFallback]) {
    try {
      const hash = await client.readContract({
        address: PONS_V2_FACTORY,
        abi: FACTORY_ABI,
        functionName: 'previewLaunchEconomics',
        args,
      })
      if (hash) return hash as `0x${string}`
    } catch { /* try next */ }
  }
  console.warn('[PONS V2] Failed previewLaunchEconomics, using verified fallback')
  return '0xa9fc75d4203a33fe660e8fa32c74c3aa41c1fda4bf23d3a39b6bc22a1f8b1ca7'
}

/**
 * Fetch required launch fee (in wei) — MUST be exact, not estimated
 */
export async function getLaunchFee(): Promise<bigint> {
  for (const client of [rpcClient, rpcClientFallback]) {
    try {
      const fee = await client.readContract({
        address: PONS_V2_FACTORY,
        abi: FACTORY_ABI,
        functionName: 'launchFee',
      })
      if (fee > 0n) return fee
    } catch { /* try next */ }
  }
  return 500000000000000n // 0.0005 ETH fallback
}

/**
 * Check if an address is allowed to launch tokens
 * v2 is currently whitelist-only — always check before attempting launch
 */
export async function canLaunch(callerAddress: string): Promise<boolean> {
  if (!callerAddress) return false
  for (const client of [rpcClient, rpcClientFallback]) {
    try {
      const allowed = await client.readContract({
        address: PONS_V2_FACTORY,
        abi: FACTORY_ABI,
        functionName: 'canLaunch',
        args: [getAddress(callerAddress)],
      })
      return !!allowed
    } catch { /* try next */ }
  }
  // If we can't reach the RPC, assume allowed and let the contract reject
  return true
}

/**
 * Generate a random 32-byte salt
 */
export function generateRandomSalt(): `0x${string}` {
  if (typeof window !== 'undefined' && window.crypto) {
    return toHex(window.crypto.getRandomValues(new Uint8Array(32)))
  }
  const array = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    array[i] = Math.floor(Math.random() * 256)
  }
  return toHex(array)
}

/**
 * Check creator claimable fee balance in ETH from Fee Escrow
 */
export async function getCreatorClaimableEth(creatorAddress: string): Promise<bigint> {
  if (!creatorAddress) return 0n
  try {
    const bal = await rpcClient.readContract({
      address: FEE_ESCROW,
      abi: FEE_ESCROW_ABI,
      functionName: 'balanceOf',
      args: [getAddress(creatorAddress)],
    })
    return bal
  } catch {
    return 0n
  }
}

/**
 * Resolves comprehensive Pons V2 Token Info directly on-chain
 */
export async function getPonsTokenInfo(tokenAddress: string): Promise<PonsV2TokenInfo | null> {
  try {
    const cleanToken = getAddress(tokenAddress)

    const launched = await rpcClient.readContract({
      address: PONS_V2_FACTORY,
      abi: FACTORY_ABI,
      functionName: 'getLaunchedToken',
      args: [cleanToken],
    }).catch(() => null)

    if (
      !launched ||
      !launched.exists ||
      !launched.curve ||
      launched.curve === zeroAddress ||
      launched.curve === '0x0000000000000000000000000000000000000000'
    ) {
      return null
    }

    const token = getAddress(launched.token)
    const curveAddress = getAddress(launched.curve)
    const creatorAddress = getAddress(launched.deployer)
    const pairToken = getAddress(launched.pairToken)
    const poolFee = Number(launched.poolFee)
    const tickSpacing = Number(launched.tickSpacing)
    const creatorTaxBps = Number(launched.creatorTaxBps)
    const phase = Number(launched.phase)
    const graduationThreshold = launched.graduationThreshold.toString()

    const isNative = pairToken === zeroAddress || pairToken === '0x0000000000000000000000000000000000000000'
    const isUsdgPaired = pairToken.toLowerCase() === USDG.toLowerCase()

    let poolAddress: `0x${string}` | null = null
    let poolId: `0x${string}` | null = null
    let poolKey: PonsV2PoolKey | null = null
    let route: 'BONDING_CURVE' | 'UNISWAP_V4' | 'TRANSITION' | 'RESCUED' = 'BONDING_CURVE'

    if (phase === 0) {
      route = 'BONDING_CURVE'
    } else if (phase === 2) {
      route = 'UNISWAP_V4'
      const pair = isNative ? WETH : pairToken
      poolKey = getPonsV2PoolKey(token, pair, poolFee, tickSpacing, MEME_HOOK)
      poolId = getPonsV2PoolId(poolKey)
      poolAddress = poolId
    } else if (phase === 1) {
      route = 'TRANSITION'
    } else if (phase === 3) {
      route = 'RESCUED'
    }

    // Static metadata cache (token name, symbol, logo, socials never change after deployment)
    let name = 'Pons Token'
    let symbol = 'TOKEN'
    let logo = '/logo.svg'
    let description = ''
    let socials: SocialLinks = { twitter: '', telegram: '', discord: '', website: '', farcaster: '' }

    const cachedMeta = staticMetadataCache.get(token.toLowerCase())
    if (cachedMeta) {
      name = cachedMeta.name
      symbol = cachedMeta.symbol
      logo = cachedMeta.logo
      description = cachedMeta.description
      socials = cachedMeta.socials
    } else {
      try {
        const [nameRes, symbolRes, infoRes] = await Promise.all([
          rpcClient.readContract({ address: token, abi: TOKEN_METADATA_ABI, functionName: 'name' }).catch(() => 'Pons Token'),
          rpcClient.readContract({ address: token, abi: TOKEN_METADATA_ABI, functionName: 'symbol' }).catch(() => 'TOKEN'),
          rpcClient.readContract({ address: token, abi: TOKEN_METADATA_ABI, functionName: 'getTokenInfo' }).catch(() => null),
        ])
        name = nameRes
        symbol = symbolRes
        if (infoRes) {
          if (infoRes[1]) logo = infoRes[1]
          if (infoRes[2]) description = infoRes[2]
          if (infoRes[3]) {
            socials = {
              twitter: infoRes[3].twitter || '',
              telegram: infoRes[3].telegram || '',
              discord: infoRes[3].discord || '',
              website: infoRes[3].website || '',
              farcaster: infoRes[3].farcaster || '',
            }
          }
        }
        staticMetadataCache.set(token.toLowerCase(), { name, symbol, logo, description, socials })
      } catch { /* ignore */ }
    }

    // Read price and curve state from bonding curve
    let priceNative = 0
    let priceUsd = 0
    const ethPriceUsd = 2500
    let quoteResStr = '0'
    let tokResStr = '0'
    let realQuoteResStr = '0'
    let sellableTokensStr = '0'
    let readyToGraduate = false
    let graduated = phase === 2

    try {
      const [reserves, realQuote, sellable, readyGrad, gradState] = await Promise.all([
        rpcClient.readContract({ address: curveAddress, abi: PONS_CURVE_ABI, functionName: 'getReserves' }).catch(() => null),
        rpcClient.readContract({ address: curveAddress, abi: PONS_CURVE_ABI, functionName: 'realQuoteReserve' }).catch(() => 0n),
        rpcClient.readContract({ address: curveAddress, abi: PONS_CURVE_ABI, functionName: 'sellableTokens' }).catch(() => 0n),
        rpcClient.readContract({ address: curveAddress, abi: PONS_CURVE_ABI, functionName: 'readyToGraduate' }).catch(() => false),
        rpcClient.readContract({ address: curveAddress, abi: PONS_CURVE_ABI, functionName: 'graduated' }).catch(() => false),
      ])

      if (realQuote) realQuoteResStr = realQuote.toString()
      if (sellable) sellableTokensStr = sellable.toString()
      readyToGraduate = !!readyGrad
      graduated = !!gradState || phase === 2

      if (reserves && reserves[0] > 0n && reserves[1] > 0n) {
        quoteResStr = reserves[0].toString()
        tokResStr = reserves[1].toString()

        if (isNative) {
          priceNative = Number(reserves[0]) / Number(reserves[1])
          priceUsd = priceNative * ethPriceUsd
        } else if (isUsdgPaired) {
          const quoteUsd = Number(reserves[0]) / 1e6
          const tokens = Number(reserves[1]) / 1e18
          if (tokens > 0) {
            priceUsd = quoteUsd / tokens
            priceNative = priceUsd / ethPriceUsd
          }
        } else {
          priceNative = Number(reserves[0]) / Number(reserves[1])
          priceUsd = priceNative * ethPriceUsd
        }
      }
    } catch { /* ignore */ }

    // When token has graduated to Uniswap v4, fetch live market price from DexScreener / GeckoTerminal
    if (graduated || phase === 2) {
      try {
        const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token}`, {
          headers: { 'Accept': 'application/json' },
          next: { revalidate: 15 },
        })
        if (dexRes.ok) {
          const dexData = await dexRes.json()
          if (dexData.pairs && dexData.pairs.length > 0) {
            const pair = dexData.pairs[0]
            const pNat = parseFloat(pair.priceNative || '0')
            const pUsd = parseFloat(pair.priceUsd || '0')
            if (pNat > 0) priceNative = pNat
            if (pUsd > 0) priceUsd = pUsd
          }
        }
      } catch {
        /* fallback to calculation */
      }

      if (priceNative === 0 || priceNative < 0.0000000001) {
        const threshWei = BigInt(graduationThreshold || '4200000000000000000')
        const finalGradPrice = (Number(threshWei) + 1.68e18) / 1e9 / 1e18
        priceNative = finalGradPrice > 0 ? finalGradPrice : 0.000000034
        priceUsd = priceNative * ethPriceUsd
      }
    }

    if (priceNative === 0) {
      priceNative = 0.00000000168
      priceUsd = priceNative * ethPriceUsd
    }

    // Calculate progress
    const raisedNum = parseFloat(formatEther(BigInt(realQuoteResStr)))
    const threshNum = parseFloat(formatEther(BigInt(graduationThreshold)))
    const progress = (graduated || phase === 2) ? 1.0 : (threshNum > 0 ? Math.min(1, Math.max(0, raisedNum / threshNum)) : 0)

    const info: PonsV2TokenInfo = {
      tokenAddress: token,
      name,
      symbol,
      logo,
      description,
      socials,
      dexType: 'pons-v2',
      phase,
      curveAddress,
      creatorAddress,
      pairToken,
      poolFee,
      tickSpacing,
      creatorTaxBps,
      graduationThreshold,
      realQuoteReserve: realQuoteResStr,
      quoteReserve: quoteResStr,
      tokenReserve: tokResStr,
      sellableTokens: sellableTokensStr,
      readyToGraduate,
      graduated,
      poolAddress,
      poolId,
      poolKey,
      route,
      isUsdgPaired,
      isNative,
      priceNative,
      priceUsd,
      progress,
    }

    return info
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[PONS V2] Error fetching info for ${tokenAddress}:`, msg)
    return null
  }
}
