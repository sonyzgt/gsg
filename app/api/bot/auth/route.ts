import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateBotUser, getBotUsers } from '@/lib/bot-wallet'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { twitterHandle, name, profileImage, twitterId } = body

    if (!twitterHandle) {
      return NextResponse.json({ error: 'Twitter handle required' }, { status: 400 })
    }

    const cleanHandle = String(twitterHandle).replace('@', '').trim()
    const cleanId = twitterId || `tw_${cleanHandle.toLowerCase()}`

    const botUser = await getOrCreateBotUser(cleanId, cleanHandle, name || cleanHandle, profileImage || '')

    return NextResponse.json({
      success: true,
      user: {
        twitterId: botUser.twitterId,
        twitterHandle: botUser.twitterHandle,
        name: botUser.name,
        profileImage: botUser.profileImage,
        walletAddress: botUser.walletAddress,
        createdAt: botUser.createdAt,
        totalLaunches: botUser.totalLaunches,
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Auth failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const handle = req.nextUrl.searchParams.get('handle')
    if (!handle) {
      return NextResponse.json({ error: 'Handle required' }, { status: 400 })
    }

    const cleanHandle = handle.replace('@', '').toLowerCase()
    const users = await getBotUsers()
    const found = users.find(u => u.twitterHandle.toLowerCase() === cleanHandle)

    if (!found) {
      return NextResponse.json({ success: false, error: 'User not registered' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      user: {
        twitterId: found.twitterId,
        twitterHandle: found.twitterHandle,
        name: found.name,
        profileImage: found.profileImage,
        walletAddress: found.walletAddress,
        createdAt: found.createdAt,
        totalLaunches: found.totalLaunches,
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Query failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
