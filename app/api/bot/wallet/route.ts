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

    let walletAddress = found?.walletAddress
    let twitterHandle = found?.twitterHandle || handle

    if (!walletAddress && handle) {
      const { getOrCreateTwitterUserWallet } = await import('@/lib/privy-server')
      const mapping = await getOrCreateTwitterUserWallet('', handle.replace('@', ''))
      if (mapping) {
        walletAddress = mapping.walletAddress
        twitterHandle = mapping.twitterUsername
      }
    }

    if (!walletAddress) {
      return NextResponse.json({ success: false, error: 'Wallet not found' }, { status: 404 })
    }

    const balanceEth = await getBotUserBalance(walletAddress)

    return NextResponse.json({
      success: true,
      walletAddress,
      twitterHandle,
      balanceEth,
      totalLaunches: found?.totalLaunches ?? 0,
      createdAt: found?.createdAt ?? Date.now(),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Wallet query failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
