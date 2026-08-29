import { NextRequest, NextResponse } from 'next/server'
import { getBotUsers, getBotUserBalance } from '@/lib/bot-wallet'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const handle = req.nextUrl.searchParams.get('handle')
    const address = req.nextUrl.searchParams.get('address')

    if (!handle && !address) {
      return NextResponse.json({ error: 'handle or address required' }, { status: 400 })
    }

    const users = await getBotUsers()
    const found = users.find(u => 
      (handle && u.twitterHandle.toLowerCase() === handle.replace('@', '').toLowerCase()) ||
      (address && u.walletAddress.toLowerCase() === address.toLowerCase())
    )

    if (!found) {
      return NextResponse.json({ success: false, error: 'Wallet not found' }, { status: 404 })
    }

    const balanceEth = await getBotUserBalance(found.walletAddress)

    return NextResponse.json({
      success: true,
      walletAddress: found.walletAddress,
      twitterHandle: found.twitterHandle,
      balanceEth,
      totalLaunches: found.totalLaunches,
      createdAt: found.createdAt,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Wallet query failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
