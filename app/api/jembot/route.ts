import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { isAddress, getAddress } from 'viem'
import { getPonsTokenInfo, PonsV2TokenInfo } from '@/lib/pons-v2'

export const dynamic = 'force-dynamic'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Sonyfree24@'
const REGISTRY_FILE = path.join(process.cwd(), 'data', 'launched_tokens.json')
const CACHE_FILE = path.join(process.cwd(), 'data', 'tokens_cache.json')

interface GlobalTokensCache {
  data: PonsV2TokenInfo[]
  lastFetch: number
  isFetching: boolean
}

const g = globalThis as unknown as { __tokensCache?: GlobalTokensCache }

async function getStoredTokens(): Promise<string[]> {
  try {
    const raw = await readFile(REGISTRY_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) {
      const addresses: string[] = []
      for (const item of parsed) {
        const addr = typeof item === 'string' ? item : item?.tokenAddress || item?.address
        if (addr && isAddress(addr)) {
          addresses.push(getAddress(addr))
        }
      }
      return Array.from(new Set(addresses))
    }
  } catch {
    try {
      await mkdir(path.dirname(REGISTRY_FILE), { recursive: true })
      await writeFile(REGISTRY_FILE, JSON.stringify([], null, 2))
    } catch { /* ignore */ }
  }
  return []
}

async function saveStoredTokens(addresses: (string | object)[]) {
  try {
    await mkdir(path.dirname(REGISTRY_FILE), { recursive: true })
    await writeFile(REGISTRY_FILE, JSON.stringify(addresses, null, 2))
  } catch (e) {
    console.error('Error saving registry:', e)
  }
}

// 1. GET: Verify Auth & List all tokens in database
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-admin-password') || req.nextUrl.searchParams.get('pwd')

  if (authHeader !== ADMIN_PASSWORD) {
    return NextResponse.json({ success: false, error: 'Unauthorized: Invalid password' }, { status: 401 })
  }

  try {
    const stored = await getStoredTokens()
    let cachedList: PonsV2TokenInfo[] = []

    try {
      const rawCache = await readFile(CACHE_FILE, 'utf-8')
      const parsed = JSON.parse(rawCache)
      if (Array.isArray(parsed)) cachedList = parsed
    } catch {
      cachedList = g.__tokensCache?.data || []
    }

    // Detailed token list
    const details = await Promise.all(
      stored.map(async (addr) => {
        const found = cachedList.find((c) => c?.tokenAddress && c.tokenAddress.toLowerCase() === addr.toLowerCase())
        if (found) return found
        try {
          const info = await getPonsTokenInfo(addr)
          if (info) return info
        } catch { /* continue */ }

        return {
          tokenAddress: addr,
          name: 'Token',
          symbol: 'TOKEN',
          logo: '/logo.svg',
          priceUsd: 0,
          priceNative: 0,
          progress: 0,
          graduated: false,
          phase: 0,
          route: 'BONDING_CURVE',
        } as unknown as PonsV2TokenInfo
      })
    )

    const validTokens = details.filter(Boolean)

    return NextResponse.json({
      success: true,
      tokens: validTokens,
      rawAddresses: stored,
      count: stored.length,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to query tokens'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

// 2. DELETE: Remove single token or clear entire history
export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get('x-admin-password')

  if (authHeader !== ADMIN_PASSWORD) {
    return NextResponse.json({ success: false, error: 'Unauthorized: Invalid password' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { address, action } = body

    if (action === 'delete_all' || action === 'clear_all') {
      // Clear all tokens
      await saveStoredTokens([])
      if (g.__tokensCache) {
        g.__tokensCache.data = []
        g.__tokensCache.lastFetch = Date.now()
      }
      try {
        await writeFile(CACHE_FILE, JSON.stringify([], null, 2))
      } catch { /* ignore */ }

      return NextResponse.json({
        success: true,
        message: 'All token history and cache successfully cleared',
        count: 0,
      })
    }

    if (!address || !isAddress(address)) {
      return NextResponse.json({ success: false, error: 'Invalid contract address' }, { status: 400 })
    }

    const clean = getAddress(address)
    try {
      const raw = await readFile(REGISTRY_FILE, 'utf-8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const updated = parsed.filter((item) => {
          const addr = typeof item === 'string' ? item : item?.tokenAddress || item?.address
          if (!addr) return false
          try {
            return getAddress(addr).toLowerCase() !== clean.toLowerCase()
          } catch {
            return false
          }
        })
        await writeFile(REGISTRY_FILE, JSON.stringify(updated, null, 2))
      }
    } catch { /* ignore */ }

    // Update Cache
    if (g.__tokensCache) {
      g.__tokensCache.data = g.__tokensCache.data.filter((t) => t.tokenAddress.toLowerCase() !== clean.toLowerCase())
      g.__tokensCache.lastFetch = Date.now()
    }

    try {
      let cachedList: PonsV2TokenInfo[] = []
      const rawCache = await readFile(CACHE_FILE, 'utf-8')
      const parsed = JSON.parse(rawCache)
      if (Array.isArray(parsed)) {
        cachedList = parsed.filter((t) => t.tokenAddress.toLowerCase() !== clean.toLowerCase())
        await writeFile(CACHE_FILE, JSON.stringify(cachedList, null, 2))
      }
    } catch { /* ignore */ }

    return NextResponse.json({
      success: true,
      deleted: clean,
      remainingCount: updated.length,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete token'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

// 3. POST: Add token manually or verify password
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { password, action, address } = body

    if (password !== ADMIN_PASSWORD) {
      return NextResponse.json({ success: false, error: 'Invalid password' }, { status: 401 })
    }

    // Simple password check
    if (action === 'verify') {
      return NextResponse.json({ success: true, message: 'Authenticated' })
    }

    // Add token manually
    if (action === 'add' && address && isAddress(address)) {
      const clean = getAddress(address)
      const stored = await getStoredTokens()

      if (!stored.map((s) => s.toLowerCase()).includes(clean.toLowerCase())) {
        stored.unshift(clean)
        await saveStoredTokens(stored)
      }

      const info = await getPonsTokenInfo(clean)
      if (info && g.__tokensCache) {
        g.__tokensCache.data.unshift(info)
        g.__tokensCache.lastFetch = Date.now()
        try {
          await writeFile(CACHE_FILE, JSON.stringify(g.__tokensCache.data, null, 2))
        } catch { /* ignore */ }
      }

      return NextResponse.json({
        success: true,
        registered: clean,
        token: info,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Request failed'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
