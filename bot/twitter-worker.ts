import * as dotenv from 'dotenv'
import path from 'path'

// Load .env.local for standalone execution
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: true })

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseEther,
  formatEther,
  decodeEventLog,
} from 'viem'
import { robinhoodChain } from '@/lib/chains'
import { downloadAndUploadImageToIPFS } from '@/lib/ipfs-server'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import crypto from 'crypto'

const WORKER_INSTANCE_ID = crypto.randomBytes(4).toString('hex')

const FACTORY_ADDRESS = (process.env.PONS_FACTORY_ADDRESS || '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e') as `0x${string}`
const LAUNCH_FEE = parseEther('0.0005')
const STATE_FILE = path.join(process.cwd(), 'data', 'twitter_state.json')
const PROCESSED_TWEETS_FILE = path.join(process.cwd(), 'data', 'processed_tweets.json')

const FACTORY_ABI = parseAbi([
  'struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }',
  'struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }',
  'struct LaunchConfig { uint256 supply; uint256 curveFeeBps; uint256 phantomQuote; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; bool enabled; }',
  'function launchToken(TokenParams params, uint256 launchConfigId, address pairToken) payable returns (address token, address curve)',
  'function launchFee() view returns (uint256)',
  'function launchConfigCount() view returns (uint256)',
  'function getLaunchConfig(uint256 id) view returns (LaunchConfig)',
  'function canLaunch(address caller) view returns (bool)',
  'function maxCreatorTaxBps() view returns (uint16)',
  'function previewLaunchEconomics(uint256 launchConfigId, address pairToken) view returns (bytes32)',
  'function approvedPairTokens(address pairToken) view returns (bool)',
  'event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)',
  
  // Custom Errors
  'error LaunchEconomicsMismatch()',
  'error PairTokenNotApproved()',
  'error PairTokenDecimalsMismatch()',
  'error NativeValueMismatch()',
  'error UnexpectedNativeValue()',
  'error LaunchFeeNotPaid()',
  'error CreatorTaxTooHigh()',
  'error NotWhitelisted()',
  'error LaunchConfigDisabled()',
  'error SlippageExceeded()',
  'error Unauthorized()',
])

export interface TweetPayload {
  tweetId: string
  authorHandle: string
  authorId?: string
  text: string
  imageUrl?: string
  createdAt?: string
}

async function loadProcessedTweets(): Promise<string[]> {
  try {
    if (!existsSync(PROCESSED_TWEETS_FILE)) return []
    const raw = await readFile(PROCESSED_TWEETS_FILE, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

async function markTweetProcessed(tweetId: string) {
  if (!tweetId) return
  try {
    await mkdir(path.dirname(PROCESSED_TWEETS_FILE), { recursive: true })
    const list = await loadProcessedTweets()
    if (!list.includes(tweetId)) {
      list.push(tweetId)
      await writeFile(PROCESSED_TWEETS_FILE, JSON.stringify(list, null, 2))
    }
  } catch (err) {
    console.error('[Twitter Worker] Error saving processed tweet ID:', err)
  }
}

export async function processTweetLaunch(payload: TweetPayload): Promise<{
  success: boolean
  message: string
  tokenAddress?: string
  txHash?: string
}> {
  console.log(`\n[STAGE 4 — processTweetLaunch INPUT]`)
  console.log(`Tweet ID: ${payload.tweetId}`)
  console.log(`Author: @${payload.authorHandle} (${payload.authorId})`)
  console.log(`Text: "${payload.text}"`)
  console.log(`Image: ${payload.imageUrl || 'none'}\n`)

  const cleanHandle = payload.authorHandle.replace('@', '').toLowerCase()
  const authorId = payload.authorId || `tw_${cleanHandle}`

  // 1. Idempotency Check: Skip if tweet already processed
  const processedTweets = await loadProcessedTweets()
  if (payload.tweetId && processedTweets.includes(payload.tweetId)) {
    console.log(`[Twitter Agent] Tweet ${payload.tweetId} already in processed list. Skipping.`)
    return {
      success: true,
      message: `Tweet already processed.`,
    }
  }

  // 2. Resolve Privy User Wallet mapped to Twitter ID
  const { getOrCreateTwitterUserWallet, createPrivyViemAccount } = await import('@/lib/privy-server')
  const userWalletMapping = await getOrCreateTwitterUserWallet(authorId, cleanHandle)

  if (!userWalletMapping?.walletAddress) {
    await markTweetProcessed(payload.tweetId)
    return {
      success: false,
      message: `@${payload.authorHandle} Unable to resolve your Privy wallet. Please visit https://ponscore.app to link your account.`,
    }
  }

  const activeWallet = userWalletMapping.walletAddress

  // 3. AI Command Parsing
  console.log(`[STAGE 5 — AI INPUT]`)
  console.log(`Tweet ID: ${payload.tweetId}`)
  console.log(`Text: "${payload.text}"\n`)

  const { parseTwitterCommandWithAI } = await import('@/lib/twitter-command-agent')
  const aiResult = await parseTwitterCommandWithAI({
    tweetId: payload.tweetId,
    text: payload.text,
    authorId: authorId,
    authorUsername: payload.authorHandle,
    createdAt: payload.createdAt,
    media: payload.imageUrl ? [{ type: 'photo', url: payload.imageUrl }] : [],
  })

  console.log(`[AI Parser]`)
  console.log(`Intent: ${aiResult.intent}`)
  console.log(`Token Name: ${aiResult.tokenName || 'null'}`)
  console.log(`Token Symbol: ${aiResult.tokenSymbol || 'null'}`)
  console.log(`Confidence: ${aiResult.confidence.toFixed(1)}\n`)

  // Handle Wallet Query intent
  if (aiResult.intent === 'wallet_query') {
    await markTweetProcessed(payload.tweetId)
    const publicClient = createPublicClient({
      chain: robinhoodChain,
      transport: http('https://robinhood-rpc.publicnode.com'),
    })
    const bal = await publicClient.getBalance({ address: activeWallet })
    const currentEth = Number(formatEther(bal)).toFixed(4)
    const shortAddr = `${activeWallet.slice(0, 6)}...${activeWallet.slice(-4)}`
    return {
      success: true,
      message: `@${payload.authorHandle} Your wallet: ${shortAddr}\nBalance: ${currentEth} ETH\nDeposit: https://ponscore.app/wallet/${activeWallet}`,
    }
  }

  // Handle Unrecognized or non-launch intent
  if (aiResult.intent !== 'launch_token' || !aiResult.tokenSymbol) {
    console.log(`[Twitter COMMAND REJECTED]`)
    console.log(`Reason: Invalid launch syntax or missing token symbol.\n`)
    await markTweetProcessed(payload.tweetId)
    return {
      success: false,
      message: `@${payload.authorHandle} Usage:\n@agent_ponscore launch token $TEST`,
    }
  }

  // Check if DEBUG_ONLY mode is enabled
  if (process.env.TWITTER_DEBUG_ONLY === 'true') {
    console.log(`[DEBUG MODE ACTIVE] Stopping pipeline before transaction execution.`);
    await markTweetProcessed(payload.tweetId)
    return {
      success: true,
      message: `[DEBUG ONLY] Token ${aiResult.tokenSymbol} parsed successfully.`,
    }
  }

  const tokenSymbol = aiResult.tokenSymbol.toUpperCase()
  const tokenName = aiResult.tokenName || tokenSymbol

  // 4. Image Validation & IPFS Upload
  let permanentImageUri = ''
  if (payload.imageUrl && payload.imageUrl.startsWith('http')) {
    console.log(`[Twitter Agent] Downloading attached image from Twitter and pinning to IPFS...`)
    permanentImageUri = await downloadAndUploadImageToIPFS(payload.imageUrl, `${tokenSymbol.toLowerCase()}_logo.png`)
  } else {
    console.log(`[Twitter Agent] No image attached to tweet ${payload.tweetId}. Requesting user to attach image.`)
    await markTweetProcessed(payload.tweetId)
    return {
      success: false,
      message: `@${payload.authorHandle} Please attach an image to your tweet to launch $${tokenSymbol}.\n\nUsage: @agent_ponscore launch token ${tokenSymbol} [attach image]`,
    }
  }

  const canonicalTweetUrl = payload.tweetId && !payload.tweetId.startsWith('sim_')
    ? `https://x.com/${payload.authorHandle}/status/${payload.tweetId}`
    : `https://x.com/${payload.authorHandle}`

  // Diagnostic Structured Logging
  console.log(`[Metadata]`)
  console.log(`Image URI: ${permanentImageUri}`)
  console.log(`Website: ${canonicalTweetUrl}`)
  console.log(`Twitter: @${payload.authorHandle}\n`)

  console.log(`[Identity]`)
  console.log(`Twitter ID: ${userWalletMapping.twitterUserId}`)
  console.log(`Privy User: ${userWalletMapping.privyUserId}`)
  console.log(`Wallet: ${activeWallet}\n`)

  console.log(`[Launch]`)
  console.log(`Creator: ${activeWallet}`)
  console.log(`Fee Recipient: ${activeWallet}`)

  const publicClient = createPublicClient({
    chain: robinhoodChain,
    transport: http('https://robinhood-rpc.publicnode.com'),
  })

  // Preflight 1: canLaunch(userWallet)
  const isAuthorized = await publicClient.readContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'canLaunch',
    args: [activeWallet],
  }).catch(() => true)

  if (!isAuthorized) {
    await markTweetProcessed(payload.tweetId)
    return {
      success: false,
      message: `@${payload.authorHandle} This wallet (${activeWallet.slice(0, 6)}...${activeWallet.slice(-4)}) is currently not authorized to launch on Pons v2.`,
    }
  }

  // Preflight 2: Read launchFee()
  const onChainFee = await publicClient.readContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'launchFee',
  }).catch(() => LAUNCH_FEE)

  const balance = await publicClient.getBalance({ address: activeWallet })
  const requiredBalance = onChainFee + parseEther('0.0003')

  if (balance < requiredBalance) {
    await markTweetProcessed(payload.tweetId)
    const currentEth = Number(formatEther(balance)).toFixed(4)
    const shortAddr = `${activeWallet.slice(0, 6)}...${activeWallet.slice(-4)}`
    return {
      success: false,
      message: `@${payload.authorHandle} Your wallet ready: ${shortAddr}\nBalance: ${currentEth} ETH\nDeposit at least ${(Number(requiredBalance) / 1e18).toFixed(4)} ETH: https://ponscore.app/wallet/${activeWallet}`,
    }
  }

  // Preflight 3: Read launchConfig
  const launchConfig = await publicClient.readContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'getLaunchConfig',
    args: [0n],
  }).catch(() => ({ enabled: true }))

  if (!launchConfig.enabled) {
    await markTweetProcessed(payload.tweetId)
    return {
      success: false,
      message: `@${payload.authorHandle} Pons v2 launch configuration is currently disabled.`,
    }
  }

  // Preflight 4: Validate maxCreatorTaxBps
  const maxTaxBps = await publicClient.readContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'maxCreatorTaxBps',
  }).catch(() => 1000)

  const creatorTaxBps = Math.min(100, Number(maxTaxBps)) // 1%

  // Preflight 5: Read previewLaunchEconomics
  const expectedEconomics = await publicClient.readContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'previewLaunchEconomics',
    args: [0n, '0x0000000000000000000000000000000000000000'],
  })

  // Preflight 6: Generate Salt EXACTLY ONCE
  const salt = ('0x' + crypto.randomBytes(32).toString('hex')) as `0x${string}`

  const launchParams = {
    name: tokenName,
    symbol: tokenSymbol,
    logo: permanentImageUri,
    description: `Launched via @agent_ponscore on Twitter by @${payload.authorHandle}`,
    socials: {
      twitter: `https://x.com/${payload.authorHandle}`,
      telegram: '',
      discord: '',
      website: canonicalTweetUrl,
      farcaster: '',
    },
    creatorFeeRecipient: activeWallet,
    creatorTaxBps,
    buybackEnabled: false,
    expectedEconomics,
    salt,
  }

  // Preflight 7: On-Chain Simulation
  try {
    await publicClient.simulateContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: 'launchToken',
      args: [launchParams, 0n, '0x0000000000000000000000000000000000000000'],
      value: onChainFee,
      account: activeWallet,
    })
    console.log(`[Twitter Agent] Preflight simulation PASSED for @${payload.authorHandle}`)
  } catch (simErr: any) {
    console.error(`[Twitter Agent] Preflight simulation REVERTED:`, simErr)
    await markTweetProcessed(payload.tweetId)
    const reason = simErr?.shortMessage || simErr?.message || 'Smart contract rejected the launch transaction.'
    return {
      success: false,
      message: `@${payload.authorHandle} Launch simulation failed: ${reason}`,
    }
  }

  const txData = (await import('viem')).encodeFunctionData({
    abi: FACTORY_ABI,
    functionName: 'launchToken',
    args: [launchParams, 0n, '0x0000000000000000000000000000000000000000'],
  })

  let txHash: `0x${string}` | null = null

  const { getPrivyClient } = await import('@/lib/privy-server')
  const privy = getPrivyClient()

  if (!privy) {
    throw new Error('Privy client is not configured')
  }

  console.log(`[Twitter Agent] Preparing transaction for Privy User Wallet: ${activeWallet} (Wallet ID: ${userWalletMapping.walletId})...`)
  
  try {
    const nonce = await publicClient.getTransactionCount({ address: activeWallet })
    const gasPrice = await publicClient.getGasPrice()

    console.log(`\n[FINAL TRANSACTION]`)
    console.log(`from: ${activeWallet}`)
    console.log(`to: ${FACTORY_ADDRESS}`)
    console.log(`value: ${formatEther(onChainFee)} ETH`)
    console.log(`nonce: ${nonce}`)
    console.log(`gasPrice: ${gasPrice.toString()} wei`)
    console.log(`chainId: 4663`)
    console.log(`data: ${txData}\n`)

    console.log(`[Twitter Agent] Signing transaction via Privy Server Wallet API (Wallet ID: ${userWalletMapping.walletId})...`)
    const signRes = await privy.walletApi.ethereum.signTransaction({
      walletId: userWalletMapping.walletId,
      transaction: {
        to: FACTORY_ADDRESS,
        value: `0x${onChainFee.toString(16)}`,
        data: txData,
        chainId: 4663,
        nonce,
        gasLimit: '0x3D0900', // 4,000,000 gas
        gasPrice: `0x${gasPrice.toString(16)}`,
        type: 0,
      }
    })

    console.log(`[Twitter Agent] Broadcasting raw signed transaction to Robinhood Chain RPC...`)
    txHash = await publicClient.sendRawTransaction({
      serializedTransaction: signRes.signedTransaction as `0x${string}`,
    })
    console.log(`[Twitter Agent] Transaction broadcasted successfully! TX: ${txHash}`)
  } catch (err: any) {
    console.error(`[Twitter Agent] Transaction error for wallet ${activeWallet}:`, err)
    await markTweetProcessed(payload.tweetId)
    return {
      success: false,
      message: `@${payload.authorHandle} Transaction failed: ${err.message || 'Unable to sign transaction from your Privy wallet.'}`,
    }
  }

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
      if (event?.args && 'token' in event.args) {
        deployedTokenCa = (event.args as any).token
        break
      }
    } catch { /* continue */ }
  }

  if (deployedTokenCa) {
    const REGISTRY_FILE = path.join(process.cwd(), 'data', 'launched_tokens.json')
    try {
      let list: string[] = []
      if (existsSync(REGISTRY_FILE)) {
        const raw = await readFile(REGISTRY_FILE, 'utf-8')
        list = JSON.parse(raw)
        if (!Array.isArray(list)) list = []
      }
      if (!list.map(a => a.toLowerCase()).includes(deployedTokenCa.toLowerCase())) {
        list.unshift(deployedTokenCa)
        await writeFile(REGISTRY_FILE, JSON.stringify(list, null, 2))
        console.log(`[Twitter Agent] Registered new token ${deployedTokenCa} into launched_tokens.json`)
      }
    } catch (err) {
      console.error('[Twitter Agent] Error saving token to launched_tokens.json:', err)
    }
  }

  await markTweetProcessed(payload.tweetId)

  const shortCa = deployedTokenCa ? `${deployedTokenCa.slice(0, 6)}...${deployedTokenCa.slice(-4)}` : ''
  const responseMsg = deployedTokenCa
    ? `$${tokenSymbol} is live on Robinhood Chain.\n\nCreator: @${payload.authorHandle}\nTrade: https://ponscore.app/token/${deployedTokenCa}\nExplorer: https://robinhoodchain.blockscout.com/tx/${txHash}`
    : `$${tokenSymbol} launch submitted on Robinhood Chain.\n\nTX: https://robinhoodchain.blockscout.com/tx/${txHash}`

  return {
    success: true,
    message: responseMsg,
    tokenAddress: deployedTokenCa,
    txHash,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Twitter Poller & Poster Implementation
// ─────────────────────────────────────────────────────────────────────────────

function generateOAuthHeader(method: string, url: string, params: Record<string, string> = {}) {
  const apiKey = process.env.TWITTER_API_KEY || ''
  const apiSecret = process.env.TWITTER_API_SECRET || ''
  const accessToken = process.env.TWITTER_ACCESS_TOKEN || ''
  const tokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET || process.env.TWITTER_ACCESS_SECRET || ''

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
    ...params,
  }

  const sortedKeys = Object.keys(oauthParams).sort()
  const paramString = sortedKeys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(oauthParams[k])}`).join('&')
  const baseString = `${method.toUpperCase()}&${encodeURIComponent(url.split('?')[0])}&${encodeURIComponent(paramString)}`
  const signingKey = `${encodeURIComponent(apiSecret)}&${encodeURIComponent(tokenSecret)}`
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64')

  oauthParams['oauth_signature'] = signature

  return 'OAuth ' + Object.keys(oauthParams)
    .filter(k => k.startsWith('oauth_'))
    .sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(', ')
}

function sanitizeCashtags(text: string): string {
  let cashtagCount = 0
  return text.replace(/\$([a-zA-Z0-9_]+)/g, (match, sym) => {
    cashtagCount++
    return cashtagCount <= 1 ? match : sym
  })
}

async function postTwitterReply(replyText: string, inReplyToTweetId: string) {
  const url = 'https://api.twitter.com/2/tweets'
  const primaryText = sanitizeCashtags(replyText)
  const body = JSON.stringify({
    text: primaryText,
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

    // Handle X 403 (cashtags/crypto address restriction on X Free API)
    if (res.status === 403) {
      console.log('[Twitter API] Retrying with sanitized reply text without cashtags...')
      const sanitized = replyText
        .replace(/\$/g, '')
        .replace(/0x[a-fA-F0-9]{40}/g, 'Ponscore')
        .replace(/0x[a-fA-F0-9]{64}/g, 'Confirmed')
      
      const retryBody = JSON.stringify({
        text: sanitized,
        reply: { in_reply_to_tweet_id: inReplyToTweetId },
      })

      const retryRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': generateOAuthHeader('POST', url),
          'Content-Type': 'application/json',
        },
        body: retryBody,
      })
      if (retryRes.ok) {
        console.log('[Twitter API] Sanitized reply posted successfully for tweet:', inReplyToTweetId)
      } else {
        const retryErr = await retryRes.text()
        console.error('[Twitter API Error] Retry also failed:', retryRes.status, retryErr)
      }
    }
  } else {
    console.log('[Twitter API] Reply posted successfully for tweet:', inReplyToTweetId)
  }
}

let cachedBotUserId = ''

async function getBotUserId(botHandle: string): Promise<string> {
  if (cachedBotUserId) return cachedBotUserId
  const url = `https://api.twitter.com/2/users/by/username/${botHandle}`
  const bearerToken = process.env.TWITTER_BEARER_TOKEN
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearerToken}` },
  })
  if (res.ok) {
    const data = await res.json()
    if (data.data?.id) {
      cachedBotUserId = data.data.id
      return cachedBotUserId
    }
  }
  return ''
}

export async function pollMentions() {
  const botHandle = (process.env.TWITTER_BOT_HANDLE || 'agent_ponscore').replace('@', '')
  const bearerToken = process.env.TWITTER_BEARER_TOKEN

  if (!bearerToken && !process.env.TWITTER_API_KEY) {
    console.log('[Twitter Worker] No Twitter credentials configured in .env.local')
    return
  }

  try {
    let state = { lastSeenId: '' }
    try {
      if (existsSync(STATE_FILE)) {
        const raw = await readFile(STATE_FILE, 'utf-8')
        state = JSON.parse(raw)
      }
    } catch { /* ignore */ }

    let botId = await getBotUserId(botHandle)
    let url = ''

    if (botId) {
      url = `https://api.twitter.com/2/users/${botId}/mentions?max_results=10&expansions=attachments.media_keys,author_id&media.fields=url,preview_image_url,type&user.fields=username&tweet.fields=created_at,attachments,text`
    } else {
      const query = encodeURIComponent(`@${botHandle} -is:retweet`)
      url = `https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=10&expansions=attachments.media_keys,author_id&media.fields=url,preview_image_url,type&user.fields=username&tweet.fields=created_at,attachments,text`
    }

    if (state.lastSeenId) {
      url += `&since_id=${state.lastSeenId}`
    }

    console.log(`\n[TWITTER API REQUEST]`)
    console.log(`Endpoint:      ${url.split('?')[0]}`)
    console.log(`Bot User ID:   ${botId}`)
    console.log(`since_id:      ${state.lastSeenId || 'none'}`)
    console.log(`Expansions:    attachments.media_keys,author_id`)
    console.log(`Tweet Fields:  created_at,attachments,text`)
    console.log(`Media Fields:  url,preview_image_url,type`)

    const headers: Record<string, string> = {}
    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`
    } else {
      headers['Authorization'] = generateOAuthHeader('GET', url)
    }

    const res = await fetch(url, { headers })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[Twitter Worker Polling Status]:', res.status, errText)
      return
    }

    const data = await res.json()
    const tweetsList: any[] = data.data || []

    console.log(`\n[RAW TWITTER API RESPONSE]`)
    console.log(`Returned count: ${tweetsList.length}`)

    const usersMap = new Map<string, string>()
    if (data.includes?.users) {
      for (const u of data.includes.users) {
        usersMap.set(u.id, u.username)
      }
    }

    const mediaMap = new Map<string, string>()
    if (data.includes?.media) {
      for (const m of data.includes.media) {
        const img = m.url || m.preview_image_url || m.type
        if (img) mediaMap.set(m.media_key, img)
      }
    }

    tweetsList.forEach((t, i) => {
      const author = usersMap.get(t.author_id) || t.author_id
      console.log(`Tweet #${i + 1}`)
      console.log(`  ID:          ${t.id}`)
      console.log(`  Created At:  ${t.created_at}`)
      console.log(`  Author:      @${author} (${t.author_id})`)
      console.log(`  Text:        "${t.text}"`)
      console.log(`  Attachments: ${JSON.stringify(t.attachments || 'none')}`)
    })

    // Check whether $TEST tweet was returned
    const foundTest = tweetsList.some(t => t.text.includes('$TEST') || t.text.toLowerCase().includes('launch token $test'))
    console.log(`\n[SEARCH RESULT]`)
    console.log(`Found $TEST tweet: ${foundTest}\n`)

    if (tweetsList.length === 0) {
      return
    }

    // If first run and no state exists, initialize state to newest tweet without processing backlog
    if (!state.lastSeenId) {
      const newestId = data.meta?.newest_id || tweetsList[0].id
      state.lastSeenId = newestId
      await writeFile(STATE_FILE, JSON.stringify(state, null, 2))
      console.log(`[Twitter Worker] Initialized lastSeenId cursor to: ${newestId}`)
      return
    }

    // Sort tweets chronologically (oldest to newest) using BigInt safe comparison
    const tweets = [...tweetsList].sort((a, b) => {
      const diff = BigInt(a.id) - BigInt(b.id)
      return diff > 0n ? 1 : (diff < 0n ? -1 : 0)
    })

    for (const tweet of tweets) {
      // Safe BigInt comparison for cursor update
      if (!state.lastSeenId || BigInt(tweet.id) > BigInt(state.lastSeenId)) {
        state.lastSeenId = tweet.id
        await writeFile(STATE_FILE, JSON.stringify(state, null, 2))
      }

      console.log(`\n[STAGE 1 — TWITTER API]`)
      console.log(`Tweet ID: ${tweet.id}`)
      console.log(`Text: "${tweet.text}"\n`)

      const authorUsername = usersMap.get(tweet.author_id) || ''
      // Ignore bot's own tweets or replies
      if (
        (botId && tweet.author_id === botId) ||
        (!authorUsername || authorUsername.toLowerCase() === botHandle.toLowerCase())
      ) {
        console.log(`[Twitter Worker] Skipping bot's own tweet (${tweet.id})`)
        continue
      }

      console.log(`[STAGE 2 — AFTER FILTERING]`)
      console.log(`Tweet ID: ${tweet.id}`)
      console.log(`Text: "${tweet.text}"\n`)

      let imageUrl = ''
      if (tweet.attachments?.media_keys?.length) {
        for (const k of tweet.attachments.media_keys) {
          if (mediaMap.has(k)) {
            imageUrl = mediaMap.get(k)!
            break
          }
        }
      }

      console.log(`[STAGE 3 — SELECTED TWEET]`)
      console.log(`Tweet ID: ${tweet.id}`)
      console.log(`Text: "${tweet.text}"`)
      console.log(`Author: @${authorUsername}\n`)

      const result = await processTweetLaunch({
        tweetId: tweet.id,
        authorHandle: authorUsername,
        authorId: tweet.author_id,
        text: tweet.text,
        imageUrl: imageUrl || undefined,
        createdAt: tweet.created_at,
      })

      if (process.env.TWITTER_API_KEY && process.env.TWITTER_ACCESS_TOKEN && !process.env.TWITTER_DEBUG_ONLY) {
        await postTwitterReply(result.message, tweet.id)
      }
    }
  } catch (err) {
    console.error('[Twitter Worker Error]:', err)
  }
}

async function checkOpenAIHealth(): Promise<{ ok: boolean; message: string }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { ok: false, message: 'OPENAI_API_KEY not set (Using Built-in NLP Engine)' }
  }
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (res.ok) {
      return { ok: true, message: `Connected to OpenAI (${process.env.OPENAI_MODEL || 'gpt-4o-mini'})` }
    } else {
      const err = await res.json().catch(() => ({}))
      return { ok: false, message: `OpenAI Error ${res.status}: ${err.error?.message || 'Invalid API Key'}` }
    }
  } catch (err: any) {
    return { ok: false, message: `OpenAI Connection Error: ${err.message}` }
  }
}

let isListenerStarted = false

if (require.main === module) {
  if (!isListenerStarted) {
    isListenerStarted = true
    console.log(`\n==================================================`)
    console.log(`[Twitter Bot Worker] Started`)
    console.log(`Worker ID: ${WORKER_INSTANCE_ID}`)
    console.log(`PID: ${process.pid}`)
    console.log(`Timestamp: ${new Date().toISOString()}`)
    console.log(`Monitoring: @${(process.env.TWITTER_BOT_HANDLE || 'agent_ponscore').replace('@', '')}`)

    checkOpenAIHealth().then((health) => {
      if (health.ok) {
        console.log(`[AI Engine] 🟢 ${health.message}`)
      } else {
        console.log(`[AI Engine] 🟡 ${health.message}`)
      }
      console.log(`==================================================\n`)
      pollMentions()
      setInterval(pollMentions, 15000)
    })
  }
}
