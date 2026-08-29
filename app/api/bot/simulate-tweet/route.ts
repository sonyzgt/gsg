import { NextRequest, NextResponse } from 'next/server'
import { processTweetLaunch } from '@/bot/twitter-worker'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { twitterHandle, tweetText, imageUrl } = body

    if (!twitterHandle || !tweetText) {
      return NextResponse.json({ error: 'twitterHandle and tweetText required' }, { status: 400 })
    }

    const result = await processTweetLaunch({
      tweetId: `sim_${Date.now()}`,
      authorHandle: twitterHandle,
      text: tweetText,
      imageUrl: imageUrl || 'https://ipfs.io/ipfs/bafkreicaxbt5gboi3h3ucjnojh5u2wkxomdt3tmrofv5dseknzfefd3ls4',
    })

    return NextResponse.json(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Simulation failed'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
