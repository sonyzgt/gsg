import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, parseEther, formatEther, isAddress, getAddress } from 'viem'
import { robinhoodChain } from '@/lib/chains'
import { getPrivyClient } from '@/lib/privy-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { twitterHandle, address, destinationAddress, amountEth } = body

    if ((!twitterHandle && !address) || !destinationAddress || !isAddress(destinationAddress)) {
      return NextResponse.json({ error: 'Valid twitterHandle or address and destinationAddress required' }, { status: 400 })
    }

    const { getOrCreateTwitterUserWallet } = await import('@/lib/privy-server')
    const mapping = await getOrCreateTwitterUserWallet(
      '',
      twitterHandle ? twitterHandle.replace('@', '') : ''
    )

    const senderAddress = mapping?.walletAddress || address
    const senderWalletId = mapping?.walletId

    if (!senderAddress || !senderWalletId) {
      return NextResponse.json({ error: 'Sender wallet not found or not a server wallet' }, { status: 404 })
    }

    const publicClient = createPublicClient({
      chain: robinhoodChain,
      transport: http('https://robinhood-rpc.publicnode.com'),
    })

    const balance = await publicClient.getBalance({ address: senderAddress })
    const rawGasPrice = await publicClient.getGasPrice()
    const gasPrice = (rawGasPrice * 125n) / 100n
    const gasLimit = 21000n
    const gasCost = gasPrice * gasLimit

    if (balance <= gasCost) {
      return NextResponse.json({ error: 'Insufficient balance to cover transfer and gas fee' }, { status: 400 })
    }

    const maxWithdrawable = balance - gasCost
    const sendAmount = amountEth ? parseEther(String(amountEth)) : maxWithdrawable

    if (sendAmount > maxWithdrawable || sendAmount <= 0n) {
      return NextResponse.json({
        error: `Transfer amount exceeds maximum available (${formatEther(maxWithdrawable)} ETH)`,
      }, { status: 400 })
    }

    const privy = getPrivyClient()
    if (!privy) {
      return NextResponse.json({ error: 'Privy server client not configured' }, { status: 500 })
    }

    const nonce = await publicClient.getTransactionCount({ address: senderAddress })

    const signRes = await privy.walletApi.ethereum.signTransaction({
      walletId: senderWalletId,
      transaction: {
        to: getAddress(destinationAddress),
        value: `0x${sendAmount.toString(16)}`,
        chainId: 4663,
        nonce,
        gasLimit: '0x5208', // 21,000 gas
        gasPrice: `0x${gasPrice.toString(16)}`,
        type: 0,
      }
    })

    const txHash = await publicClient.sendRawTransaction({
      serializedTransaction: signRes.signedTransaction as `0x${string}`,
    })

    await publicClient.waitForTransactionReceipt({ hash: txHash })

    return NextResponse.json({
      success: true,
      txHash,
      withdrawnEth: formatEther(sendAmount),
      destinationAddress: getAddress(destinationAddress),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Withdrawal failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
