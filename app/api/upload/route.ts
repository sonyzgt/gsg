import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * Upload ke Pinata IPFS (jika PINATA_JWT ada di .env)
 */
async function pinToPinata(buffer: Buffer, mimeType: string, fileName: string): Promise<string | null> {
  const jwt = process.env.PINATA_JWT
  if (!jwt) return null

  try {
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType })
    const form = new FormData()
    form.append('file', blob, fileName)
    form.append('pinataMetadata', JSON.stringify({ name: fileName }))
    form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }))

    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
    })

    if (res.ok) {
      const data = await res.json()
      if (data.IpfsHash) return `ipfs://${data.IpfsHash}`
    }
    console.warn('[IPFS] Pinata error:', await res.text())
  } catch (e) {
    console.warn('[IPFS] Pinata exception:', e)
  }
  return null
}

/**
 * Upload ke Lighthouse.storage (public, gratis tanpa auth)
 */
async function pinToLighthouse(buffer: Buffer, mimeType: string, fileName: string): Promise<string | null> {
  try {
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType })
    const form = new FormData()
    form.append('file', blob, fileName)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)

    const res = await fetch('https://node.lighthouse.storage/api/v0/add', {
      method: 'POST',
      body: form,
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (res.ok) {
      const data = await res.json()
      if (data.Hash) return `ipfs://${data.Hash}`
    }
    console.warn('[IPFS] Lighthouse error:', await res.text().catch(() => ''))
  } catch (e) {
    console.warn('[IPFS] Lighthouse exception:', e)
  }
  return null
}

/**
 * Upload ke Web3.storage (public node, gratis)
 */
async function pinToWeb3Storage(buffer: Buffer, mimeType: string, fileName: string): Promise<string | null> {
  try {
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType })
    const form = new FormData()
    form.append('file', blob, fileName)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)

    // Try ipfs.io public writable API
    const res = await fetch('https://ipfs.io/api/v0/add?quieter=true&pin=true', {
      method: 'POST',
      body: form,
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (res.ok) {
      const text = await res.text()
      const last = text.trim().split('\n').pop() || ''
      const data = JSON.parse(last)
      if (data.Hash) return `ipfs://${data.Hash}`
    }
  } catch (e) {
    console.warn('[IPFS] ipfs.io add exception:', e)
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || ''
    let buffer: Buffer
    let ext = 'png'
    let mimeType = 'image/png'

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const file = formData.get('file') as File | null
      if (!file) {
        return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
      }
      buffer = Buffer.from(await file.arrayBuffer())
      mimeType = file.type || 'image/png'
      if (mimeType.includes('webp')) ext = 'webp'
      else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg'
      else if (mimeType.includes('svg')) ext = 'svg'
      else if (mimeType.includes('gif')) ext = 'gif'
    } else {
      const body = await req.json()
      const dataUrl = body.image as string
      if (!dataUrl?.includes('base64,')) {
        return NextResponse.json({ error: 'Invalid image data' }, { status: 400 })
      }
      const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/)
      if (!matches || matches.length < 3) {
        return NextResponse.json({ error: 'Invalid base64' }, { status: 400 })
      }
      ext = matches[1] === 'jpeg' ? 'jpg' : matches[1]
      mimeType = `image/${matches[1] === 'jpg' ? 'jpeg' : matches[1]}`
      buffer = Buffer.from(matches[2], 'base64')
    }

    // 1. Save local backup
    const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16)
    const fileName = `${hash}.${ext}`
    const uploadDir = path.join(process.cwd(), 'public', 'uploads')
    await mkdir(uploadDir, { recursive: true })
    await writeFile(path.join(uploadDir, fileName), buffer)

    // Build full public URL (fallback)
    const rawHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'launchsparkle.fun'
    const isLocal = rawHost.includes('localhost') || rawHost.includes('127.0.0.1')
    const baseOrigin = isLocal
      ? `http://${rawHost}`
      : rawHost.includes('launchsparkle.fun')
        ? 'https://launchsparkle.fun'
        : `https://${rawHost}`
    const publicUrl = `${baseOrigin}/uploads/${fileName}`

    // 2. Upload to IPFS: Pinata → Lighthouse → ipfs.io
    let ipfsUri: string | null = null
    ipfsUri = await pinToPinata(buffer, mimeType, fileName)
    if (!ipfsUri) ipfsUri = await pinToLighthouse(buffer, mimeType, fileName)
    if (!ipfsUri) ipfsUri = await pinToWeb3Storage(buffer, mimeType, fileName)

    const cid = ipfsUri ? ipfsUri.replace('ipfs://', '') : null
    const ipfsUrl = cid ? `https://ipfs.io/ipfs/${cid}` : null

    // Return: prefer IPFS gateway URL on-chain, fall back to full public URL
    const finalUrl = ipfsUrl || publicUrl

    return NextResponse.json({
      success: true,
      url: finalUrl,          // used as on-chain logo
      publicUrl,              // full https URL (fallback)
      ipfsUri,                // ipfs://... (null if failed)
      ipfsUrl,                // https://ipfs.io/ipfs/...
      relativeUrl: `/uploads/${fileName}`,
      fileName,
    })
  } catch (err: unknown) {
    console.error('[upload] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
