import { NextRequest, NextResponse } from 'next/server'
import { getUserPoints, getPointsLeaderboard } from '@/lib/points-system'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const user = searchParams.get('user')
    const isLeaderboard = searchParams.get('leaderboard') === 'true'

    if (isLeaderboard) {
      const leaderboard = await getPointsLeaderboard(50)
      return NextResponse.json({ success: true, leaderboard })
    }

    if (!user) {
      const leaderboard = await getPointsLeaderboard(10)
      return NextResponse.json({ success: true, leaderboard })
    }

    const pointsData = await getUserPoints(user)
    const leaderboard = await getPointsLeaderboard(100)
    const rank = leaderboard.findIndex((r) => r.twitterHandle.toLowerCase() === user.replace('@', '').toLowerCase()) + 1

    return NextResponse.json({
      success: true,
      data: {
        ...pointsData,
        rank: rank > 0 ? rank : null,
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to query points'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
