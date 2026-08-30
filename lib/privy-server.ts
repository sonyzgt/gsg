import { getAddress, isAddress, toHex } from 'viem'
import { toAccount, type LocalAccount } from 'viem/accounts'
import path from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { PrivyClient, User as PrivyUser } from '@privy-io/server-auth'

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || ''
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET || ''
const PRIVY_AUTHORIZATION_KEY = process.env.PRIVY_AUTHORIZATION_KEY || ''
const BOT_USERS_FILE = path.join(process.cwd(), 'data', 'bot_users.json')

let privyClientInstance: PrivyClient | null = null

export function getPrivyClient(): PrivyClient | null {
  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) return null
  if (!privyClientInstance) {
    if (PRIVY_AUTHORIZATION_KEY) {
      privyClientInstance = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET, {
        walletApi: {
          authorizationPrivateKey: PRIVY_AUTHORIZATION_KEY,
        },
      })
    } else {
      privyClientInstance = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET)
    }
  }
  return privyClientInstance
}

export interface TwitterUserWalletMapping {
  twitterUserId: string
  twitterUsername: string
  ponscoreUserId?: string
  privyUserId: string
  walletId: string
  walletAddress: `0x${string}`
  createdAt?: number
}

/**
 * Creates a native Viem Custom Account bound directly to Privy Server Wallet signing.
 */
export function createPrivyViemAccount(walletId: string, address: `0x${string}`, privy: PrivyClient): any {
  return toAccount({
    address,
    signMessage: async ({ message }: any) => {
      const msg = typeof message === 'string' ? message : (typeof message?.raw === 'string' ? Uint8Array.from(Buffer.from(message.raw.slice(2), 'hex')) : message?.raw || '')
      const res = await (privy as any).walletApi.ethereum.signMessage({ walletId, message: msg })
      return res.signature
    },
    signTransaction: async (tx: any) => {
      const formattedTx: any = {
        to: tx.to ?? undefined,
        nonce: tx.nonce,
        chainId: tx.chainId,
        data: tx.data,
        value: tx.value ? `0x${tx.value.toString(16)}` : undefined,
        gasLimit: tx.gas ? `0x${tx.gas.toString(16)}` : undefined,
        gasPrice: tx.gasPrice ? `0x${tx.gasPrice.toString(16)}` : undefined,
        maxFeePerGas: tx.maxFeePerGas ? `0x${tx.maxFeePerGas.toString(16)}` : undefined,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? `0x${tx.maxPriorityFeePerGas.toString(16)}` : undefined,
      }
      const res = await (privy as any).walletApi.ethereum.signTransaction({ walletId, transaction: formattedTx })
      return res.signedTransaction
    },
    signTypedData: async (typedData: any) => {
      const res = await (privy as any).walletApi.ethereum.signTypedData({
        walletId,
        typedData: {
          domain: typedData.domain,
          message: typedData.message,
          primaryType: typedData.primaryType,
          types: typedData.types,
        },
      })
      return res.signature
    },
  })
}

// In-memory mutex to prevent race conditions / duplicate wallet creation for the same Twitter ID
const pendingResolutions = new Map<string, Promise<TwitterUserWalletMapping | null>>()

async function loadLocalMappings(): Promise<TwitterUserWalletMapping[]> {
  try {
    if (!existsSync(BOT_USERS_FILE)) return []
    const raw = await readFile(BOT_USERS_FILE, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

async function saveLocalMapping(mapping: TwitterUserWalletMapping) {
  try {
    await mkdir(path.dirname(BOT_USERS_FILE), { recursive: true })
    const list = await loadLocalMappings()
    const index = list.findIndex(
      (u: any) => (mapping.twitterUserId && u.twitterId === mapping.twitterUserId) ||
                  (mapping.twitterUsername && u.twitterHandle?.toLowerCase() === mapping.twitterUsername.toLowerCase())
    )

    const record = {
      twitterId: mapping.twitterUserId,
      twitterHandle: mapping.twitterUsername,
      name: mapping.twitterUsername,
      ponscoreUserId: mapping.ponscoreUserId || `user_${mapping.twitterUserId}`,
      privyUserId: mapping.privyUserId,
      privyWalletAddress: mapping.walletAddress,
      walletAddress: mapping.walletAddress,
      walletId: mapping.walletId || '',
      createdAt: mapping.createdAt || Date.now(),
    }

    if (index >= 0) {
      list[index] = { ...list[index], ...record }
    } else {
      list.push(record as any)
    }

    await writeFile(BOT_USERS_FILE, JSON.stringify(list, null, 2))
  } catch (err) {
    console.error('[Privy Server] Failed to save mapping to DB:', err)
  }
}

/**
 * 🌟 BANKR-STYLE PRIVY IDENTITY RESOLUTION:
 * 1. Check local DB mapping (Twitter ID -> Privy User Wallet)
 * 2. If not found locally, query Privy Cloud Users by Twitter Subject ID
 * 3. Extract exact Privy user wallet & wallet ID
 * 4. If brand new user, create official Privy Server Wallet
 */
export async function getOrCreateTwitterUserWallet(
  twitterUserId: string,
  twitterUsername: string
): Promise<TwitterUserWalletMapping | null> {
  const cleanHandle = twitterUsername.replace('@', '').toLowerCase().trim()
  const cleanId = twitterUserId || `tw_${cleanHandle}`

  // Mutex lock to prevent duplicate creation on concurrent tweets
  const lockKey = cleanId
  if (pendingResolutions.has(lockKey)) {
    return pendingResolutions.get(lockKey)!
  }

  const resolutionPromise = (async () => {
    const privy = getPrivyClient()
    if (!privy) {
      console.warn('[Privy Server] Privy client not configured')
      return null
    }

    // 1. Check local DB first for existing mapping
    const localList = await loadLocalMappings()
    const existingLocal = localList.find(
      (u: any) => (cleanId && u.twitterId === cleanId) ||
                  (cleanHandle && u.twitterHandle?.toLowerCase() === cleanHandle)
    )

    if (existingLocal && existingLocal.walletAddress && existingLocal.walletId) {
      // Test if this wallet can be signed via Server Wallet API
      let canSign = false
      try {
        const testSign = await privy.walletApi.ethereum.signMessage({
          walletId: existingLocal.walletId,
          message: 'verify_signer',
        })
        if (testSign?.signature) {
          canSign = true
        }
      } catch {
        canSign = false
      }

      if (canSign) {
        return {
          twitterUserId: (existingLocal as any).twitterId || cleanId,
          twitterUsername: (existingLocal as any).twitterHandle || cleanHandle,
          ponscoreUserId: existingLocal.ponscoreUserId || `user_${cleanId}`,
          privyUserId: existingLocal.privyUserId || '',
          walletId: existingLocal.walletId,
          walletAddress: getAddress(existingLocal.walletAddress),
        }
      } else {
        console.log(`[Twitter Agent] Existing wallet ${existingLocal.walletAddress} is an embedded client wallet. Generating authorized Privy Server Wallet for server execution...`)
      }
    }

    try {
      // 2. Create or assign an authorized Privy Server Wallet
      console.log(`[Twitter Agent] Creating official Privy Server Wallet for @${cleanHandle} (Twitter ID: ${cleanId})...`)
      const serverWallet = await privy.walletApi.create({
        chainType: 'ethereum',
      })

      if (serverWallet?.address && serverWallet?.id) {
        const mapping: TwitterUserWalletMapping = {
          twitterUserId: cleanId,
          twitterUsername: cleanHandle,
          ponscoreUserId: `user_${cleanId}`,
          privyUserId: `did:privy:${serverWallet.id}`,
          walletId: serverWallet.id,
          walletAddress: getAddress(serverWallet.address),
          createdAt: Date.now(),
        }

        await saveLocalMapping(mapping)
        console.log(`[Twitter Agent] Successfully created & assigned Privy Server Wallet ${serverWallet.address} (Wallet ID: ${serverWallet.id}) for @${cleanHandle}`)
        return mapping
      }
    } catch (err) {
      console.error('[Twitter Agent] Resolution error in getOrCreateTwitterUserWallet:', err)
    }

    return null
  })()

  pendingResolutions.set(lockKey, resolutionPromise)
  try {
    return await resolutionPromise
  } finally {
    pendingResolutions.delete(lockKey)
  }
}
