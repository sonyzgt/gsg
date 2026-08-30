import { NextRequest, NextResponse } from 'next/server'
import {
  createPublicClient,
  http,
  parseEther,
  formatEther,
  encodeFunctionData,
  getAddress,
  isAddress,
  zeroAddress,
  parseEventLogs,
} from 'viem'
import { robinhoodChain } from '@/lib/chains'
import { getPrivyClient } from '@/lib/privy-server'
import {
  PONS_V2_FACTORY,
  LAUNCH_AND_BUY_ROUTER,
  FACTORY_ABI,
  LAUNCH_AND_BUY_ABI,
  getLaunchFee,
  getPreviewLaunchEconomics,
  generateRandomSalt,
} from '@/lib/pons-v2'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

const LAUNCHED_TOKENS_FILE = path.join(process.cwd(), 'data', 'launched_tokens.json')

function saveLaunchedToken(entry: {
  tokenAddress: string
  curveAddress: string
  name: string
  symbol: string
  logo: string
  description: string
  deployer: string
  createdAt: number
  txHash: string
}) {
  try {
    let tokens: any[] = []
    if (fs.existsSync(LAUNCHED_TOKENS_FILE)) {
      const raw = fs.readFileSync(LAUNCHED_TOKENS_FILE, 'utf-8')
      tokens = JSON.parse(raw)
    }
    const exists = tokens.some((t) => t.tokenAddress?.toLowerCase() === entry.tokenAddress.toLowerCase())
    if (!exists) {
      tokens.unshift(entry)
      fs.writeFileSync(LAUNCHED_TOKENS_FILE, JSON.stringify(tokens, null, 2))
    }
  } catch (err) {
    console.error('[Launch API] Failed to save token to launched_tokens.json:', err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      twitterHandle,
      address,
      name,
      symbol,
      logo = '',
      description = '',
      socials = {},
      creatorTaxBps = 100,
      buybackEnabled = false,
      initialBuyEth = '0',
      extraExemptions = '',
    } = body

    if (!name?.trim() || !symbol?.trim()) {
      return NextResponse.json({ error: 'Token Name and Symbol are required' }, { status: 400 })
    }

    if (!twitterHandle && !address) {
      return NextResponse.json({ error: 'Missing user identification' }, { status: 400 })
    }

    // Resolve Privy Server Wallet
    const { getOrCreateTwitterUserWallet } = await import('@/lib/privy-server')
    const { getBotUsers } = await import('@/lib/bot-wallet')
    const users = await getBotUsers()
    const foundUser = users.find(
      (u) =>
        (address && u.walletAddress?.toLowerCase() === address.toLowerCase()) ||
        (twitterHandle && u.twitterHandle?.toLowerCase() === twitterHandle.replace('@', '').toLowerCase())
    )

    let senderAddress = foundUser?.walletAddress || address
    let senderWalletId = (foundUser as any)?.walletId

    if (!senderWalletId && twitterHandle) {
      const mapping = await getOrCreateTwitterUserWallet('', twitterHandle.replace('@', ''))
      if (mapping) {
        senderAddress = mapping.walletAddress
        senderWalletId = mapping.walletId
      }
    }

    if (!senderAddress || !senderWalletId) {
      return NextResponse.json({ error: 'Server wallet not found' }, { status: 404 })
    }

    const publicClient = createPublicClient({
      chain: robinhoodChain,
      transport: http('https://robinhood-rpc.publicnode.com'),
    })

    const privy = getPrivyClient()
    if (!privy) {
      return NextResponse.json({ error: 'Privy server client not configured' }, { status: 500 })
    }

    const userAddr = getAddress(senderAddress)
    const exactLaunchFee = await getLaunchFee()
    const initialBuyNum = parseFloat(initialBuyEth) || 0
    const initialBuyWei = initialBuyNum > 0 ? parseEther(String(initialBuyEth)) : 0n
    const totalRequiredValue = exactLaunchFee + initialBuyWei

    // Check balance
    const balance = await publicClient.getBalance({ address: userAddr })
    const rawGasPrice = await publicClient.getGasPrice()
    const gasPrice = (rawGasPrice * 125n) / 100n
    const estimatedGasCost = gasPrice * 1200000n // ~1.2M gas for deployment + buy

    if (balance < totalRequiredValue + estimatedGasCost) {
      return NextResponse.json(
        {
          error: `Insufficient ETH balance (${formatEther(balance)} ETH). Required: ~${formatEther(
            totalRequiredValue + estimatedGasCost
          )} ETH (including gas fee).`,
        },
        { status: 400 }
      )
    }

    // Prepare metadata
    const FALLBACK_LOGO = 'https://ponscore.fun/sparkle-logo.svg'
    let finalLogo = logo?.trim() || ''
    if (finalLogo.startsWith('/')) finalLogo = `https://ponscore.fun${finalLogo}`
    if (finalLogo.startsWith('ipfs://')) finalLogo = `https://ipfs.io/ipfs/${finalLogo.replace('ipfs://', '')}`
    if (!finalLogo || !finalLogo.startsWith('https://') || finalLogo.length > 200) {
      finalLogo = FALLBACK_LOGO
    }

    const salt = generateRandomSalt()
    const launchConfigId = 0n
    const pairToken = zeroAddress
    const expectedEconomics = await getPreviewLaunchEconomics(launchConfigId, pairToken)

    const tokenParams = {
      name: name.trim().slice(0, 32),
      symbol: symbol.trim().toUpperCase().slice(0, 10),
      logo: finalLogo,
      description: description.trim().slice(0, 280) || `${name} fair launched on Pons v2`,
      socials: {
        twitter: (socials.twitter || '').trim().slice(0, 100),
        telegram: (socials.telegram || '').trim().slice(0, 100),
        discord: (socials.discord || '').trim().slice(0, 100),
        website: (socials.website || '').trim().slice(0, 100),
        farcaster: (socials.farcaster || '').trim().slice(0, 100),
      },
      creatorFeeRecipient: userAddr,
      creatorTaxBps: Math.min(1000, Math.max(0, Number(creatorTaxBps) || 100)),
      buybackEnabled: !!buybackEnabled,
      expectedEconomics,
      salt,
    }

    const parsedExemptions: `0x${string}`[] = []
    if (extraExemptions && typeof extraExemptions === 'string') {
      const list = extraExemptions.split(',').map((s) => s.trim())
      for (const item of list) {
        if (isAddress(item)) parsedExemptions.push(getAddress(item))
      }
    }

    let targetTo: `0x${string}`
    let calldata: `0x${string}`
    let txValue: bigint

    if (initialBuyNum > 0) {
      targetTo = LAUNCH_AND_BUY_ROUTER
      txValue = totalRequiredValue
      calldata = encodeFunctionData({
        abi: LAUNCH_AND_BUY_ABI,
        functionName: 'launchAndBuy',
        args: [
          tokenParams,
          launchConfigId,
          pairToken,
          initialBuyWei,
          0n,
          userAddr,
          parsedExemptions,
        ],
      })
    } else {
      targetTo = PONS_V2_FACTORY
      txValue = exactLaunchFee
      if (parsedExemptions.length > 0) {
        calldata = encodeFunctionData({
          abi: FACTORY_ABI,
          functionName: 'launchToken',
          args: [tokenParams, launchConfigId, pairToken, parsedExemptions],
        })
      } else {
        calldata = encodeFunctionData({
          abi: FACTORY_ABI,
          functionName: 'launchToken',
          args: [tokenParams, launchConfigId, pairToken],
        })
      }
    }

    const nonce = await publicClient.getTransactionCount({ address: userAddr })

    let gasLimit: bigint
    try {
      const estGas = await publicClient.estimateGas({
        account: userAddr,
        to: targetTo,
        value: txValue,
        data: calldata,
      })
      gasLimit = (estGas * 125n) / 100n
    } catch {
      gasLimit = 850000n
    }

    const signRes = await privy.walletApi.ethereum.signTransaction({
      walletId: senderWalletId,
      transaction: {
        to: targetTo,
        value: `0x${txValue.toString(16)}`,
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

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      retryCount: 30,
      timeout: 90_000,
    })

    let deployedTokenCa = ''
    let deployedCurveCa = ''

    // 1. Try parseEventLogs with FACTORY_ABI
    try {
      const launchedEvents = parseEventLogs({
        abi: FACTORY_ABI,
        eventName: 'TokenLaunched',
        logs: receipt.logs,
      })
      if (launchedEvents.length > 0 && launchedEvents[0].args.token) {
        deployedTokenCa = getAddress(launchedEvents[0].args.token)
        if (launchedEvents[0].args.curve) {
          deployedCurveCa = getAddress(launchedEvents[0].args.curve)
        }
      }
    } catch {
      /* continue */
    }

    // 2. Direct Topic0 match: 0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607
    if (!deployedTokenCa) {
      for (const log of receipt.logs) {
        if (
          log.topics &&
          log.topics.length >= 3 &&
          log.topics[0]?.toLowerCase() ===
            '0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607'.toLowerCase()
        ) {
          try {
            const rawToken = log.topics[1]
            const rawCurve = log.topics[2]
            if (rawToken && rawToken.length >= 26) {
              deployedTokenCa = getAddress('0x' + rawToken.slice(26))
            }
            if (rawCurve && rawCurve.length >= 26) {
              deployedCurveCa = getAddress('0x' + rawCurve.slice(26))
            }
            if (deployedTokenCa && deployedTokenCa !== zeroAddress) break
          } catch {
            /* continue */
          }
        }
      }
    }

    if (!deployedTokenCa) {
      return NextResponse.json(
        {
          error: 'Transaction succeeded but could not extract token address. TxHash: ' + txHash,
          txHash,
        },
        { status: 500 }
      )
    }

    saveLaunchedToken({
      tokenAddress: deployedTokenCa,
      curveAddress: deployedCurveCa,
      name: tokenParams.name,
      symbol: tokenParams.symbol,
      logo: tokenParams.logo,
      description: tokenParams.description,
      deployer: userAddr,
      createdAt: Date.now(),
      txHash,
    })

    return NextResponse.json({
      success: true,
      tokenAddress: deployedTokenCa,
      curveAddress: deployedCurveCa,
      txHash,
      message: `Token $${tokenParams.symbol} successfully launched!`,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Launch failed'
    console.error('[Launch API Error]:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
