import { isAddress, getAddress, createPublicClient, http, erc20Abi, formatUnits } from 'viem'
import { robinhoodChain } from '@/lib/chains'
import { getPonsTokenInfo, PonsV2TokenInfo } from '@/lib/pons-v2'

export type ChatIntentType =
  | 'BUY'
  | 'SELL'
  | 'LAUNCH'
  | 'WALLET_QUERY'
  | 'TOKEN_INFO'
  | 'GENERAL'

export interface ParsedActionData {
  intent: ChatIntentType
  tokenAddress?: string
  tokenSymbol?: string
  tokenName?: string
  tokenInfo?: PonsV2TokenInfo | null
  amount?: string // formatted amount string (e.g. "0.004", "1000", "all")
  amountType?: 'ETH' | 'USD' | 'TOKEN' | 'PERCENT' | 'ALL'
  amountRawValue?: number // parsed numeric amount
  percentage?: number // e.g. 100 for all, 50 for 50%
  isAll?: boolean
  slippage?: number
  confidence: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  action?: ParsedActionData
}

const client = createPublicClient({
  chain: robinhoodChain,
  transport: http('https://robinhood-rpc.publicnode.com'),
})

const DEFAULT_ETH_USD = 2500

/**
 * Deterministic NLP Parser for Web3 Trading Commands
 * Zero latency, 100% reliable fallback
 */
export function parseTradingCommandDeterministic(text: string): ParsedActionData {
  const clean = text.trim()

  // 1. Check for contract address (0x...)
  const caMatch = clean.match(/0x[a-fA-F0-9]{40}/i)
  const tokenAddress = caMatch ? getAddress(caMatch[0]) : undefined

  // 2. Check for token ticker with $ (e.g. $PEPE, $DOG) or words following buy/sell
  const tickerMatch = clean.match(/\$([A-Za-z0-9_]{2,15})/i)
  const wordMatch = clean.match(/(?:sell|buy|swap|token)\s+(?:all\s+|semua\s+)?\$?([A-Za-z0-9_]{2,15})/i)
  const ignoredWords = new Set(['ALL', 'TOKEN', 'TOKENS', 'COIN', 'COINS', 'BALANCE', 'MY', 'SEMUA', 'THE', 'A', 'AN', 'ETH', 'USD', 'USDT', 'USDC', 'CHECK', 'MY'])
  const matchedWord = wordMatch && !ignoredWords.has(wordMatch[1].toUpperCase()) ? wordMatch[1].toUpperCase() : undefined
  const tokenSymbol = tickerMatch ? tickerMatch[1].toUpperCase() : matchedWord

  // 3. Check for SWAP ALL / SELL ALL / JUAL SEMUA
  const isSellAll =
    /\b(swap\s*all|sell\s*all|jual\s*semua|swap\s*semua|sell\s*100%|jual\s*100%|dump\s*all|max\s*sell)\b/i.test(
      clean
    )

  // 4. Check for SELL / JUAL / SWAP (Token -> ETH)
  const isSellIntent =
    isSellAll ||
    /\b(sell|jual|dump|swap\s+out|cashout|take\s*profit)\b/i.test(clean)

  // 5. Check for BUY / BELI (ETH -> Token)
  const isBuyIntent =
    !isSellIntent &&
    /\b(buy|beli|ape|long|swap\s*to|swap\s*in|entry)\b/i.test(clean)

  // 6. Check for LAUNCH / DEPLOY / CREATE TOKEN
  const isLaunchIntent =
    /\b(launch|deploy|create\s+token|make\s+token|bikin\s+token|buat\s+token)\b/i.test(
      clean
    )

  // 7. Check for WALLET QUERY / SALDO / BALANCE
  const isWalletQuery =
    /\b(balance|saldo|wallet|address|dompet|my\s+wallet|check\s+balance|cek\s+saldo)\b/i.test(
      clean
    ) && !tokenAddress && !tokenSymbol

  // 8. Check for TOKEN INFO / PRICE / STATUS
  const isTokenInfo =
    /\b(info|price|harga|chart|marketcap|mcap|status)\b/i.test(clean) &&
    (!!tokenAddress || !!tokenSymbol)

  // ── Parse SELL / SWAP ALL ──
  if (isSellIntent) {
    let percentage = isSellAll ? 100 : undefined
    let isAll = isSellAll

    // Check custom percent e.g. "sell 50%" or "jual 25%"
    const pctMatch = clean.match(/(\d+(?:\.\d+)?)\s*%/i)
    if (pctMatch) {
      percentage = parseFloat(pctMatch[1])
      if (percentage >= 100) isAll = true
    }

    // Check specific amount e.g. "sell 1000 0x..." or "sell 500 $TOKEN"
    let customAmount: string | undefined = undefined
    let amountType: ParsedActionData['amountType'] = isAll ? 'ALL' : 'TOKEN'

    if (!isAll && !pctMatch) {
      const numMatch = clean.match(/(?:sell|jual|dump)\s+(\d+(?:\.\d+)?)/i)
      if (numMatch) {
        customAmount = numMatch[1]
      }
    }

    return {
      intent: 'SELL',
      tokenAddress,
      tokenSymbol,
      amount: isAll ? 'all' : customAmount || (percentage ? `${percentage}%` : 'all'),
      amountType: isAll ? 'ALL' : percentage ? 'PERCENT' : 'TOKEN',
      amountRawValue: customAmount ? parseFloat(customAmount) : undefined,
      percentage: percentage || (isAll ? 100 : undefined),
      isAll: isAll || percentage === 100,
      slippage: 1.0,
      confidence: 0.95,
    }
  }

  // ── Parse BUY ──
  if (isBuyIntent) {
    // Check for USD amount e.g. "buy 10$", "buy $10", "beli 10 usd", "buy 10 dollar"
    const usdMatch =
      clean.match(/(\d+(?:\.\d+)?)\s*(?:\$|usd|dollar)/i) ||
      clean.match(/\$\s*(\d+(?:\.\d+)?)/i)

    // Check for ETH amount e.g. "buy 0.05 eth", "beli 0.01", "buy 0.005"
    const ethMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:eth|ether)/i)

    // Check general numeric amount e.g. "buy 0.01 0x..."
    const generalNumMatch = clean.match(/(?:buy|beli|ape)\s+(\d+(?:\.\d+)?)/i)

    let amount = '0.001'
    let amountType: ParsedActionData['amountType'] = 'ETH'
    let amountRawValue = 0.001

    if (usdMatch) {
      const usdVal = parseFloat(usdMatch[1])
      amountRawValue = usdVal
      amountType = 'USD'
      // Convert USD to ETH using DEFAULT_ETH_USD
      const ethVal = usdVal / DEFAULT_ETH_USD
      amount = ethVal < 0.0001 ? ethVal.toFixed(6) : ethVal.toFixed(4)
    } else if (ethMatch) {
      amountRawValue = parseFloat(ethMatch[1])
      amountType = 'ETH'
      amount = ethMatch[1]
    } else if (generalNumMatch) {
      const val = parseFloat(generalNumMatch[1])
      amountRawValue = val
      // If user typed >= 1 without unit and it looks like dollar e.g. "buy 10 0x...", treat as USD if > 0.5, else ETH
      if (val >= 1) {
        amountType = 'USD'
        const ethVal = val / DEFAULT_ETH_USD
        amount = ethVal.toFixed(4)
      } else {
        amountType = 'ETH'
        amount = generalNumMatch[1]
      }
    }

    return {
      intent: 'BUY',
      tokenAddress,
      tokenSymbol,
      amount,
      amountType,
      amountRawValue,
      slippage: 1.0,
      confidence: 0.95,
    }
  }

  // ── Parse LAUNCH ──
  if (isLaunchIntent) {
    const nameMatch = clean.match(/(?:launch|deploy|create|make|bikin|buat)\s+(?:token\s+)?\$?([A-Za-z0-9_]{2,15})/i)
    const name = (tickerMatch ? tickerMatch[1].toUpperCase() : (nameMatch ? nameMatch[1].toUpperCase() : tokenSymbol)) || 'TOKEN'
    return {
      intent: 'LAUNCH',
      tokenSymbol: name,
      tokenName: name,
      confidence: 0.9,
    }
  }

  // ── Parse WALLET QUERY ──
  if (isWalletQuery) {
    return {
      intent: 'WALLET_QUERY',
      confidence: 0.95,
    }
  }

  // ── Parse TOKEN INFO ──
  if (isTokenInfo || (tokenAddress && !isBuyIntent && !isSellIntent)) {
    return {
      intent: 'TOKEN_INFO',
      tokenAddress,
      tokenSymbol,
      confidence: 0.9,
    }
  }

  return {
    intent: 'GENERAL',
    tokenAddress,
    tokenSymbol,
    confidence: 0.5,
  }
}

/**
 * AI Powered Chat & Intent Parser using OpenAI (with fast deterministic fallback)
 */
export async function parseChatMessageWithAI(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<{
  replyText: string
  action?: ParsedActionData
}> {
  const openAiKey = process.env.OPENAI_API_KEY
  const openAiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini'

  // Fast deterministic parse first
  const deterministicParsed = parseTradingCommandDeterministic(userMessage)

  // 1. Try OpenAI if API key is present
  if (openAiKey) {
    try {
      const systemPrompt = `You are "PONSCORE AI", an intelligent, high-speed Web3 DeFi Trading Agent on the Robinhood Chain (EVM chain 4663, Pons V2 Launchpad & Uniswap V4 DEX).

CRITICAL RULES:
1. ALWAYS reply in ENGLISH ONLY.
2. DO NOT use emojis anywhere in your response. Keep text clean, technical, concise, and professional.
3. Understand user natural language commands for:
   - BUYING tokens: ("buy 10$ 0xf373...", "buy 0.005 ETH 0x...", "buy $PEPE 10$")
   - SELLING / SWAPPING ALL: ("swap all 0xf373...", "sell all 0x...", "sell 50% 0x...", "swap 1000 tokens")
   - LAUNCHING: ("launch token $PEPE", "deploy $DOG")
   - CHECKING WALLET: ("check balance", "my wallet address")
   - TOKEN INFO: ("info 0x...", "price $PEPE")
   - GENERAL / DeFi queries.

Respond with STRICT JSON matching this schema:
{
  "reply": "Concise assistant response in English without emojis.",
  "intent": "BUY" | "SELL" | "LAUNCH" | "WALLET_QUERY" | "TOKEN_INFO" | "GENERAL",
  "tokenAddress": "0x... or null",
  "tokenSymbol": "SYMBOL or null",
  "amount": "string of parsed amount in ETH or tokens or 'all' or null",
  "amountType": "ETH" | "USD" | "TOKEN" | "PERCENT" | "ALL" | null,
  "amountRawValue": number or null,
  "isAll": boolean,
  "percentage": number or null,
  "slippage": number or 1.0
}

Note:
- For "buy 10$ 0x...", amountType="USD", amountRawValue=10. Convert 10 USD to ETH at approx $2500/ETH (e.g. 0.004 ETH).
- For "swap all 0x..." or "sell all", intent="SELL", isAll=true, percentage=100, amount="all", amountType="ALL".
- Always output valid JSON with NO emojis.`

      const recentHistory = history.slice(-6).map((h) => ({
        role: h.role,
        content: h.content,
      }))

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: openAiModel,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            ...recentHistory,
            { role: 'user', content: userMessage },
          ],
          temperature: 0.1,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const content = data.choices?.[0]?.message?.content
        if (content) {
          const parsed = JSON.parse(content)
          const tokenAddress = parsed.tokenAddress
            ? isAddress(parsed.tokenAddress)
              ? getAddress(parsed.tokenAddress)
              : deterministicParsed.tokenAddress
            : deterministicParsed.tokenAddress

          const action: ParsedActionData = {
            intent: parsed.intent || deterministicParsed.intent,
            tokenAddress,
            tokenSymbol: deterministicParsed.tokenSymbol || parsed.tokenSymbol,
            tokenName: deterministicParsed.tokenName || parsed.tokenName || parsed.tokenSymbol,
            amount: parsed.amount || deterministicParsed.amount,
            amountType: parsed.amountType || deterministicParsed.amountType,
            amountRawValue: parsed.amountRawValue || deterministicParsed.amountRawValue,
            isAll: parsed.isAll ?? deterministicParsed.isAll,
            percentage: parsed.percentage ?? deterministicParsed.percentage,
            slippage: parsed.slippage || 1.0,
            confidence: 0.98,
          }

          // Strip any accidental emojis
          const cleanReply = (parsed.reply || generateDefaultReply(action, userMessage))
            .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}\u{2388}-\u{23FF}]/gu, '')
            .trim()

          return {
            replyText: cleanReply,
            action,
          }
        }
      }
    } catch (err) {
      console.warn('[AI Agent] OpenAI failed, using deterministic parser:', err)
    }
  }

  // 2. Deterministic Fallback Reply Generator (English only, no emojis)
  const replyText = generateDefaultReply(deterministicParsed, userMessage)
  return {
    replyText,
    action: deterministicParsed,
  }
}

/**
 * Generate clean English reply based on parsed intent without emojis
 */
export function generateDefaultReply(action: ParsedActionData, originalPrompt: string): string {
  if (action.intent === 'BUY') {
    if (!action.tokenAddress && !action.tokenSymbol) {
      return `Please specify the token contract address or symbol to buy (e.g. 'buy 10$ 0xf373...' or 'buy 0.005 ETH 0x...').`
    }
    const amountStr = action.amountType === 'USD' ? `$${action.amountRawValue} (~${action.amount} ETH)` : `${action.amount} ETH`
    const target = action.tokenAddress ? `${action.tokenAddress.slice(0, 6)}...${action.tokenAddress.slice(-4)}` : action.tokenSymbol ? `$${action.tokenSymbol}` : 'the selected token'
    return `Order prepared: BUY ${amountStr} of ${target}. Please review trade details and confirm execution below.`
  }

  if (action.intent === 'SELL') {
    if (!action.tokenAddress && !action.tokenSymbol) {
      return `Please specify the token contract address or symbol to sell (e.g. 'sell all 0xf373...' or 'sell 50% 0x...').`
    }
    const amtStr = action.isAll ? '100% (ALL BALANCE)' : action.percentage ? `${action.percentage}% of balance` : `${action.amount} tokens`
    const target = action.tokenAddress ? `${action.tokenAddress.slice(0, 6)}...${action.tokenAddress.slice(-4)}` : action.tokenSymbol ? `$${action.tokenSymbol}` : 'the token'
    return `Order prepared: SELL ${amtStr} of ${target} to ETH. Click confirm below to execute the swap.`
  }

  if (action.intent === 'LAUNCH') {
    return `Ready to deploy $${action.tokenSymbol || 'TOKEN'} on the Pons V2 Bonding Curve. Click the button below to launch.`
  }

  if (action.intent === 'WALLET_QUERY') {
    return `Here is your wallet overview. You can inspect your active balance and token holdings on the Robinhood Chain.`
  }

  if (action.intent === 'TOKEN_INFO') {
    return `On-chain data retrieved for ${action.tokenAddress || action.tokenSymbol || 'token'}.`
  }

  // General fallback
  return `PONSCORE AI Trading Agent is online. You can execute commands like:\n- "buy 10$ 0x..." (Buy using USD value)\n- "buy 0.005 ETH 0x..."\n- "swap all 0x..." (Sell all token balance)\n- "sell 50% 0x..."\n- "check balance"\n- "launch token $PEPE"\n\nType your command below.`
}
