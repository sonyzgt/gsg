import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * Upload to Pinata IPFS (if credentials provided in .env)
 */
async function uploadToPinata(buffer: Buffer, ext: string, fileName: string): Promise<string | null> {
  const jwt = process.env.PINATA_JWT
  const apiKey = process.env.PINATA_API_KEY
  const secretKey = process.env.PINATA_SECRET_API_KEY

  if (!jwt && (!apiKey || !secretKey)) return null

  try {
    const uint8 = new Uint8Array(buffer)
    const blob = new Blob([uint8], { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` })
    const formData = new FormData()
    formData.append('file', blob, fileName)

    const headers: Record<string, string> = {}
    if (jwt) {
      headers['Authorization'] = `Bearer ${jwt}`
    } else if (apiKey && secretKey) {
      headers['pinata_api_key'] = apiKey
      headers['pinata_secret_api_key'] = secretKey
    }

    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers,
      body: formData,
    })

    if (res.ok) {
      const data = await res.json()
      if (data.IpfsHash) {
        return `ipfs://${data.IpfsHash}`
      }
    }
  } catch (e) {
    console.warn('[IPFS] Pinata upload error:', e)
  }
  return null
}

/**
 * Upload to Lighthouse Storage Public IPFS (Decentralized, accessible by DexScreener, GMGN, Blockscout)
 */
async function uploadToPublicIpfs(buffer: Buffer, ext: string, fileName: string): Promise<string | null> {
  try {
    const uint8 = new Uint8Array(buffer)
    const blob = new Blob([uint8], { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` })
    const formData = new FormData()
    formData.append('file', blob, fileName)

    const res = await fetch('https://node.lighthouse.storage/api/v0/add', {
      method: 'POST',
      body: formData,
    })

    if (res.ok) {
      const data = await res.json()
      if (data.Hash) {
        return `ipfs://${data.Hash}`
      }
    }
  } catch (e) {
    console.warn('[IPFS] Public IPFS node fallback error:', e)
  }

  return null
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || ''
    let buffer: Buffer
    let ext = 'png'

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const file = formData.get('file') as File | null
      if (!file) {
        return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
      }
      const arrayBuffer = await file.arrayBuffer()
      buffer = Buffer.from(arrayBuffer)
      if (file.type.includes('webp')) ext = 'webp'
      else if (file.type.includes('jpeg') || file.type.includes('jpg')) ext = 'jpg'
      else if (file.type.includes('svg')) ext = 'svg'
      else if (file.type.includes('gif')) ext = 'gif'
    } else {
      const body = await req.json()
      const dataUrl = body.image as string
      if (!dataUrl || !dataUrl.includes('base64,')) {
        return NextResponse.json({ error: 'Invalid image data' }, { status: 400 })
      }
      const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/)
      if (!matches || matches.length !== 3) {
        return NextResponse.json({ error: 'Invalid base64 string' }, { status: 400 })
      }
      ext = matches[1] === 'jpeg' ? 'jpg' : matches[1]
      buffer = Buffer.from(matches[2], 'base64')
    }

    // 1. Save local copy in public/uploads/
    const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16)
    const fileName = `${hash}.${ext}`
    const uploadDir = path.join(process.cwd(), 'public', 'uploads')
    await mkdir(uploadDir, { recursive: true })
    await writeFile(path.join(uploadDir, fileName), buffer)

    // 2. Upload to IPFS (Pinata -> Lighthouse Public IPFS)
    let ipfsUri = await uploadToPinata(buffer, ext, fileName)
    if (!ipfsUri) {
      ipfsUri = await uploadToPublicIpfs(buffer, ext, fileName)
    }

    const rawHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'launchsparkle.fun'
    const isLocal = rawHost.includes('localhost') || rawHost.includes('127.0.0.1')
    const proto = req.headers.get('x-forwarded-proto') || (isLocal ? 'http' : 'https')
    const baseOrigin = isLocal ? `http://${rawHost}` : (rawHost.includes('launchsparkle.fun') ? 'https://launchsparkle.fun' : `${proto}://${rawHost}`)
    const fullPublicUrl = `${baseOrigin}/uploads/${fileName}`
    const relativeUrl = `/uploads/${fileName}`

    // If IPFS was successfully pinned, use HTTPS IPFS gateway URL, otherwise use the full public HTTPS URL
    const ipfsGatewayUrl = ipfsUri ? `https://ipfs.io/ipfs/${ipfsUri.replace('ipfs://', '')}` : null
    const finalUrl = ipfsGatewayUrl || fullPublicUrl

    return NextResponse.json({
      success: true,
      url: finalUrl,
      publicUrl: fullPublicUrl,
      ipfsUri: ipfsUri || null,
      ipfsUrl: ipfsGatewayUrl,
      localUrl: fullPublicUrl,
      relativeUrl,
      fileName,
    })
  } catch (err: unknown) {
    console.error('Upload handler error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to upload image' },
      { status: 500 }
    )
  }
}
