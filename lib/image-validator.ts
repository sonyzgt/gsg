/**
 * Safe Image MIME-type detector and validator using binary magic bytes.
 * Prevents Stored XSS, Polyglot files, and Content-Type spoofing.
 */

export const SAFE_IMAGE_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'cross-origin',
}

export function detectSafeImageMimeType(buffer: Buffer | Uint8Array): string | null {
  if (!buffer || buffer.length < 4) return null

  // 1. PNG: 89 50 4E 47
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png'
  }

  // 2. JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }

  // 3. GIF: 47 49 46 38 (GIF8)
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return 'image/gif'
  }

  // 4. WEBP: RIFF .... WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp'
  }

  // 5. SVG check with strict sanitization
  try {
    const text = Buffer.from(buffer).toString('utf-8').toLowerCase()
    if (text.includes('<svg') || text.includes('xmlns="http://www.w3.org/2000/svg"')) {
      // Reject any SVG containing executable scripts, iframes, foreign objects or event handlers
      if (
        text.includes('<script') ||
        text.includes('javascript:') ||
        text.includes('onload') ||
        text.includes('onerror') ||
        text.includes('onclick') ||
        text.includes('onmouseover') ||
        text.includes('onfocus') ||
        text.includes('<iframe') ||
        text.includes('<embed') ||
        text.includes('<object') ||
        text.includes('<foreignobject') ||
        text.includes('xlink:href="javascript:')
      ) {
        console.warn('[Security] Malicious SVG with embedded script/events rejected.')
        return null
      }
      return 'image/svg+xml'
    }
  } catch {
    /* not text */
  }

  return null
}
