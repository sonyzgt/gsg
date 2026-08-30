import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, encodeFunctionData, formatEther } from 'viem'
import { robinhoodChain } from '@/lib/chains'
import { FEE_ESCROW, FEE_ESCROW_ABI } from '@/lib/pons-v2'
import { getPrivyClient } from '@/lib/privy-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { twitterHandle, address } = body

    if (!twitterHandle && !address) {
      return NextResponse.json({ error: 'twitterHandle or address required' }, { status: 400 })
    }

    const { getOrCreateTwitterUserWallet } = await import('@/lib/privy-server')
    const mapping = await getOrCreateTwitterUserWallet(
      '',
      twitterHandle ? twitterHandle.replace('@', '') : ''
    )

    const targetAddress = mapping?.walletAddress || address
    const targetWalletId = mapping?.walletId

    if (!targetAddress) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    }

    const publicClient = createPublicClient({
      chain: robinhoodChain,
      transport: http('https://robinhood-rpc.publicnode.com'),
    })

    // Check unclaimed balance
    const claimableWei = await publicClient.readContract({
      address: FEE_ESCROW,
      abi: FEE_ESCROW_ABI,
      functionName: 'balanceOf',
      args: [targetAddress],
    }).catch(() => 0n)

    if (claimableWei === 0n) {
      return NextResponse.json({ error: 'No claimable fees available for this wallet' }, { status: 400 })
    }

    const balance = await publicClient.getBalance({ address: targetAddress })
    const rawGasPrice = await publicClient.getGasPrice()
    const gasPrice = (rawGasPrice * 125n) / 100n
    const estimatedGasCost = gasPrice * 100000n

    if (balance < estimatedGasCost) {
      return NextResponse.json({
        error: `Insufficient gas balance in wallet (${formatEther(balance)} ETH). Need at least ${formatEther(estimatedGasCost)} ETH to pay network gas fee.`,
      }, { status: 400 })
    }

    const privy = getPrivyClient()
    if (!privy || !targetWalletId) {
      return NextResponse.json({ error: 'Server wallet signer unavailable' }, { status: 500 })
    }

    const nonce = await publicClient.getTransactionCount({ address: targetAddress })
    const calldata = encodeFunctionData({
      abi: FEE_ESCROW_ABI,
      functionName: 'claim',
    })

    const signRes = await privy.walletApi.ethereum.signTransaction({
      walletId: targetWalletId,
      transaction: {
        to: FEE_ESCROW,
        value: '0x0',
        data: calldata,
        chainId: 4663,
        nonce,
        gasLimit: '0x186A0', // 100,000 gas
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
      claimedEth: formatEther(claimableWei),
      message: `Successfully claimed ${formatEther(claimableWei)} ETH!`,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Claim failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
