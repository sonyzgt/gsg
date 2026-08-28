import { NextRequest, NextResponse } from 'next/server'
import { readFile, readdir } from 'fs/promises'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cid: string }> }
) {
  try {
    const { cid } = await params
    if (!cid || cid.length < 10) {
      return new NextResponse('Invalid CID', { status: 400 })
    }

    const uploadDir = path.join(process.cwd(), 'public', 'uploads')

    // 1. Check if we have the file locally matching CID
    try {
      const files = await readdir(uploadDir)
      const matchingFile = files.find((f) => f.startsWith(cid))
      if (matchingFile) {
        const filePath = path.join(uploadDir, matchingFile)
        const fileBuffer = await readFile(filePath)
        const ext = path.extname(matchingFile).replace('.', '')
        return new NextResponse(fileBuffer, {
          headers: {
            'Content-Type': ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`,
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        })
      }
    } catch {
      /* continue to gateway fetch */
    }

    // 2. Fetch from public IPFS gateways with timeout
    const gateways = [
      `https://ipfs.io/ipfs/${cid}`,
      `https://gateway.pinata.cloud/ipfs/${cid}`,
      `https://cloudflare-ipfs.com/ipfs/${cid}`,
    ]

    for (const gw of gateways) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 4000)
        const res = await fetch(gw, { signal: controller.signal })
        clearTimeout(timeoutId)

        if (res.ok) {
          const contentType = res.headers.get('content-type') || 'image/png'
          const arrayBuffer = await res.arrayBuffer()
          return new NextResponse(arrayBuffer, {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
          })
        }
      } catch {
        /* try next gateway */
      }
    }

    return new NextResponse('Not found on IPFS', { status: 404 })
  } catch (err: unknown) {
    return new NextResponse('Error fetching IPFS asset', { status: 500 })
  }
}
