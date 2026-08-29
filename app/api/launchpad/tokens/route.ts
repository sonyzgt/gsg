import { NextRequest, NextResponse } from 'next/server'
import {
  getPonsTokenInfo,
  PonsV2TokenInfo,
} from '@/lib/pons-v2'
import { isAddress, getAddress } from 'viem'
import { readFile, writeFile, mkdir } from 'fs/promises'
import path from 'path'

export const dynamic = 'force-dynamic'

const REGISTRY_FILE = path.join(process.cwd(), 'data', 'launched_tokens.json')

const PLATFORM_TOKENS: string[] = []

async function getStoredTokens(): Promise<string[]> {
  try {
    const raw = await readFile(REGISTRY_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed
    }
  } catch {
    try {
      await mkdir(path.dirname(REGISTRY_FILE), { recursive: true })
      await writeFile(REGISTRY_FILE, JSON.stringify(PLATFORM_TOKENS, null, 2))
    } catch { /* ignore */ }
  }
  return PLATFORM_TOKENS
}

async function saveStoredTokens(addresses: string[]) {
  try {
    await mkdir(path.dirname(REGISTRY_FILE), { recursive: true })
    await writeFile(REGISTRY_FILE, JSON.stringify(addresses, null, 2))
  } catch (e) {
    console.error('Error saving platform tokens registry:', e)
  }
}

const CACHE_FILE = path.join(process.cwd(), 'data', 'tokens_cache.json')

interface GlobalTokensCache {
  data: PonsV2TokenInfo[]
  lastFetch: number
  isFetching: boolean
}

const g = globalThis as unknown as { __tokensCache?: GlobalTokensCache }
if (!g.__tokensCache) {
  g.__tokensCache = {
    data: [],
    lastFetch: 0,
    isFetching: false,
  }
}

async function refreshTokensInBackground() {
  if (g.__tokensCache?.isFetching) return
  if (g.__tokensCache) g.__tokensCache.isFetching = true

  try {
    const tokenAddresses = new Set<string>()
    const stored = await getStoredTokens()
    for (const t of stored) {
      if (isAddress(t)) tokenAddresses.add(getAddress(t))
    }

    const currentList = Array.from(tokenAddresses)

    // Preserve exact order from launched_tokens.json (top of json = index 0 / leftmost)
    const tokenMap = new Map<string, PonsV2TokenInfo>()
    await Promise.all(
      currentList.map(async (addr) => {
        try {
          const info = await getPonsTokenInfo(addr)
          if (info) tokenMap.set(addr.toLowerCase(), info)
        } catch { /* continue */ }
      })
    )

    const tokenInfos: PonsV2TokenInfo[] = []
    for (const addr of currentList) {
      const found = tokenMap.get(addr.toLowerCase())
      if (found) tokenInfos.push(found)
    }

    // Always update in-memory and disk cache (even when array is empty after deletion)
    if (g.__tokensCache) {
      g.__tokensCache.data = tokenInfos
      g.__tokensCache.lastFetch = Date.now()
    }
    try {
      await writeFile(CACHE_FILE, JSON.stringify(tokenInfos, null, 2))
    } catch { /* ignore */ }
  } catch (err) {
    console.error('Background refresh error:', err)
  } finally {
    if (g.__tokensCache) g.__tokensCache.isFetching = false
  }
}

// Initial disk cache load on startup
async function getCachedTokens(): Promise<PonsV2TokenInfo[]> {
  if (g.__tokensCache && g.__tokensCache.data.length > 0) {
    return g.__tokensCache.data
  }
  try {
    const raw = await readFile(CACHE_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) {
      if (g.__tokensCache) {
        g.__tokensCache.data = parsed
        g.__tokensCache.lastFetch = Date.now()
      }
      return parsed
    }
  } catch { /* ignore */ }
  return []
}

export async function GET() {
  try {
    const now = Date.now()
    const cached = await getCachedTokens()

    // If cache is present, return IMMEDIATELY (< 5ms) and revalidate in background if > 4s old
    if (cached.length > 0) {
      if (now - (g.__tokensCache?.lastFetch || 0) > 4000) {
        refreshTokensInBackground().catch(() => {})
      }
      return NextResponse.json({
        success: true,
        tokens: cached,
        count: cached.length,
        cached: true,
      })
    }

    // First ever run with no disk cache: fetch synchronously
    await refreshTokensInBackground()
    const fresh = g.__tokensCache?.data || []

    return NextResponse.json({
      success: true,
      tokens: fresh,
      count: fresh.length,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch tokens'
    return NextResponse.json({ success: false, error: msg, tokens: [] }, { status: 500 })
  }
}

// POST endpoint to register newly deployed tokens instantly on this platform
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const rawAddress = String(body.address || body.tokenAddress || '').trim()

    if (!rawAddress || !isAddress(rawAddress)) {
      return NextResponse.json({ error: 'Invalid token address' }, { status: 400 })
    }

    const clean = getAddress(rawAddress)
    const stored = await getStoredTokens()

    if (!stored.map((s) => s.toLowerCase()).includes(clean.toLowerCase())) {
      stored.unshift(clean)
      await saveStoredTokens(stored)
    }

    const info = await getPonsTokenInfo(clean)

    return NextResponse.json({
      success: true,
      registered: clean,
      token: info,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to register token'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
