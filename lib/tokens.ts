export interface Token {
  symbol: string
  name: string
  decimals: number
  address?: `0x${string}` // undefined untuk native ETH di Robinhood Chain
  icon: string
  usdPrice?: number
  priceNative?: number // Harga dalam satuan ETH (misal: 0.00000008398 ETH per token)
  poolFee?: number // Pool fee tier untuk SushiSwap / Uniswap V3 (10000, 3000, 500, 100)
}

/**
 * Token native utama jaringan Robinhood Chain
 */
export const NATIVE_ROBINHOOD_ETH: Token = {
  symbol: 'ETH',
  name: 'Robinhood Ether',
  decimals: 18,
  icon: '/logo.svg',
  usdPrice: 2500.0,
  priceNative: 1.0,
}

export const USDG_TOKEN: Token = {
  symbol: 'USDG',
  name: 'Global Dollar',
  decimals: 6,
  address: '0x5fc5360d0400a0fd4f2af552add042d716f1d168',
  icon: '/logo.svg',
  usdPrice: 1.0,
  priceNative: 1 / 2500,
}

export const ROBINHOOD_TOKENS: Token[] = [
  NATIVE_ROBINHOOD_ETH,
  USDG_TOKEN,
]

export function calculateRealSwapOutput(
  isBuy: boolean, // true: ETH -> Token, false: Token -> ETH
  token: Token,
  inputAmount: number,
  slippage: number = 0.5,
  ethUsdPrice: number = 2500
) {
  if (!inputAmount || isNaN(inputAmount) || inputAmount <= 0) {
    return { outputAmount: '0.00', rate: 0, minReceived: '0.00', fromValueUsd: 0, toValueUsd: 0 }
  }

  const tokenEthPrice = token.priceNative && token.priceNative > 0 ? token.priceNative : 0.000001
  const tokenUsdPrice = token.usdPrice && token.usdPrice > 0 ? token.usdPrice : tokenEthPrice * ethUsdPrice

  let rawOutput = 0
  let rate = 0
  let fromValueUsd = 0
  let toValueUsd = 0

  if (isBuy) {
    // Beli Token dengan ETH: output = inputEth / priceNative
    rate = 1 / tokenEthPrice // Berapa token per 1 ETH
    rawOutput = inputAmount * rate
    fromValueUsd = inputAmount * ethUsdPrice
    toValueUsd = rawOutput * tokenUsdPrice
  } else {
    // Jual Token ke ETH: output = inputToken * priceNative
    rate = tokenEthPrice // Berapa ETH per 1 Token
    rawOutput = inputAmount * rate
    fromValueUsd = inputAmount * tokenUsdPrice
    toValueUsd = rawOutput * ethUsdPrice
  }

  // Fee DEX pool (0.3% / 1%)
  const feePercent = token.poolFee ? token.poolFee / 1000000 : 0.003
  const outputAfterFee = rawOutput * (1 - feePercent)
  const minReceived = outputAfterFee * (1 - slippage / 100)

  return {
    outputAmount: isBuy
      ? outputAfterFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
      : outputAfterFee.toFixed(6),
    minReceived: isBuy
      ? minReceived.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
      : minReceived.toFixed(6),
    rate,
    fromValueUsd,
    toValueUsd,
  }
}
