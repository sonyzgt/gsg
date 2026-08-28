import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * Calculates standard IPFS UnixFS CIDv0 (Qm...) from a file buffer in pure JS
 */
function calculateIpfsCidV0(buffer: Buffer): string {
  function encodeVarint(val: number): Buffer {
    const bytes: number[] = []
    while (val >= 0x80) {
      bytes.push((val & 0x7f) | 0x80)
      val = val >>> 7
    }
    bytes.push(val)
    return Buffer.from(bytes)
  }

  // UnixFS protobuf Node { Data: UnixFS { Type: 2 (File), Data: buffer, filesize: len } }
  const dataHeader = Buffer.from([0x08, 0x02])
  const dataField = Buffer.concat([Buffer.from([0x12]), encodeVarint(buffer.length), buffer])
  const sizeField = Buffer.concat([Buffer.from([0x18]), encodeVarint(buffer.length)])
  const unixFsData = Buffer.concat([dataHeader, dataField, sizeField])

  const nodePb = Buffer.concat([Buffer.from([0x0a]), encodeVarint(unixFsData.length), unixFsData])
  const sha256 = crypto.createHash('sha256').update(nodePb).digest()
  const multihash = Buffer.concat([Buffer.from([0x12, 0x20]), sha256])

  // Base58btc encode
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  const digits = [0]
  for (let i = 0; i < multihash.length; i++) {
    let carry = multihash[i]
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8
      digits[j] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }
  let str = ''
  for (let i = 0; i < multihash.length && multihash[i] === 0; i++) {
    str += '1'
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    str += ALPHABET[digits[i]]
  }
  return str
}

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

    // 1. Calculate deterministic standard IPFS CIDv0 (Qm...)
    const ipfsCid = calculateIpfsCidV0(buffer)
    const ipfsUri = `ipfs://${ipfsCid}`
    const ipfsGatewayUrl = `https://ipfs.io/ipfs/${ipfsCid}`

    // 2. Save local copy in public/uploads/ using both hash and CID
    const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16)
    const fileName = `${hash}.${ext}`
    const uploadDir = path.join(process.cwd(), 'public', 'uploads')
    await mkdir(uploadDir, { recursive: true })
    await writeFile(path.join(uploadDir, fileName), buffer)

    // Also write with CID name so IPFS fallback router can resolve locally if needed
    try {
      await writeFile(path.join(uploadDir, `${ipfsCid}.${ext}`), buffer)
    } catch { /* ignore */ }

    // 3. Pin to Pinata in background if credentials configured
    uploadToPinata(buffer, ext, fileName).catch(() => {})

    const rawHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'launchsparkle.fun'
    const isLocal = rawHost.includes('localhost') || rawHost.includes('127.0.0.1')
    const proto = req.headers.get('x-forwarded-proto') || (isLocal ? 'http' : 'https')
    const baseOrigin = isLocal ? `http://${rawHost}` : (rawHost.includes('launchsparkle.fun') ? 'https://launchsparkle.fun' : `${proto}://${rawHost}`)
    const fullPublicUrl = `${baseOrigin}/uploads/${fileName}`
    const relativeUrl = `/uploads/${fileName}`

    // Return the standard IPFS URI for Pons v2 contracts & DEX crawlers
    return NextResponse.json({
      success: true,
      url: ipfsUri, // Standard ipfs://Qm...
      ipfsUri: ipfsUri,
      ipfsUrl: ipfsGatewayUrl,
      gatewayUrl: ipfsGatewayUrl,
      publicUrl: fullPublicUrl,
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
