export interface AICommandParseResult {
  intent: 'launch_token' | 'wallet_query' | 'send_token' | 'buy_token' | 'sell_token' | 'unknown'
  tokenName: string | null
  tokenSymbol: string | null
  tokenAddress?: string | null
  amount?: string | null
  recipientHandle?: string | null
  confidence: number
  rawReasoning?: string
}

export interface TweetInputContext {
  tweetId: string
  text: string
  authorId: string
  authorUsername: string
  createdAt?: string
  media?: Array<{
    type: string
    url?: string
  }>
}

/**
 * AI COMMAND PARSER FOR TWITTER BOT:
 * Interprets user natural language intent: Launch Token, Wallet Query, Send/Tip, Buy, and Sell.
 */
export async function parseTwitterCommandWithAI(
  tweet: TweetInputContext
): Promise<AICommandParseResult> {
  const text = tweet.text.trim()
  const openAiKey = process.env.OPENAI_API_KEY
  const openAiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini'

  // 1. Primary: OpenAI API with JSON Mode
  if (openAiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: openAiModel,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `You are a high-speed Web3 Twitter Bot AI Command Parser for Robinhood Chain.
Analyze the user's tweet and output ONLY valid JSON matching this schema:
{
  "intent": "launch_token" | "wallet_query" | "send_token" | "buy_token" | "sell_token" | "unknown",
  "tokenName": string | null,
  "tokenSymbol": string | null,
  "tokenAddress": string | null,
  "amount": string | null,
  "recipientHandle": string | null,
  "confidence": number
}

RULES:
1. BUY TOKEN (e.g. "@agent_ponscore buy 0.001 eth $PONSCORE", "buy 10$ $TEST", "buy 0.005 eth 0x..."):
   - intent: "buy_token"
   - amount: numeric string e.g. "0.001" or "10"
   - tokenSymbol: ticker without $ or null
   - tokenAddress: 0x... if address provided
   - confidence: 1.0

2. SELL TOKEN (e.g. "@agent_ponscore sell all $PONSCORE", "sell 50% $TEST", "sell 1000 0x..."):
   - intent: "sell_token"
   - amount: "all" or "50%" or numeric string
   - tokenSymbol: ticker without $ or null
   - tokenAddress: 0x... if address provided
   - confidence: 1.0

3. SEND / TIP TOKEN (e.g. "@agent_ponscore send 500 ponscore to @meadgod", "@agent_ponscore send 500 ponscore", "tip 100 $PONS to @rahul"):
   - intent: "send_token"
   - amount: numeric string
   - tokenSymbol: ticker without $
   - recipientHandle: target username without @ (or null if not in text)
   - confidence: 1.0

4. LAUNCH TOKEN (e.g. "@agent_ponscore launch token $TEST", "launch $TEST", "create token $DOG"):
   - intent: "launch_token"
   - tokenName and tokenSymbol: ticker without $
   - confidence: 1.0

5. WALLET QUERY (e.g. "whats my wallet", "check balance", "saldo"):
   - intent: "wallet_query"
   - confidence: 1.0

6. Output STRICT JSON ONLY.`
            },
            {
              role: 'user',
              content: text,
            }
          ],
          temperature: 0.1,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const content = data.choices?.[0]?.message?.content
        if (content) {
          const parsed = JSON.parse(content)
          if (parsed.intent) {
            return {
              intent: parsed.intent,
              tokenName: parsed.tokenName ? String(parsed.tokenName).replace('$', '').toUpperCase() : null,
              tokenSymbol: parsed.tokenSymbol ? String(parsed.tokenSymbol).replace('$', '').toUpperCase() : null,
              tokenAddress: parsed.tokenAddress ? String(parsed.tokenAddress).trim() : null,
              amount: parsed.amount ? String(parsed.amount).trim() : null,
              recipientHandle: parsed.recipientHandle ? String(parsed.recipientHandle).replace('@', '').trim() : null,
              confidence: Number(parsed.confidence) || 1.0,
            }
          }
        }
      } else {
        console.warn('[OpenAI API] Error response:', response.status, await response.text())
      }
    } catch (llmErr) {
      console.warn('[AI Parser] OpenAI API error, falling back to deterministic parser:', llmErr)
    }
  }

  // 2. High-precision Deterministic NLP Engine (Fallback / Zero-Latency)
  const clean = text
    .replace(/https?:\/\/\S+/gi, '')
    .trim()

  const caMatch = clean.match(/0x[a-fA-F0-9]{40}/i)
  const tokenAddress = caMatch ? caMatch[0] : null

  // A. Check Buy Intent (e.g. "buy 0.001 eth $PONSCORE", "buy 10$ test", "buy 0.005 eth")
  const isBuyKeyword = /\b(buy|beli|ape|long)\b/i.test(clean)
  if (isBuyKeyword) {
    const amountMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:eth|\$|usd|dollar)?/i)
    const symMatch = clean.match(/\$([A-Za-z0-9_]{2,15})/i) || clean.match(/(?:buy|beli|ape)\s+(?:\d+(?:\.\d+)?\s*(?:eth|\$|usd)?\s+)?\$?([A-Za-z0-9_]{2,15})/i)
    const ignored = new Set(['ETH', 'USD', 'USDT', 'USDC', 'BUY', 'BELI', 'TOKEN'])
    const sym = symMatch && !ignored.has(symMatch[1].toUpperCase()) ? symMatch[1].toUpperCase() : 'PONSCORE'

    return {
      intent: 'buy_token',
      tokenName: sym,
      tokenSymbol: sym,
      tokenAddress,
      amount: amountMatch ? amountMatch[1] : '0.001',
      confidence: 1.0,
    }
  }

  // B. Check Sell Intent (e.g. "sell all $PONSCORE", "sell 50% test", "sell 1000 0x...")
  const isSellKeyword = /\b(sell|jual|dump)\b/i.test(clean)
  if (isSellKeyword) {
    const isAll = /\b(all|semua|100%|max)\b/i.test(clean)
    const pctMatch = clean.match(/(\d+(?:\.\d+)?)\s*%/i)
    const numMatch = clean.match(/(?:sell|jual|dump)\s+(\d+(?:\.\d+)?)/i)
    const amount = isAll ? 'all' : pctMatch ? `${pctMatch[1]}%` : numMatch ? numMatch[1] : 'all'

    const symMatch = clean.match(/\$([A-Za-z0-9_]{2,15})/i) || clean.match(/(?:sell|jual|dump)\s+(?:all\s+|\d+%\s+|\d+\s+)?\$?([A-Za-z0-9_]{2,15})/i)
    const ignored = new Set(['ALL', 'SEMUA', 'MAX', 'TOKEN', 'TOKENS', 'SELL', 'JUAL', 'ETH', 'USD'])
    const sym = symMatch && !ignored.has(symMatch[1].toUpperCase()) ? symMatch[1].toUpperCase() : 'PONSCORE'

    return {
      intent: 'sell_token',
      tokenName: sym,
      tokenSymbol: sym,
      tokenAddress,
      amount,
      confidence: 1.0,
    }
  }

  // A. Check Send / Tip Intent (e.g. "send 500 ponscore to @meadgod", "send 500 ponscore", "tip 100 $PONS")
  const isSendKeyword = /\b(send|tip|kirim|transfer|pay|give|bagi)\b/i.test(clean)
  if (isSendKeyword) {
    // Check explicit recipient in text e.g. "to @username", "ke @username", "@username"
    const explicitTargetMatch = clean.match(/(?:to|ke|for)\s+@?([A-Za-z0-9_]{1,30})/i)
    let recipientHandle = explicitTargetMatch ? explicitTargetMatch[1].replace('@', '') : null

    // Extract all mentions in tweet
    if (!recipientHandle) {
      const mentions = clean.match(/@([A-Za-z0-9_]{1,30})/gi)
      if (mentions) {
        const botHandle = (process.env.TWITTER_BOT_HANDLE || 'agent_ponscore').replace('@', '').toLowerCase()
        const otherMentions = mentions
          .map((m) => m.replace('@', ''))
          .filter((m) => m.toLowerCase() !== botHandle && m.toLowerCase() !== tweet.authorUsername.toLowerCase())
        if (otherMentions.length > 0) {
          recipientHandle = otherMentions[0]
        }
      }
    }

    // Match amount and token e.g. "500 ponscore", "500 $PONS", "0.001 eth", "100 test"
    const sendDetailsMatch = clean.match(/(?:send|tip|kirim|transfer|pay|give|bagi)\s+(\d+(?:\.\d+)?)\s*(?:\$|usd)?\s*([A-Za-z0-9_]{2,15}|0x[a-fA-F0-9]{40})?/i)
    if (sendDetailsMatch) {
      const amount = sendDetailsMatch[1]
      const rawSymbol = sendDetailsMatch[2]
      let symbol = rawSymbol ? rawSymbol.replace('$', '').toUpperCase() : 'PONSCORE'
      if (/^(TO|KE|FOR)$/i.test(symbol)) {
        symbol = 'PONSCORE'
      }

      return {
        intent: 'send_token',
        tokenName: symbol,
        tokenSymbol: symbol,
        amount,
        recipientHandle,
        confidence: 1.0,
      }
    }
  }

  // B. Check Wallet Query Intent
  const walletQueryPattern = /\b(balance|wallet|saldo|deposit|check|whats my wallet|what is my wallet|my wallet|address|my address)\b/i
  const isLaunchKeyword = /\b(launch|deploy|create|make)\b/i.test(clean)

  if (walletQueryPattern.test(clean) && !isLaunchKeyword) {
    return {
      intent: 'wallet_query',
      tokenName: null,
      tokenSymbol: null,
      confidence: 1.0,
    }
  }

  // C. Check Launch Token Intent
  const launchMatch = clean.match(/(?:launch|create|make|deploy)\s+(?:a\s+)?(?:token\s+(?:called\s+)?)?\$([A-Za-z0-9_]{2,15})(?:\s|$)/i) ||
                      clean.match(/\$([A-Za-z0-9_]{2,15})/i)

  if (launchMatch) {
    const candidateSymbol = launchMatch[1].toUpperCase().replace('$', '').trim()

    if (
      candidateSymbol.toLowerCase().startsWith('solana') ||
      candidateSymbol.length < 2 ||
      candidateSymbol.length > 15 ||
      /^(SOL|BTC|USDT|USDC)$/i.test(candidateSymbol)
    ) {
      return {
        intent: 'unknown',
        tokenName: null,
        tokenSymbol: null,
        confidence: 0,
      }
    }

    return {
      intent: 'launch_token',
      tokenName: candidateSymbol,
      tokenSymbol: candidateSymbol,
      confidence: 1.0,
    }
  }

  // D. Unknown / Unrelated tweet
  return {
    intent: 'unknown',
    tokenName: null,
    tokenSymbol: null,
    confidence: 0,
  }
}
