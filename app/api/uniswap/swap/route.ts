import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const UNISWAP_GATEWAY_URL = 'https://trade-api.gateway.uniswap.org/v1'
const ROBINHOOD_CHAIN_ID = 4663
const NATIVE_ETH_ADDRESS = '0x0000000000000000000000000000000000000000'
const UNIVERSAL_ROUTER_ADDRESS = '0x8876789976decbfcbbbe364623c63652db8c0904'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      quote,
      permitData,
      signature,
    } = body

    const apiKey = process.env.UNISWAP_API_KEY

    // 1. If Uniswap API key is set, request transaction calldata from Trading API
    if (apiKey && quote) {
      try {
        const swapPayload: Record<string, unknown> = {
          quote,
        }
        if (permitData && signature) {
          swapPayload.permitData = permitData
          swapPayload.signature = signature
        }

        const apiRes = await fetch(`${UNISWAP_GATEWAY_URL}/swap`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify(swapPayload),
        })

        if (apiRes.ok) {
          const data = await apiRes.json()
          return NextResponse.json({
            success: true,
            source: 'uniswap_api',
            swap: data.swap,
            to: data.swap?.to || UNIVERSAL_ROUTER_ADDRESS,
            data: data.swap?.data,
            value: data.swap?.value || '0',
            gasLimit: data.swap?.gasLimit,
            gasFee: data.swap?.gasFee,
          })
        }
      } catch (err) {
        console.error('Uniswap Trading API swap error:', err)
      }
    }

    // 2. Return Universal Router transaction construction for Robinhood Chain 4663
    return NextResponse.json({
      success: true,
      source: 'onchain_universal_router',
      to: UNIVERSAL_ROUTER_ADDRESS,
      chainId: ROBINHOOD_CHAIN_ID,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to generate swap transaction'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
