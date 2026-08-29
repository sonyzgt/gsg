import { createWalletClient, createPublicClient, http, parseEther, formatEther, getAddress, parseAbi, decodeEventLog } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { robinhoodChain } from '../lib/chains'
import { getBotUsers, decryptPrivateKey, saveBotUsers, BotUser } from '../lib/bot-wallet'
import path from 'path'
import { readFile, writeFile } from 'fs/promises'
import crypto from 'crypto'

const FACTORY_ADDRESS = '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e' as `0x${string}`
const LAUNCH_FEE = parseEther('0.0005')
const REGISTRY_FILE = path.join(process.cwd(), 'data', 'launched_tokens.json')
const STATE_FILE = path.join(process.cwd(), 'data', 'bot_state.json')

const FACTORY_ABI = parseAbi([
  'function launchToken(string name, string symbol, string uri, address pairToken, uint24 poolFee, int24 tickSpacing, uint16 creatorTaxBps) payable returns (address token, address curve)',
  'event TokenLaunched(address indexed token, address indexed curve, address indexed creator, string name, string symbol, string uri)',
])

export interface TweetPayload {
  tweetId: string
  authorHandle: string
  text: string
  imageUrl?: string
}

export interface ParsedLaunchCommand {
  symbol: string
  name: string
  description: string
  imageUrl: string
}

export function parseTweetLaunchCommand(text: string, defaultImageUrl = ''): ParsedLaunchCommand | null {
  const clean = text.replace(/@\w+/g, '').trim()
  const tickerMatch = clean.match(/\$([A-Za-z0-9_]{2,15})/i) || clean.match(/(?:launch|deploy)\s+([A-Za-z0-9_]{2,15})/i)
  
  if (!tickerMatch) return null
  const symbol = tickerMatch[1].toUpperCase()

  const parts = clean.replace(/^(?:launch|deploy)\s+/i, '').replace(tickerMatch[0], '').trim().split(/\n|\.|-/)
  const name = parts[0]?.trim() || `${symbol} Coin`
  const description = parts.slice(1).join(' ').trim() || `Community memecoin $${symbol} launched via PONSCORE Twitter Bot on Robinhood Chain.`

  return {
    symbol,
    name: name.slice(0, 32),
    description,
    imageUrl: defaultImageUrl,
  }
}

export async function processTweetLaunch(payload: TweetPayload): Promise<{
  success: boolean
  message: string
  tokenAddress?: string
  txHash?: string
}> {
  const cleanHandle = payload.authorHandle.replace('@', '').toLowerCase()
  const users = await getBotUsers()
  const user = users.find(u => u.twitterHandle.toLowerCase() === cleanHandle)

  if (!user) {
    return {
      success: false,
      message: `@${payload.authorHandle} Your Twitter account is not registered. Link your wallet at https://ponscore.app/bot to launch tokens.`,
    }
  }

  const parsed = parseTweetLaunchCommand(payload.text, payload.imageUrl || 'https://ipfs.io/ipfs/bafkreicaxbt5gboi3h3ucjnojh5u2wkxomdt3tmrofv5dseknzfefd3ls4')
  if (!parsed) {
    return {
      success: false,
      message: `@${payload.authorHandle} Invalid launch format. Use: @ponscorebot launch $TICKER Name Description and attach an image.`,
    }
  }

  const publicClient = createPublicClient({
    chain: robinhoodChain,
    transport: http('https://robinhood-rpc.publicnode.com'),
  })

  const balance = await publicClient.getBalance({ address: user.walletAddress })
  const requiredBalance = LAUNCH_FEE + parseEther('0.0003')

  if (balance < requiredBalance) {
    return {
      success: false,
      message: `@${payload.authorHandle} Your deposit wallet (${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}) has insufficient ETH (${formatEther(balance)} ETH). Top up at least 0.001 ETH at https://ponscore.app/bot`,
    }
  }

  const privateKey = decryptPrivateKey(user.encryptedPrivateKey, user.iv, user.tag)
  const account = privateKeyToAccount(privateKey)

  const walletClient = createWalletClient({
    account,
    chain: robinhoodChain,
    transport: http('https://robinhood-rpc.publicnode.com'),
  })

  const metadataUri = parsed.imageUrl
  console.log(`[Bot Worker] Launching $${parsed.symbol} for @${payload.authorHandle} on Robinhood Chain...`)

  const txHash = await walletClient.sendTransaction({
    to: FACTORY_ADDRESS,
    value: LAUNCH_FEE,
    data: (await import('viem')).encodeFunctionData({
      abi: FACTORY_ABI,
      functionName: 'launchToken',
      args: [
        parsed.name,
        parsed.symbol,
        metadataUri,
        '0x0000000000000000000000000000000000000000',
        0,
        200,
        100,
      ],
    }),
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

  let deployedTokenCa = ''
  for (const log of receipt.logs) {
    try {
      const event = decodeEventLog({
        abi: FACTORY_ABI,
        eventName: 'TokenLaunched',
        data: log.data,
        topics: log.topics,
      })
      if (event.args.token) {
        deployedTokenCa = getAddress(event.args.token)
        break
      }
    } catch { /* continue */ }
  }

  if (deployedTokenCa) {
    try {
      const rawStored = await readFile(REGISTRY_FILE, 'utf-8').catch(() => '[]')
      const stored = JSON.parse(rawStored)
      if (Array.isArray(stored) && !stored.map((s: string) => s.toLowerCase()).includes(deployedTokenCa.toLowerCase())) {
        stored.unshift(deployedTokenCa)
        await writeFile(REGISTRY_FILE, JSON.stringify(stored, null, 2))
      }
    } catch { /* ignore */ }
  }

  user.totalLaunches = (user.totalLaunches || 0) + 1
  await saveBotUsers(users)

  const creatorDisplay = user.privyWalletAddress ? `@${payload.authorHandle} (${user.privyWalletAddress})` : `@${payload.authorHandle}`
  const successMessage = `$${parsed.symbol} is live on Robinhood Chain.\n\nToken: ${deployedTokenCa || 'Success'}\nCreator: ${creatorDisplay}\nTrade: https://ponscore.app/token/${deployedTokenCa}\nExplorer: https://robinhoodchain.blockscout.com/tx/${txHash}`

  return {
    success: true,
    message: successMessage,
    tokenAddress: deployedTokenCa,
    txHash,
  }
}

// -------------------------------------------------------------
// TWITTER API V2 OAUTH 1.0A & POLLING LISTENER
// -------------------------------------------------------------

function generateOAuthHeader(method: string, url: string, params: Record<string, string> = {}) {
  const apiKey = process.env.TWITTER_API_KEY || ''
  const apiSecret = process.env.TWITTER_API_SECRET || ''
  const token = process.env.TWITTER_ACCESS_TOKEN || ''
  const tokenSecret = process.env.TWITTER_ACCESS_SECRET || ''

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: '1.0',
    ...params,
  }

  const sortedKeys = Object.keys(oauthParams).sort()
  const paramString = sortedKeys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(oauthParams[k])}`).join('&')
  const baseString = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`
  const signingKey = `${encodeURIComponent(apiSecret)}&${encodeURIComponent(tokenSecret)}`
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64')

  oauthParams['oauth_signature'] = signature

  const authHeader = 'OAuth ' + Object.keys(oauthParams)
    .filter(k => k.startsWith('oauth_'))
    .sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(', ')

  return authHeader
}

async function postTwitterReply(replyText: string, inReplyToTweetId: string) {
  const url = 'https://api.twitter.com/2/tweets'
  const body = JSON.stringify({
    text: replyText,
    reply: { in_reply_to_tweet_id: inReplyToTweetId },
  })

  const authHeader = generateOAuthHeader('POST', url)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body,
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error('[Twitter API Error] Failed to post reply:', res.status, errText)
  } else {
    console.log('[Twitter API] Reply posted successfully for tweet:', inReplyToTweetId)
  }
}

async function pollMentions() {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN
  const botHandle = process.env.TWITTER_BOT_HANDLE || 'agent_ponscore'

  if (!bearerToken) {
    console.log('[Twitter Worker] TWITTER_BEARER_TOKEN not found. Running in standby mode...')
    return
  }

  try {
    let state = { lastSeenId: '' }
    try {
      const raw = await readFile(STATE_FILE, 'utf-8')
      state = JSON.parse(raw)
    } catch { /* ignore */ }

    const query = encodeURIComponent(`@${botHandle} -is:retweet`)
    let url = `https://api.twitter.com/2/tweets/search/recent?query=${query}&expansions=attachments.media_keys,author_id&media.fields=url,preview_image_url&user.fields=username`
    if (state.lastSeenId) {
      url += `&since_id=${state.lastSeenId}`
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    })

    if (!res.ok) {
      if (res.status === 429) {
        console.log('[Twitter Worker] Rate limit reached. Waiting for next cycle...')
      }
      return
    }

    const data = await res.json()
    if (!data.data || data.data.length === 0) return

    const usersMap = new Map<string, string>()
    if (data.includes?.users) {
      for (const u of data.includes.users) {
        usersMap.set(u.id, u.username)
      }
    }

    const mediaMap = new Map<string, string>()
    if (data.includes?.media) {
      for (const m of data.includes.media) {
        const img = m.url || m.preview_image_url
        if (img) mediaMap.set(m.media_key, img)
      }
    }

    for (const tweet of data.data) {
      const authorUsername = usersMap.get(tweet.author_id) || ''
      if (!authorUsername || authorUsername.toLowerCase() === botHandle.toLowerCase()) continue

      let imageUrl = ''
      if (tweet.attachments?.media_keys?.length) {
        for (const k of tweet.attachments.media_keys) {
          if (mediaMap.has(k)) {
            imageUrl = mediaMap.get(k)!
            break
          }
        }
      }

      console.log(`[Twitter Worker] Processing mention from @${authorUsername}: "${tweet.text}"`)
      const result = await processTweetLaunch({
        tweetId: tweet.id,
        authorHandle: authorUsername,
        text: tweet.text,
        imageUrl: imageUrl || undefined,
      })

      if (process.env.TWITTER_API_KEY && process.env.TWITTER_ACCESS_TOKEN) {
        await postTwitterReply(result.message, tweet.id)
      }

      state.lastSeenId = tweet.id
      await writeFile(STATE_FILE, JSON.stringify(state, null, 2))
    }
  } catch (err) {
    console.error('[Twitter Worker Polling Error]:', err)
  }
}

// Start continuous polling loop if executed directly
if (require.main === module) {
  console.log('[Twitter Bot Worker] Started autonomous listener on Robinhood Chain...')
  pollMentions()
  setInterval(pollMentions, 15000)
}
