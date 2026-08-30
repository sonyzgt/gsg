import { createPublicClient, http, formatEther, formatUnits, isAddress, getAddress, erc20Abi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { robinhoodChain } from '@/lib/chains'

export const REWARD_TOKEN_ADDRESS = '0xf3734609cAB98Cb4c23Ce7ff6D3F9bF7AeB23ce9' as `0x${string}`

export interface RewardPotInfo {
  potAddress: `0x${string}` | null
  tokenAddress: `0x${string}`
  tokenSymbol: string
  tokenName: string
  balanceTokens: number
  balanceTokensFormatted: string
  tokenPriceUsd: number
  balanceEth: number
  balanceEthFormatted: string
  balanceUsd: number
  isConfigured: boolean
}

const client = createPublicClient({
  chain: robinhoodChain,
  transport: http('https://robinhood-rpc.publicnode.com'),
})

const DEFAULT_ETH_USD = 2500

/**
 * Derives the Prize Pot wallet address from REWARD_POT_PRIVATE_KEY in .env
 */
export function getRewardPotAddress(): `0x${string}` | null {
  const rawKey = (
    process.env.REWARD_POT_PRIVATE_KEY ||
    process.env.PRIZE_POT_PRIVATE_KEY ||
    ''
  ).trim()

  if (rawKey.startsWith('0x') && rawKey.length === 66) {
    try {
      const account = privateKeyToAccount(rawKey as `0x${string}`)
      return account.address
    } catch (e) {
      console.warn('[Reward Pot] Invalid private key in env:', e)
    }
  }

  // Optional direct public address fallback
  const rawAddr = (process.env.REWARD_POT_ADDRESS || process.env.PRIZE_POT_ADDRESS || '').trim()
  if (rawAddr && isAddress(rawAddr)) {
    return getAddress(rawAddr)
  }

  return null
}

/**
 * Queries real-time on-chain balance of $PONSCORE tokens and ETH in the Prize Pot wallet
 */
export async function getRewardPotInfo(): Promise<RewardPotInfo> {
  const potAddress = getRewardPotAddress()

  if (!potAddress) {
    return {
      potAddress: null,
      tokenAddress: REWARD_TOKEN_ADDRESS,
      tokenSymbol: 'PONSCORE',
      tokenName: 'ponscore',
      balanceTokens: 0,
      balanceTokensFormatted: '0',
      tokenPriceUsd: 0.000023,
      balanceEth: 0,
      balanceEthFormatted: '0.0000',
      balanceUsd: 0,
      isConfigured: false,
    }
  }

  try {
    const [rawEthBal, rawTokenBal, tokenDecimals, name, symbol] = await Promise.all([
      client.getBalance({ address: potAddress }).catch(() => 0n),
      client.readContract({
        address: REWARD_TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [potAddress],
      }).catch(() => 0n),
      client.readContract({
        address: REWARD_TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: 'decimals',
      }).catch(() => 18),
      client.readContract({
        address: REWARD_TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: 'name',
      }).catch(() => 'ponscore'),
      client.readContract({
        address: REWARD_TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: 'symbol',
      }).catch(() => 'PONSCORE'),
    ])

    const tokenNum = parseFloat(formatUnits(rawTokenBal, Number(tokenDecimals)))
    const ethNum = parseFloat(formatEther(rawEthBal))

    // Fetch live DexScreener price for PONSCORE
    let tokenPriceUsd = 0.000023
    try {
      const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${REWARD_TOKEN_ADDRESS}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(2000),
      })
      if (dexRes.ok) {
        const dexData = await dexRes.json()
        const mainPair = dexData?.pairs?.[0]
        if (mainPair && parseFloat(mainPair.priceUsd) > 0) {
          tokenPriceUsd = parseFloat(mainPair.priceUsd)
        }
      }
    } catch {
      /* fallback */
    }

    const totalUsdValue = (tokenNum * tokenPriceUsd) + (ethNum * DEFAULT_ETH_USD)

    return {
      potAddress,
      tokenAddress: REWARD_TOKEN_ADDRESS,
      tokenSymbol: symbol || 'PONSCORE',
      tokenName: name || 'ponscore',
      balanceTokens: tokenNum,
      balanceTokensFormatted: tokenNum.toLocaleString(undefined, { maximumFractionDigits: 2 }),
      tokenPriceUsd,
      balanceEth: ethNum,
      balanceEthFormatted: ethNum.toFixed(4),
      balanceUsd: totalUsdValue,
      isConfigured: true,
    }
  } catch (err) {
    console.error('[Reward Pot] Error fetching pot balance:', err)
    return {
      potAddress,
      tokenAddress: REWARD_TOKEN_ADDRESS,
      tokenSymbol: 'PONSCORE',
      tokenName: 'ponscore',
      balanceTokens: 0,
      balanceTokensFormatted: '0',
      tokenPriceUsd: 0.000023,
      balanceEth: 0,
      balanceEthFormatted: '0.0000',
      balanceUsd: 0,
      isConfigured: true,
    }
  }
}
