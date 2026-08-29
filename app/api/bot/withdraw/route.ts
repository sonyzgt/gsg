import { NextRequest, NextResponse } from 'next/server'
import { getBotUsers, decryptPrivateKey } from '@/lib/bot-wallet'
import { createWalletClient, createPublicClient, http, parseEther, formatEther, isAddress, getAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { robinhoodChain } from '@/lib/chains'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { twitterHandle, destinationAddress, amountEth } = body

    if (!twitterHandle || !destinationAddress || !isAddress(destinationAddress)) {
      return NextResponse.json({ error: 'Valid twitterHandle and destinationAddress required' }, { status: 400 })
    }

    const users = await getBotUsers()
    const cleanHandle = twitterHandle.replace('@', '').toLowerCase()
    const found = users.find(u => u.twitterHandle.toLowerCase() === cleanHandle)

    if (!found) {
      return NextResponse.json({ error: 'User wallet not found' }, { status: 404 })
    }

    const privateKey = decryptPrivateKey(found.encryptedPrivateKey, found.iv, found.tag)
    const account = privateKeyToAccount(privateKey)

    const publicClient = createPublicClient({
      chain: robinhoodChain,
      transport: http('https://robinhood-rpc.publicnode.com'),
    })

    const balance = await publicClient.getBalance({ address: found.walletAddress })
    const gasReserve = parseEther('0.0001') // Gas reserve for transaction

    if (balance <= gasReserve) {
      return NextResponse.json({ error: 'Insufficient balance to cover withdrawal and gas fee' }, { status: 400 })
    }

    const maxWithdrawable = balance - gasReserve
    const sendAmount = amountEth ? parseEther(String(amountEth)) : maxWithdrawable

    if (sendAmount > maxWithdrawable || sendAmount <= 0n) {
      return NextResponse.json({
        error: `Withdrawal amount exceeds maximum available (${formatEther(maxWithdrawable)} ETH)`,
      }, { status: 400 })
    }

    const walletClient = createWalletClient({
      account,
      chain: robinhoodChain,
      transport: http('https://robinhood-rpc.publicnode.com'),
    })

    const hash = await walletClient.sendTransaction({
      to: getAddress(destinationAddress),
      value: sendAmount,
    })

    await publicClient.waitForTransactionReceipt({ hash })

    return NextResponse.json({
      success: true,
      txHash: hash,
      withdrawnEth: formatEther(sendAmount),
      destinationAddress: getAddress(destinationAddress),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Withdrawal failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
