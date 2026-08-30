import { NextRequest, NextResponse } from 'next/server'
import { isAddress, getAddress, createPublicClient, http, erc20Abi, formatUnits } from 'viem'
import { robinhoodChain } from '@/lib/chains'
import { parseChatMessageWithAI, ParsedActionData } from '@/lib/chat-agent'
import { getPonsTokenInfo, PonsV2TokenInfo } from '@/lib/pons-v2'

export const dynamic = 'force-dynamic'

const client = createPublicClient({
  chain: robinhoodChain,
  transport: http('https://robinhood-rpc.publicnode.com'),
})

interface UserHolding {
  tokenAddress: `0x${string}`
  name: string
  symbol: string
  decimals: number
  balanceRaw: bigint
  balanceFormatted: string
  balanceNum: number
  info: PonsV2TokenInfo | null
}

async function getUserTokenHoldings(userAddr: `0x${string}`): Promise<UserHolding[]> {
  try {
    const { readFile } = await import('fs/promises')
    const path = await import('path')
    const regFile = path.join(process.cwd(), 'data', 'launched_tokens.json')
    const rawReg = await readFile(regFile, 'utf-8').catch(() => '[]')
    const regTokens: any[] = JSON.parse(rawReg)

    const uniqueAddrs = new Set<string>()
    for (const item of regTokens) {
      const addr = typeof item === 'string' ? item : item?.tokenAddress || item?.address
      if (addr && isAddress(addr)) {
        uniqueAddrs.add(getAddress(addr))
      }
    }

    const holdingResults = await Promise.all(
      Array.from(uniqueAddrs).map(async (addr) => {
        try {
          const cleanAddr = getAddress(addr)
          const bal = await client.readContract({
            address: cleanAddr,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [userAddr],
          }).catch(() => 0n)

          if (bal > 0n) {
            const [name, symbol, decimals, info] = await Promise.all([
              client.readContract({ address: cleanAddr, abi: erc20Abi, functionName: 'name' }).catch(() => 'Token'),
              client.readContract({ address: cleanAddr, abi: erc20Abi, functionName: 'symbol' }).catch(() => 'TKN'),
              client.readContract({ address: cleanAddr, abi: erc20Abi, functionName: 'decimals' }).catch(() => 18),
              getPonsTokenInfo(cleanAddr).catch(() => null),
            ])
            const formatted = formatUnits(bal, decimals)
            const num = parseFloat(formatted)
            return {
              tokenAddress: cleanAddr,
              name,
              symbol,
              decimals,
              balanceRaw: bal,
              balanceFormatted: num >= 1000 ? num.toLocaleString(undefined, { maximumFractionDigits: 2 }) : num.toFixed(4),
              balanceNum: num,
              info,
            }
          }
        } catch {
          return null
        }
        return null
      })
    )

    return holdingResults.filter((h): h is UserHolding => h !== null)
  } catch (err) {
    console.error('Failed to get user token holdings:', err)
    return []
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { message, history = [], userAddress: rawUserAddress, userTwitter } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Resolve user address (external or server wallet)
    let activeUserAddress = rawUserAddress && isAddress(rawUserAddress) ? getAddress(rawUserAddress) : undefined
    if (!activeUserAddress && userTwitter) {
      try {
        const { getBotUsers } = await import('@/lib/bot-wallet')
        const users = await getBotUsers()
        const found = users.find((u) => u.twitterHandle?.toLowerCase() === userTwitter.replace('@', '').toLowerCase())
        if (found?.walletAddress && isAddress(found.walletAddress)) {
          activeUserAddress = getAddress(found.walletAddress)
        }
      } catch { /* ignore */ }
    }

    // 1. AI & Deterministic Parse
    let { replyText, action } = await parseChatMessageWithAI(message, history)

    // 2. Token Holdings Auto-Discovery for SELL ALL / MY TOKENS
    const isTokensQuery = /\b(my tokens|token yang saya punya|token saya|holdings|portfolio|cek token|check token|my coins)\b/i.test(message)

    if (activeUserAddress) {
      const holdings = await getUserTokenHoldings(activeUserAddress)

      // A. If user asked for portfolio / token holdings
      if (isTokensQuery || (action?.intent === 'WALLET_QUERY' && /token/i.test(message))) {
        if (holdings.length === 0) {
          replyText = `No token holdings found in your wallet (${activeUserAddress.slice(0, 6)}...${activeUserAddress.slice(-4)}). You currently only hold ETH.`
          action = {
            intent: 'WALLET_QUERY',
            confidence: 1.0,
          }
        } else {
          const listStr = holdings.map((h) => `- ${h.balanceFormatted} $${h.symbol} (${h.tokenAddress.slice(0, 6)}...${h.tokenAddress.slice(-4)})`).join('\n')
          replyText = `Found ${holdings.length} token holding${holdings.length > 1 ? 's' : ''} in your wallet:\n${listStr}\n\nType 'sell all $${holdings[0].symbol}' to trade.`
          if (holdings.length === 1) {
            action = {
              intent: 'SELL',
              tokenAddress: holdings[0].tokenAddress,
              tokenSymbol: holdings[0].symbol,
              tokenInfo: holdings[0].info || undefined,
              amount: 'all',
              amountType: 'ALL',
              percentage: 100,
              isAll: true,
              confidence: 1.0,
            }
          }
        }
      }

      // B. If user asked to SELL / SELL ALL without specifying a contract address
      if (action && action.intent === 'SELL' && !action.tokenAddress) {
        if (action.tokenSymbol) {
          // Find by symbol in user's holdings first
          const foundHolding = holdings.find((h) => h.symbol.toLowerCase() === action?.tokenSymbol?.toLowerCase())
          if (foundHolding) {
            action.tokenAddress = foundHolding.tokenAddress
            action.tokenInfo = foundHolding.info || undefined
            action.tokenSymbol = foundHolding.symbol
            replyText = `Order prepared: SELL ${action.isAll ? '100% (ALL BALANCE)' : `${action.percentage || 100}%`} of ${foundHolding.balanceFormatted} $${foundHolding.symbol} to ETH. Click confirm below to execute.`
          }
        } else {
          // No symbol, no address: Auto-discover from holdings
          if (holdings.length === 1) {
            const h = holdings[0]
            action.tokenAddress = h.tokenAddress
            action.tokenSymbol = h.symbol
            action.tokenInfo = h.info || undefined
            replyText = `Found 1 token in your wallet: ${h.balanceFormatted} $${h.symbol}.\nOrder prepared: SELL 100% (ALL BALANCE) of $${h.symbol} to ETH. Click confirm below to execute.`
          } else if (holdings.length > 1) {
            const listStr = holdings.map((h) => `- ${h.balanceFormatted} $${h.symbol} (${h.tokenAddress.slice(0, 6)}...${h.tokenAddress.slice(-4)})`).join('\n')
            replyText = `Found ${holdings.length} tokens in your wallet:\n${listStr}\n\nPlease specify which token to sell (e.g. 'sell all $${holdings[0].symbol}' or 'sell all ${holdings[0].tokenAddress.slice(0, 8)}...').`
            action = undefined
          } else {
            replyText = `No token holdings found in your wallet (${activeUserAddress.slice(0, 6)}...${activeUserAddress.slice(-4)}). You currently have 0 token balance to sell.`
            action = undefined
          }
        }
      }
    }

    // 3. Enrich action data with on-chain token info & user balances if applicable
    if (action) {
      // Find token by symbol if only symbol was provided
      if (!action.tokenAddress && action.tokenSymbol) {
        try {
          const { readFile } = await import('fs/promises')
          const path = await import('path')
          const regFile = path.join(process.cwd(), 'data', 'launched_tokens.json')
          const rawReg = await readFile(regFile, 'utf-8').catch(() => '[]')
          const regTokens: any[] = JSON.parse(rawReg)

          for (const item of regTokens) {
            const addr = typeof item === 'string' ? item : item?.tokenAddress || item?.address
            if (addr && isAddress(addr)) {
              const cleanAddr = getAddress(addr)
              const info = await getPonsTokenInfo(cleanAddr).catch(() => null)
              if (info && info.symbol.toLowerCase() === action.tokenSymbol.toLowerCase()) {
                action.tokenAddress = cleanAddr
                action.tokenInfo = info
                break
              }
            }
          }
        } catch { /* ignore */ }
      }

      // Fetch on-chain token info if tokenAddress is found
      if (action.tokenAddress && isAddress(action.tokenAddress)) {
        try {
          const cleanCa = getAddress(action.tokenAddress)
          const info = await getPonsTokenInfo(cleanCa).catch(() => null)
          if (info) {
            action.tokenInfo = info
            if (!action.tokenSymbol) action.tokenSymbol = info.symbol
          } else {
            // Basic ERC20 fallback
            const [name, symbol, decimals] = await Promise.all([
              client.readContract({ address: cleanCa, abi: erc20Abi, functionName: 'name' }).catch(() => 'Token'),
              client.readContract({ address: cleanCa, abi: erc20Abi, functionName: 'symbol' }).catch(() => 'TKN'),
              client.readContract({ address: cleanCa, abi: erc20Abi, functionName: 'decimals' }).catch(() => 18),
            ])
            action.tokenSymbol = symbol
          }

          // If SELL and userAddress is present, calculate balance & exact amounts
          if (action.intent === 'SELL' && activeUserAddress) {
            try {
              const balRaw = await client.readContract({
                address: cleanCa,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [activeUserAddress],
              }).catch(() => 0n)

              const formattedBal = formatUnits(balRaw, 18)
              const numBal = parseFloat(formattedBal)

              if (action.isAll || action.percentage === 100) {
                action.amount = numBal >= 1 ? Math.floor(numBal).toString() : formattedBal
              } else if (action.percentage && action.percentage > 0) {
                const fraction = (numBal * action.percentage) / 100
                action.amount = fraction >= 1 ? Math.floor(fraction).toString() : fraction.toFixed(4)
              }
            } catch { /* ignore */ }
          }
        } catch (enrichErr) {
          console.warn('[Chat API] Failed to enrich token data:', enrichErr)
        }
      }
    }

    return NextResponse.json({
      success: true,
      reply: replyText,
      action,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Chat parsing failed'
    console.error('[Chat API Error]:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
