import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateBotUser, getBotUsers } from '@/lib/bot-wallet'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { twitterHandle, name, profileImage, twitterId, privyUserId, privyWalletAddress } = body

    if (!twitterHandle) {
      return NextResponse.json({ error: 'Twitter handle required' }, { status: 400 })
    }

    const cleanHandle = String(twitterHandle).replace('@', '').trim()
    const cleanId = twitterId || `tw_${cleanHandle.toLowerCase()}`

    const botUser = await getOrCreateBotUser({
      twitterId: cleanId,
      twitterHandle: cleanHandle,
      name: name || cleanHandle,
      profileImage: profileImage || '',
      privyUserId,
      privyWalletAddress,
    })

    return NextResponse.json({
      success: true,
      user: {
        twitterId: botUser.twitterId,
        twitterHandle: botUser.twitterHandle,
        name: botUser.name,
        profileImage: botUser.profileImage,
        privyWalletAddress: botUser.privyWalletAddress,
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
    const privyId = req.nextUrl.searchParams.get('privyId')

    if (!handle && !privyId) {
      return NextResponse.json({ error: 'Handle or privyId required' }, { status: 400 })
    }

    const users = await getBotUsers()
    const found = users.find(u => 
      (handle && u.twitterHandle.toLowerCase() === handle.replace('@', '').toLowerCase()) ||
      (privyId && u.privyUserId === privyId)
    )

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
        privyWalletAddress: found.privyWalletAddress,
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
