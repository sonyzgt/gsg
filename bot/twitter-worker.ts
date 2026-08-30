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
  parseUnits,
  formatUnits,
  encodeFunctionData,
  getAddress,
  isAddress,
  decodeEventLog,
  erc20Abi,
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
  inReplyToHandle?: string
  inReplyToTweetId?: string
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

  // Handle SEND / TIP TOKEN Intent
  if (aiResult.intent === 'send_token') {
    await markTweetProcessed(payload.tweetId)
    const targetRecipient = (aiResult.recipientHandle || payload.inReplyToHandle || '').replace('@', '').trim()

    if (!targetRecipient) {
      return {
        success: false,
        message: `@${payload.authorHandle} Please specify a recipient or reply directly to their tweet.\n\nUsage: @agent_ponscore send 500 ponscore to @username`,
      }
    }

    if (targetRecipient.toLowerCase() === cleanHandle) {
      return {
        success: false,
        message: `@${payload.authorHandle} You cannot send tokens to yourself.`,
      }
    }

    const amountStr = aiResult.amount || '0'
    const numAmount = parseFloat(amountStr)
    if (isNaN(numAmount) || numAmount <= 0) {
      return {
        success: false,
        message: `@${payload.authorHandle} Please specify a valid amount to send.\n\nUsage: @agent_ponscore send 500 ponscore to @${targetRecipient}`,
      }
    }

    const rawSymbol = (aiResult.tokenSymbol || 'PONSCORE').toUpperCase()

    // 1. Resolve Recipient Wallet (auto-creates Privy Server Wallet for recipient!)
    const recipientMapping = await getOrCreateTwitterUserWallet('', targetRecipient.toLowerCase())
    if (!recipientMapping?.walletAddress) {
      return {
        success: false,
        message: `@${payload.authorHandle} Failed to initialize server wallet for @${targetRecipient}.`,
      }
    }

    const recipientAddr = getAddress(recipientMapping.walletAddress)
    const senderAddr = getAddress(activeWallet)

    const publicClient = createPublicClient({
      chain: robinhoodChain,
      transport: http('https://robinhood-rpc.publicnode.com'),
    })

    const { getPrivyClient } = await import('@/lib/privy-server')
    const privy = getPrivyClient()
    if (!privy) {
      return {
        success: false,
        message: `@${payload.authorHandle} Server wallet API is currently offline.`,
      }
    }

    const gasPrice = ((await publicClient.getGasPrice()) * 125n) / 100n
    const senderEthBalance = await publicClient.getBalance({ address: senderAddr })

    // ── CASE A: NATIVE ETH TRANSFER ──
    if (rawSymbol === 'ETH' || rawSymbol === 'NATIVE') {
      const valueWei = parseEther(amountStr)
      const estimatedGasCost = gasPrice * 21000n

      if (senderEthBalance < valueWei + estimatedGasCost) {
        return {
          success: false,
          message: `@${payload.authorHandle} Insufficient ETH balance. You have ${formatEther(senderEthBalance)} ETH, but need ~${formatEther(valueWei + estimatedGasCost)} ETH (including gas).`,
        }
      }

      const nonce = await publicClient.getTransactionCount({ address: senderAddr })
      const signRes = await (privy as any).walletApi.ethereum.signTransaction({
        walletId: userWalletMapping.walletId,
        transaction: {
          to: recipientAddr,
          value: `0x${valueWei.toString(16)}`,
          data: '0x',
          chainId: 4663,
          nonce,
          gasLimit: '0x5208', // 21,000 gas
          gasPrice: `0x${gasPrice.toString(16)}`,
          type: 0,
        },
      })

      const txHash = await publicClient.sendRawTransaction({
        serializedTransaction: signRes.signedTransaction as `0x${string}`,
      })

      await publicClient.waitForTransactionReceipt({ hash: txHash })

      return {
        success: true,
        message: `Sent ${amountStr} ETH to @${targetRecipient} on Robinhood Chain.\n\nTX: https://robinhoodchain.blockscout.com/tx/${txHash}`,
        txHash,
      }
    }

    // ── CASE B: ERC20 TOKEN TRANSFER ──
    let tokenContractAddr: `0x${string}` | null = null
    let tokenDecimals = 18
    let tokenSymbol = rawSymbol

    if (isAddress(rawSymbol)) {
      tokenContractAddr = getAddress(rawSymbol)
    } else {
      // Look up in launched_tokens.json
      const REGISTRY_FILE = path.join(process.cwd(), 'data', 'launched_tokens.json')
      let tokensList: any[] = []
      if (existsSync(REGISTRY_FILE)) {
        const raw = await readFile(REGISTRY_FILE, 'utf-8')
        tokensList = JSON.parse(raw)
      }

      // Check known tokens / aliases
      if (rawSymbol === 'PONSCORE') {
        tokenContractAddr = '0xf3734609cAB98Cb4c23Ce7ff6D3F9bF7AeB23ce9'
      } else if (rawSymbol === 'PONS') {
        tokenContractAddr = '0xAaD591FE9536b802139C2a1802236750e1F643e0'
      }

      if (!tokenContractAddr) {
        for (const item of tokensList) {
          const ca = typeof item === 'string' ? item : item?.tokenAddress || item?.address
          if (ca && isAddress(ca)) {
            const sym = typeof item === 'object' ? item.symbol : ''
            if (sym && sym.toUpperCase() === rawSymbol) {
              tokenContractAddr = getAddress(ca)
              tokenSymbol = sym.toUpperCase()
              break
            }
          }
        }
      }

      if (!tokenContractAddr) {
        // Search by symbol on-chain across registry
        for (const item of tokensList) {
          const ca = typeof item === 'string' ? item : item?.tokenAddress || item?.address
          if (ca && isAddress(ca)) {
            try {
              const onChainSym = await publicClient.readContract({
                address: getAddress(ca),
                abi: erc20Abi,
                functionName: 'symbol',
              })
              if (onChainSym.toUpperCase() === rawSymbol) {
                tokenContractAddr = getAddress(ca)
                tokenSymbol = onChainSym.toUpperCase()
                break
              }
            } catch { /* continue */ }
          }
        }
      }
    }

    if (!tokenContractAddr) {
      return {
        success: false,
        message: `@${payload.authorHandle} Token $${rawSymbol} not found on Robinhood Chain.`,
      }
    }

    try {
      tokenDecimals = await publicClient.readContract({
        address: tokenContractAddr,
        abi: erc20Abi,
        functionName: 'decimals',
      }).catch(() => 18)
    } catch { /* default 18 */ }

    const amountWei = parseUnits(amountStr, tokenDecimals)
    const tokenBalance = await publicClient.readContract({
      address: tokenContractAddr,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [senderAddr],
    }).catch(() => 0n)

    if (tokenBalance < amountWei) {
      const formattedBal = formatUnits(tokenBalance, tokenDecimals)
      return {
        success: false,
        message: `@${payload.authorHandle} Insufficient $${tokenSymbol} balance. You have ${formattedBal} $${tokenSymbol}, but tried to send ${amountStr} $${tokenSymbol}.`,
      }
    }

    const estimatedGasCost = gasPrice * 100000n
    if (senderEthBalance < estimatedGasCost) {
      return {
        success: false,
        message: `@${payload.authorHandle} Insufficient ETH in your wallet to cover gas fee (~0.0001 ETH). Please deposit ETH to ${senderAddr}.`,
      }
    }

    const calldata = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipientAddr, amountWei],
    })

    const nonce = await publicClient.getTransactionCount({ address: senderAddr })
    let gasLimit = 100000n
    try {
      const estGas = await publicClient.estimateGas({
        account: senderAddr,
        to: tokenContractAddr,
        data: calldata,
      })
      gasLimit = (estGas * 125n) / 100n
    } catch { /* fallback 100k */ }

    const signRes = await (privy as any).walletApi.ethereum.signTransaction({
      walletId: userWalletMapping.walletId,
      transaction: {
        to: tokenContractAddr,
        value: '0x0',
        data: calldata,
        chainId: 4663,
        nonce,
        gasLimit: `0x${gasLimit.toString(16)}`,
        gasPrice: `0x${gasPrice.toString(16)}`,
        type: 0,
      },
    })

    const txHash = await publicClient.sendRawTransaction({
      serializedTransaction: signRes.signedTransaction as `0x${string}`,
    })

    await publicClient.waitForTransactionReceipt({ hash: txHash })

    return {
      success: true,
      message: `Sent ${amountStr} $${tokenSymbol} to @${targetRecipient} on Robinhood Chain.\n\nTX: https://robinhoodchain.blockscout.com/tx/${txHash}`,
      txHash,
    }
  }

  // Handle BUY / SELL TOKEN Intent (Both Bonding Curve and Uniswap V4 Migrated)
  if (aiResult.intent === 'buy_token' || aiResult.intent === 'sell_token') {
    await markTweetProcessed(payload.tweetId)
    const isBuy = aiResult.intent === 'buy_token'
    const rawSymbol = (aiResult.tokenSymbol || 'PONSCORE').toUpperCase()
    let tokenContractAddr: `0x${string}` | null = null
    let tokenSymbol = rawSymbol

    if (aiResult.tokenAddress && isAddress(aiResult.tokenAddress)) {
      tokenContractAddr = getAddress(aiResult.tokenAddress)
    } else {
      const REGISTRY_FILE = path.join(process.cwd(), 'data', 'launched_tokens.json')
      let tokensList: any[] = []
      if (existsSync(REGISTRY_FILE)) {
        const raw = await readFile(REGISTRY_FILE, 'utf-8')
        tokensList = JSON.parse(raw)
      }

      if (rawSymbol === 'PONSCORE') {
        tokenContractAddr = '0xf3734609cAB98Cb4c23Ce7ff6D3F9bF7AeB23ce9'
      } else if (rawSymbol === 'PONS') {
        tokenContractAddr = '0xAaD591FE9536b802139C2a1802236750e1F643e0'
      }

      if (!tokenContractAddr) {
        for (const item of tokensList) {
          const ca = typeof item === 'string' ? item : item?.tokenAddress || item?.address
          if (ca && isAddress(ca)) {
            const sym = typeof item === 'object' ? item.symbol : ''
            if (sym && sym.toUpperCase() === rawSymbol) {
              tokenContractAddr = getAddress(ca)
              tokenSymbol = sym.toUpperCase()
              break
            }
          }
        }
      }
    }

    if (!tokenContractAddr) {
      return {
        success: false,
        message: `@${payload.authorHandle} Token $${rawSymbol} not found on Robinhood Chain.`,
      }
    }

    const swapAmount = aiResult.amount || (isBuy ? '0.001' : 'all')

    try {
      const swapRes = await fetch('http://localhost:3001/api/launchpad/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          twitterHandle: payload.authorHandle,
          tokenAddress: tokenContractAddr,
          isBuy,
          amount: swapAmount,
          amountType: isBuy ? 'ETH' : (swapAmount === 'all' ? 'ALL' : (swapAmount.includes('%') ? 'PERCENT' : 'TOKEN')),
          percentage: swapAmount.includes('%') ? parseFloat(swapAmount) : (swapAmount === 'all' ? 100 : undefined),
        }),
      })

      const swapJson = await swapRes.json().catch(() => ({}))
      if (!swapRes.ok || !swapJson.success) {
        return {
          success: false,
          message: `@${payload.authorHandle} Swap failed: ${swapJson.error || 'Execution reverted'}`,
        }
      }

      const actionText = isBuy ? `Bought $${tokenSymbol} with ${swapAmount} ETH` : `Sold ${swapAmount} $${tokenSymbol} to ETH`
      const phaseText = swapJson.route === 'UNISWAP_V4' ? 'Uniswap V4 (Migrated)' : 'Bonding Curve'

      return {
        success: true,
        message: `@${payload.authorHandle} ${actionText} on ${phaseText}.\n\nTX: https://robinhoodchain.blockscout.com/tx/${swapJson.txHash}`,
        txHash: swapJson.txHash,
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Swap execution error'
      return {
        success: false,
        message: `@${payload.authorHandle} Swap failed: ${msg}`,
      }
    }
  }

  // Handle Unrecognized or non-launch intent
  if (aiResult.intent !== 'launch_token' || !aiResult.tokenSymbol) {
    console.log(`[Twitter COMMAND REJECTED]`)
    console.log(`Reason: Invalid launch syntax or missing token symbol.\n`)
    await markTweetProcessed(payload.tweetId)
    return {
      success: false,
      message: `@${payload.authorHandle} Usage:\n- @agent_ponscore launch token $TEST [attach image]\n- @agent_ponscore send 500 ponscore to @username\n- @agent_ponscore buy 0.001 eth $PONSCORE\n- @agent_ponscore sell all $PONSCORE\n- @agent_ponscore check balance`,
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
      const inReplyToUserId = tweet.in_reply_to_user_id
      const inReplyToHandle = inReplyToUserId ? usersMap.get(inReplyToUserId) : undefined

      const result = await processTweetLaunch({
        tweetId: tweet.id,
        authorHandle: authorUsername,
        authorId: tweet.author_id,
        text: tweet.text,
        imageUrl: imageUrl || undefined,
        createdAt: tweet.created_at,
        inReplyToHandle,
        inReplyToTweetId: tweet.in_reply_to_tweet_id,
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

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
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
