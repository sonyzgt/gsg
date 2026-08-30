export interface AICommandParseResult {
  intent: 'launch_token' | 'wallet_query' | 'unknown'
  tokenName: string | null
  tokenSymbol: string | null
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
 * 🌟 AI COMMAND PARSER FOR TWITTER BOT (BANKR-STYLE):
 * Interprets user's natural language intent and extracts token metadata.
 * 
 * Powered by OpenAI (gpt-4o-mini / gpt-4o / gpt-3.5-turbo)
 * 
 * IMPORTANT:
 * - AI is ONLY responsible for natural language intent & token ticker extraction.
 * - AI NEVER manages wallets, private keys, signer, or transaction execution.
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
              content: `You are a high-speed Web3 Twitter Bot AI Command Parser.
Analyze the user's tweet and output ONLY valid JSON matching this schema:
{
  "intent": "launch_token" | "wallet_query" | "unknown",
  "tokenName": string | null,
  "tokenSymbol": string | null,
  "confidence": number
}

RULES:
1. If the user wants to launch/create a token (e.g. "@agent_ponscore launch token $TEST", "launch $TEST", "create token $DOG", "make a token $PEPE"), return intent="launch_token", tokenName and tokenSymbol equal to the ticker (without $), and confidence=1.0.
2. Reject Solana addresses (e.g. solana:8iYZ...), pump links, arbitrary contract addresses, or random conversation -> intent="unknown", tokenName=null, tokenSymbol=null, confidence=0.
3. If the user asks for their wallet address or balance (e.g. "whats my wallet", "check balance", "saldo"), return intent="wallet_query", tokenName=null, tokenSymbol=null, confidence=1.0.
4. Output STRICT JSON ONLY. Do not invent symbols.`
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
    .replace(/@\w+/g, '')
    .trim()

  // A. Check Wallet Query Intent
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

  // B. Check Launch Token Intent with Natural Language variations
  // Strictly requires literal $ before ticker symbol (e.g. $TEST, $DOG, $PEPE)
  const launchMatch = clean.match(/(?:launch|create|make|deploy)\s+(?:a\s+)?(?:token\s+(?:called\s+)?)?\$([A-Za-z0-9_]{2,15})(?:\s|$)/i) ||
                      clean.match(/\$([A-Za-z0-9_]{2,15})/i)

  if (launchMatch) {
    const candidateSymbol = launchMatch[1].toUpperCase().replace('$', '').trim()

    // Reject Solana keywords, single/long words, or standard stablecoins/native gas tokens
    if (
      candidateSymbol.toLowerCase().startsWith('solana') ||
      candidateSymbol.length < 2 ||
      candidateSymbol.length > 15 ||
      /^(ETH|SOL|BTC|USDT|USDC|TOKEN)$/i.test(candidateSymbol)
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

  // C. Unknown / Unrelated tweet
  return {
    intent: 'unknown',
    tokenName: null,
    tokenSymbol: null,
    confidence: 0,
  }
}
