import { NextRequest, NextResponse } from 'next/server'
import {
  encodeAbiParameters,
  encodeFunctionData,
  parseAbi,
  getAddress,
} from 'viem'

export const dynamic = 'force-dynamic'

const UNISWAP_GATEWAY_URL = 'https://trade-api.gateway.uniswap.org/v1'
const ROBINHOOD_CHAIN_ID = 4663
const NATIVE_ETH = '0x0000000000000000000000000000000000000000'
const UNIVERSAL_ROUTER = '0x8876789976decbfcbbbe364623c63652db8c0904' as `0x${string}`
const MEME_HOOK = '0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044' as `0x${string}`

const UR_ABI = parseAbi([
  'function execute(bytes commands, bytes[] inputs, uint256 deadline) payable',
])

function buildV4SwapCalldata({
  isBuy,
  tokenAddress,
  amountIn,
  minAmountOut,
  deadline,
  hookAddress = MEME_HOOK,
  fee = 0,
  tickSpacing = 200,
}: {
  isBuy: boolean
  tokenAddress: string
  amountIn: string
  minAmountOut: string
  deadline: number
  hookAddress?: string
  fee?: number
  tickSpacing?: number
}) {
  const token = getAddress(tokenAddress)
  const currency0 = NATIVE_ETH
  const currency1 = token
  const zeroForOne = isBuy

  // Action 0: SWAP_EXACT_IN_SINGLE (0x06)
  const swapParam = encodeAbiParameters(
    [
      {
        name: 'ExactInputSingleParams',
        type: 'tuple',
        components: [
          {
            name: 'poolKey',
            type: 'tuple',
            components: [
              { name: 'currency0', type: 'address' },
              { name: 'currency1', type: 'address' },
              { name: 'fee', type: 'uint24' },
              { name: 'tickSpacing', type: 'int24' },
              { name: 'hooks', type: 'address' },
            ],
          },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'amountIn', type: 'uint128' },
          { name: 'amountOutMinimum', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    [
      {
        poolKey: {
          currency0,
          currency1,
          fee,
          tickSpacing,
          hooks: getAddress(hookAddress),
        },
        zeroForOne,
        amountIn: BigInt(amountIn),
        amountOutMinimum: BigInt(minAmountOut || '1'),
        hookData: '0x',
      },
    ]
  )

  // Action 1: SETTLE / SETTLE_ALL
  // For BUY: Action 0x0c (SETTLE_ALL) with Native ETH from msg.value
  // For SELL: Action 0x0b (SETTLE) with ERC20 token and payerIsUser = true (pulled via Permit2)
  let actions: `0x${string}` = '0x060c0f'
  let settleParam: `0x${string}`

  if (isBuy) {
    actions = '0x060c0f'
    settleParam = encodeAbiParameters(
      [
        { name: 'currency', type: 'address' },
        { name: 'maxAmount', type: 'uint256' },
      ],
      [currency0, BigInt(amountIn)]
    )
  } else {
    actions = '0x060b0f'
    settleParam = encodeAbiParameters(
      [
        { name: 'currency', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'payerIsUser', type: 'bool' },
      ],
      [currency1, BigInt(amountIn), true]
    )
  }

  // Action 2: TAKE_ALL (0x0f) -> (currency, minAmount)
  const outputCurrency = zeroForOne ? currency1 : currency0
  const takeParam = encodeAbiParameters(
    [
      { name: 'currency', type: 'address' },
      { name: 'minAmount', type: 'uint256' },
    ],
    [outputCurrency, BigInt(minAmountOut || '1')]
  )

  // Universal Router Command 0x10 (V4_SWAP)
  const commands = '0x10'

  const v4Input = encodeAbiParameters(
    [
      { name: 'actions', type: 'bytes' },
      { name: 'params', type: 'bytes[]' },
    ],
    [actions, [swapParam, settleParam, takeParam]]
  )

  return encodeFunctionData({
    abi: UR_ABI,
    functionName: 'execute',
    args: [commands, [v4Input], BigInt(deadline)],
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      isBuy,
      tokenAddress,
      amountIn,
      minAmountOut = '1',
      deadline = Math.floor(Date.now() / 1000) + 1200,
      hookAddress,
      fee = 0,
      tickSpacing = 200,
    } = body

    if (!tokenAddress || !amountIn) {
      return NextResponse.json(
        { error: 'Missing required parameters: tokenAddress, amountIn' },
        { status: 400 }
      )
    }

    const apiKey = process.env.UNISWAP_API_KEY

    // 1. If Uniswap API key is set, attempt Trading API transaction construction
    if (apiKey && body.quote) {
      try {
        const apiRes = await fetch(`${UNISWAP_GATEWAY_URL}/swap`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({ quote: body.quote }),
        })

        if (apiRes.ok) {
          const data = await apiRes.json()
          return NextResponse.json({
            success: true,
            source: 'uniswap_trading_api',
            to: data.swap?.to || UNIVERSAL_ROUTER,
            data: data.swap?.data,
            value: data.swap?.value || (isBuy ? amountIn : '0'),
            gasLimit: data.swap?.gasLimit || '250000',
          })
        }
      } catch (err) {
        console.error('Uniswap Trading API swap error:', err)
      }
    }

    // 2. On-chain Verified Uniswap v4 Universal Router 2.1.1 Calldata
    const calldata = buildV4SwapCalldata({
      isBuy: !!isBuy,
      tokenAddress,
      amountIn: String(amountIn),
      minAmountOut: String(minAmountOut),
      deadline: Number(deadline),
      hookAddress: hookAddress || MEME_HOOK,
      fee: Number(fee),
      tickSpacing: Number(tickSpacing),
    })

    return NextResponse.json({
      success: true,
      source: 'uniswap_v4_universal_router',
      to: UNIVERSAL_ROUTER,
      data: calldata,
      value: isBuy ? String(amountIn) : '0',
      chainId: ROBINHOOD_CHAIN_ID,
      gasLimit: '250000',
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to generate swap transaction'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
