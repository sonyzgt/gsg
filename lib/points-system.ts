import path from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'

const POINTS_FILE = path.join(process.cwd(), 'data', 'points_ledger.json')

export type PointActivityType = 'TOKEN_DEPLOY' | 'TWITTER_TIP' | 'BONUS'

export interface PointTransaction {
  id: string
  type: PointActivityType
  points: number
  description: string
  tokenAddress?: string
  tokenSymbol?: string
  txHash?: string
  timestamp: number
}

export interface UserPointsRecord {
  twitterHandle: string
  twitterUserId?: string
  walletAddress?: string
  totalPoints: number
  updatedAt: number
  history: PointTransaction[]
}

async function loadPointsLedger(): Promise<UserPointsRecord[]> {
  try {
    if (!existsSync(POINTS_FILE)) return []
    const raw = await readFile(POINTS_FILE, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

async function savePointsLedger(records: UserPointsRecord[]): Promise<void> {
  try {
    await mkdir(path.dirname(POINTS_FILE), { recursive: true })
    await writeFile(POINTS_FILE, JSON.stringify(records, null, 2), 'utf-8')
  } catch (err) {
    console.error('[Points System] Error saving ledger:', err)
  }
}

/**
 * Awards points to a Twitter user idempotently.
 */
export async function awardPoints({
  twitterHandle,
  twitterUserId,
  walletAddress,
  points = 100,
  type = 'TOKEN_DEPLOY',
  description = 'Launched token via Twitter account',
  tokenAddress,
  tokenSymbol,
  txHash,
}: {
  twitterHandle: string
  twitterUserId?: string
  walletAddress?: string
  points?: number
  type?: PointActivityType
  description?: string
  tokenAddress?: string
  tokenSymbol?: string
  txHash?: string
}): Promise<{ success: boolean; totalPoints: number; pointsAwarded: number }> {
  if (!twitterHandle) {
    return { success: false, totalPoints: 0, pointsAwarded: 0 }
  }

  const cleanHandle = twitterHandle.replace('@', '').toLowerCase()
  const ledger = await loadPointsLedger()
  let userRecord = ledger.find((r) => r.twitterHandle.toLowerCase() === cleanHandle)

  // Idempotency: avoid awarding duplicate points for the exact same token deploy / txHash
  if (tokenAddress && userRecord) {
    const existing = userRecord.history.find(
      (h) => h.type === type && h.tokenAddress?.toLowerCase() === tokenAddress.toLowerCase()
    )
    if (existing) {
      return { success: true, totalPoints: userRecord.totalPoints, pointsAwarded: 0 }
    }
  }

  const newTx: PointTransaction = {
    id: `pt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    points,
    description,
    tokenAddress,
    tokenSymbol,
    txHash,
    timestamp: Date.now(),
  }

  if (userRecord) {
    userRecord.totalPoints += points
    userRecord.updatedAt = Date.now()
    if (twitterUserId && !userRecord.twitterUserId) userRecord.twitterUserId = twitterUserId
    if (walletAddress && !userRecord.walletAddress) userRecord.walletAddress = walletAddress
    userRecord.history.unshift(newTx)
  } else {
    userRecord = {
      twitterHandle: cleanHandle,
      twitterUserId,
      walletAddress,
      totalPoints: points,
      updatedAt: Date.now(),
      history: [newTx],
    }
    ledger.push(userRecord)
  }

  await savePointsLedger(ledger)
  return { success: true, totalPoints: userRecord.totalPoints, pointsAwarded: points }
}

/**
 * Get points record for a user by handle or address.
 */
export async function getUserPoints(identifier: string): Promise<UserPointsRecord | null> {
  if (!identifier) return null
  const clean = identifier.replace('@', '').toLowerCase()
  const ledger = await loadPointsLedger()
  const found = ledger.find(
    (r) =>
      r.twitterHandle.toLowerCase() === clean ||
      (r.walletAddress && r.walletAddress.toLowerCase() === clean) ||
      (r.twitterUserId && r.twitterUserId.toLowerCase() === clean)
  )

  return found || {
    twitterHandle: clean,
    totalPoints: 0,
    updatedAt: Date.now(),
    history: [],
  }
}

/**
 * Get top leaderboard of points.
 */
export async function getPointsLeaderboard(limit = 50): Promise<Array<UserPointsRecord & { rank: number }>> {
  const ledger = await loadPointsLedger()
  const sorted = [...ledger].sort((a, b) => b.totalPoints - a.totalPoints)
  return sorted.slice(0, limit).map((rec, index) => ({
    ...rec,
    rank: index + 1,
  }))
}
