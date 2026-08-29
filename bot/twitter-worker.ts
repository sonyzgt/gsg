import { createWalletClient, createPublicClient, http, parseEther, formatEther, getAddress, parseAbi, decodeEventLog } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { robinhoodChain } from '../lib/chains'
import { getBotUsers, decryptPrivateKey, saveBotUsers, BotUser } from '../lib/bot-wallet'
import path from 'path'
import { readFile, writeFile } from 'fs/promises'

const FACTORY_ADDRESS = '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e' as `0x${string}`
const LAUNCH_FEE = parseEther('0.0005')
const REGISTRY_FILE = path.join(process.cwd(), 'data', 'launched_tokens.json')

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
  // Regex to detect: @ponscorebot launch $TICKER Name Description
  // Or: launch $TICKER Name
  const clean = text.replace(/@w+/g, '').trim()
  const tickerMatch = clean.match(/\$([A-Za-z0-9_]{2,15})/i) || clean.match(/(?:launch|deploy)\s+([A-Za-z0-9_]{2,15})/i)
  
  if (!tickerMatch) return null
  const symbol = tickerMatch[1].toUpperCase()

  // Extract name and description around the ticker
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

  // Check deposit wallet balance
  const balance = await publicClient.getBalance({ address: user.walletAddress })
  const requiredBalance = LAUNCH_FEE + parseEther('0.0003') // 0.0005 fee + gas buffer

  if (balance < requiredBalance) {
    return {
      success: false,
      message: `@${payload.authorHandle} Your deposit wallet (${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}) has insufficient ETH (${formatEther(balance)} ETH). Top up at least 0.001 ETH at https://ponscore.app/bot`,
    }
  }

  // Decrypt user's deposit wallet private key
  const privateKey = decryptPrivateKey(user.encryptedPrivateKey, user.iv, user.tag)
  const account = privateKeyToAccount(privateKey)

  const walletClient = createWalletClient({
    account,
    chain: robinhoodChain,
    transport: http('https://robinhood-rpc.publicnode.com'),
  })

  // Prepare IPFS Metadata URI
  const metadataUri = parsed.imageUrl

  console.log(`[Bot Worker] Launching $${parsed.symbol} for @${payload.authorHandle} on Robinhood Chain...`)

  // Call Pons v2 Factory launchToken
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
        '0x0000000000000000000000000000000000000000', // Native ETH pair
        0, // 0% pool fee
        200, // 200 tick spacing
        100, // 1% creator tax
      ],
    }),
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

  // Extract deployed token address from logs
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

  // Save to launched tokens database
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

  // Update user stats
  user.totalLaunches = (user.totalLaunches || 0) + 1
  await saveBotUsers(users)

  const successMessage = `$${parsed.symbol} is live on Robinhood Chain.\n\nToken: ${deployedTokenCa || 'Success'}\nCreator: @${payload.authorHandle}\nTrade: https://ponscore.app/token/${deployedTokenCa}\nExplorer: https://robinhoodchain.blockscout.com/tx/${txHash}`

  return {
    success: true,
    message: successMessage,
    tokenAddress: deployedTokenCa,
    txHash,
  }
}
