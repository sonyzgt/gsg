/**
 * Server-side IPFS upload utility for Twitter media and token images.
 */
export async function downloadAndUploadImageToIPFS(imageUrl: string, fileName = 'token.png'): Promise<string> {
  const defaultFallback = 'https://ipfs.io/ipfs/bafkreicaxbt5gboi3h3ucjnojh5u2wkxomdt3tmrofv5dseknzfefd3ls4'
  if (!imageUrl || !imageUrl.startsWith('http')) return defaultFallback

  try {
    // 1. Download image from source URL (e.g. Twitter CDN)
    const response = await fetch(imageUrl)
    if (!response.ok) {
      console.warn(`[IPFS] Failed to download image from ${imageUrl}: ${response.statusText}`)
      return defaultFallback
    }

    const contentType = response.headers.get('content-type') || 'image/png'
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // 2. Pin to Pinata IPFS (if PINATA_JWT is present)
    const jwt = process.env.PINATA_JWT
    if (jwt) {
      try {
        const blob = new Blob([new Uint8Array(buffer)], { type: contentType })
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
          if (data.IpfsHash) {
            const ipfsUri = `https://ipfs.io/ipfs/${data.IpfsHash}`
            console.log(`[IPFS] Successfully pinned image to Pinata IPFS: ${ipfsUri}`)
            return ipfsUri
          }
        } else {
          console.warn('[IPFS] Pinata upload returned non-200:', await res.text())
        }
      } catch (pinataErr) {
        console.warn('[IPFS] Pinata upload error:', pinataErr)
      }
    }

    // 3. Fallback: Lighthouse IPFS
    try {
      const blob = new Blob([new Uint8Array(buffer)], { type: contentType })
      const form = new FormData()
      form.append('file', blob, fileName)

      const res = await fetch('https://node.lighthouse.storage/api/v0/add', {
        method: 'POST',
        body: form,
      })

      if (res.ok) {
        const data = await res.json()
        if (data.Hash) {
          const ipfsUri = `https://ipfs.io/ipfs/${data.Hash}`
          console.log(`[IPFS] Successfully pinned image to Lighthouse IPFS: ${ipfsUri}`)
          return ipfsUri
        }
      }
    } catch (lhErr) {
      console.warn('[IPFS] Lighthouse upload error:', lhErr)
    }

    return defaultFallback
  } catch (err) {
    console.error('[IPFS] Image processing failed:', err)
    return defaultFallback
  }
}
