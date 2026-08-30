import { NextRequest, NextResponse } from 'next/server'
import { readFile, readdir } from 'fs/promises'
import path from 'path'
import { detectSafeImageMimeType, SAFE_IMAGE_HEADERS } from '@/lib/image-validator'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cid: string }> }
) {
  try {
    const { cid } = await params
    // Strict alphanumeric/base58/base32 CID validation
    if (!cid || cid.length < 10 || !/^[a-zA-Z0-9_-]+$/.test(cid)) {
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
        const safeMime = detectSafeImageMimeType(fileBuffer)

        if (!safeMime) {
          return new NextResponse('Unsupported or invalid image file', { status: 415 })
        }

        return new NextResponse(fileBuffer, {
          headers: {
            'Content-Type': safeMime,
            'Cache-Control': 'public, max-age=31536000, immutable',
            ...SAFE_IMAGE_HEADERS,
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
          const arrayBuffer = await res.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)

          // STRICT MAGIC BYTE VALIDATION: Only allow genuine image files (PNG, JPEG, WEBP, GIF, safe SVG)
          const safeMime = detectSafeImageMimeType(buffer)
          if (!safeMime) {
            console.warn(`[Security] Blocked non-image IPFS content for CID ${cid}`)
            return new NextResponse('Invalid or non-image content blocked for security reasons', { status: 415 })
          }

          return new NextResponse(arrayBuffer, {
            headers: {
              'Content-Type': safeMime,
              'Cache-Control': 'public, max-age=31536000, immutable',
              ...SAFE_IMAGE_HEADERS,
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
