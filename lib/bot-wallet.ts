import crypto from 'crypto'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { readFile, writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { isAddress, getAddress, createPublicClient, http, formatEther, parseEther } from 'viem'
import { robinhoodChain } from '@/lib/chains'

const BOT_USERS_FILE = path.join(process.cwd(), 'data', 'bot_users.json')
const ENCRYPTION_KEY = process.env.BOT_ENCRYPTION_KEY || 'ponscore_bot_super_secret_key_32_bytes_len!!'

export interface BotUser {
  twitterId: string
  twitterHandle: string
  name: string
  profileImage?: string
  privyUserId?: string
  privyWalletAddress?: `0x${string}`
  walletAddress: `0x${string}` // Dedicated execution sub-wallet
  encryptedPrivateKey: string
  iv: string
  tag: string
  createdAt: number
  totalLaunches: number
}

export function encryptPrivateKey(privateKey: string): { encrypted: string; iv: string; tag: string } {
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  
  let encrypted = cipher.update(privateKey, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag().toString('hex')

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag,
  }
}

export function decryptPrivateKey(encryptedHex: string, ivHex: string, tagHex: string): `0x${string}` {
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted as `0x${string}`
}

export async function getBotUsers(): Promise<BotUser[]> {
  try {
    const raw = await readFile(BOT_USERS_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
  } catch {
    try {
      await mkdir(path.dirname(BOT_USERS_FILE), { recursive: true })
      await writeFile(BOT_USERS_FILE, JSON.stringify([], null, 2))
    } catch { /* ignore */ }
  }
  return []
}

export async function saveBotUsers(users: BotUser[]): Promise<void> {
  try {
    await mkdir(path.dirname(BOT_USERS_FILE), { recursive: true })
    await writeFile(BOT_USERS_FILE, JSON.stringify(users, null, 2))
  } catch (err) {
    console.error('Failed to save bot users:', err)
  }
}

export async function getOrCreateBotUser({
  twitterId,
  twitterHandle,
  name = '',
  profileImage = '',
  privyUserId = '',
  privyWalletAddress = '',
}: {
  twitterId: string
  twitterHandle: string
  name?: string
  profileImage?: string
  privyUserId?: string
  privyWalletAddress?: string
}): Promise<BotUser> {
  const cleanHandle = twitterHandle.replace('@', '').toLowerCase()
  const users = await getBotUsers()
  
  const existing = users.find(u => 
    u.twitterId === twitterId || 
    u.twitterHandle.toLowerCase() === cleanHandle ||
    (privyUserId && u.privyUserId === privyUserId)
  )

  if (existing) {
    if (name && existing.name !== name) existing.name = name
    if (profileImage && existing.profileImage !== profileImage) existing.profileImage = profileImage
    if (privyUserId) existing.privyUserId = privyUserId
    if (privyWalletAddress && isAddress(privyWalletAddress)) {
      existing.privyWalletAddress = getAddress(privyWalletAddress) as `0x${string}`
    }
    existing.twitterHandle = cleanHandle
    await saveBotUsers(users)
    return existing
  }

  const privateKey = generatePrivateKey()
  const account = privateKeyToAccount(privateKey)
  const { encrypted, iv, tag } = encryptPrivateKey(privateKey)

  const newUser: BotUser = {
    twitterId,
    twitterHandle: cleanHandle,
    name: name || cleanHandle,
    profileImage,
    privyUserId,
    privyWalletAddress: privyWalletAddress && isAddress(privyWalletAddress) ? (getAddress(privyWalletAddress) as `0x${string}`) : undefined,
    walletAddress: account.address,
    encryptedPrivateKey: encrypted,
    iv,
    tag,
    createdAt: Date.now(),
    totalLaunches: 0,
  }

  users.push(newUser)
  await saveBotUsers(users)
  return newUser
}

export async function getBotUserBalance(walletAddress: string): Promise<string> {
  try {
    const client = createPublicClient({
      chain: robinhoodChain,
      transport: http('https://robinhood-rpc.publicnode.com'),
    })
    const bal = await client.getBalance({ address: getAddress(walletAddress) })
    return formatEther(bal)
  } catch {
    return '0.0'
  }
}
