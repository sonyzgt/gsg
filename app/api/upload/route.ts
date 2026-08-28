import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

async function uploadToPublicCdn(buffer: Buffer, ext: string): Promise<string | null> {
  try {
    const uint8 = new Uint8Array(buffer)
    const blob = new Blob([uint8], { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` })
    const formData = new FormData()
    formData.append('reqtype', 'fileupload')
    formData.append('fileToUpload', blob, `token_logo.${ext}`)

    const res = await fetch('https://catbox.moe/user/api.php', {
      method: 'POST',
      body: formData,
    })

    if (res.ok) {
      const publicUrl = await res.text()
      if (publicUrl && publicUrl.startsWith('http')) {
        return publicUrl.trim()
      }
    }
  } catch (e) {
    console.warn('Public CDN upload fallback:', e)
  }

  // Backup public upload provider (tmpfiles)
  try {
    const uint8 = new Uint8Array(buffer)
    const blob = new Blob([uint8], { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` })
    const formData = new FormData()
    formData.append('file', blob, `token_logo.${ext}`)

    const res = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      body: formData,
    })

    if (res.ok) {
      const json = await res.json()
      if (json.data?.url) {
        return json.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/')
      }
    }
  } catch {
    // ignore
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

    // 2. Upload to Global Public CDN so Blockscout, Dexscreener & other websites can view it
    const publicCdnUrl = await uploadToPublicCdn(buffer, ext)

    const host = req.headers.get('host') || 'localhost:3001'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const localUrl = `${protocol}://${host}/uploads/${fileName}`
    const relativeUrl = `/uploads/${fileName}`

    // Use reliable relative /uploads/ path for the app, with fallback
    const finalUrl = relativeUrl

    return NextResponse.json({
      success: true,
      url: finalUrl,
      publicUrl: publicCdnUrl || localUrl,
      localUrl,
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
