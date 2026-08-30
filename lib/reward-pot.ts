import { createPublicClient, http, formatEther, isAddress, getAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { robinhoodChain } from '@/lib/chains'

export interface RewardPotInfo {
  potAddress: `0x${string}` | null
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
 * Queries real-time on-chain balance of the Prize Pot wallet on Robinhood Chain
 */
export async function getRewardPotInfo(): Promise<RewardPotInfo> {
  const potAddress = getRewardPotAddress()

  if (!potAddress) {
    return {
      potAddress: null,
      balanceEth: 0,
      balanceEthFormatted: '0.0000',
      balanceUsd: 0,
      isConfigured: false,
    }
  }

  try {
    const rawBalance = await client.getBalance({ address: potAddress })
    const ethNum = parseFloat(formatEther(rawBalance))
    const usdNum = ethNum * DEFAULT_ETH_USD

    return {
      potAddress,
      balanceEth: ethNum,
      balanceEthFormatted: ethNum >= 1 ? ethNum.toLocaleString(undefined, { maximumFractionDigits: 4 }) : ethNum.toFixed(4),
      balanceUsd: usdNum,
      isConfigured: true,
    }
  } catch (err) {
    console.error('[Reward Pot] Error fetching pot balance:', err)
    return {
      potAddress,
      balanceEth: 0,
      balanceEthFormatted: '0.0000',
      balanceUsd: 0,
      isConfigured: true,
    }
  }
}
