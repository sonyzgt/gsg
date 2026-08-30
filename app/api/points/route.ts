import { NextRequest, NextResponse } from 'next/server'
import { getUserPoints, getPointsLeaderboard } from '@/lib/points-system'
import { getRewardPotInfo } from '@/lib/reward-pot'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const user = searchParams.get('user')
    const isLeaderboard = searchParams.get('leaderboard') === 'true'
    const pot = await getRewardPotInfo()

    if (isLeaderboard) {
      const leaderboard = await getPointsLeaderboard(50)
      return NextResponse.json({ success: true, leaderboard, pot })
    }

    if (!user) {
      const leaderboard = await getPointsLeaderboard(10)
      return NextResponse.json({ success: true, leaderboard, pot })
    }

    const pointsData = await getUserPoints(user)
    const leaderboard = await getPointsLeaderboard(100)
    const cleanUser = user.replace('@', '').toLowerCase()
    const rank = leaderboard.findIndex(
      (r) =>
        r.twitterHandle.toLowerCase() === cleanUser ||
        (r.walletAddress && r.walletAddress.toLowerCase() === cleanUser)
    ) + 1

    return NextResponse.json({
      success: true,
      data: {
        ...pointsData,
        rank: rank > 0 ? rank : null,
      },
      pot,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to query points'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
