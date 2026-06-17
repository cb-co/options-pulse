// lib/ai.ts
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import type { SignalData } from '@/types/market'

const SYSTEM_PROMPT = `You are a market analyst writing factual, educational summaries of options activity for retail traders.

Rules:
- Always complete your sentences — never trail off mid-thought.
- Cite the actual numbers from the data (e.g. "put/call ratio of 1.06", "vol/OI of 2,472").
- Explain what each number suggests in plain English (e.g. "suggesting more put volume than call volume").
- Mention the top contract by vol/OI and what its strike/type implies about positioning.
- 3 sentences exactly. No bullet points. No markdown.
- Never give buy/sell recommendations, price targets, or predictions.`

function getModel() {
  const provider = process.env.AI_PROVIDER ?? 'anthropic'
  const modelId = process.env.AI_MODEL ?? 'claude-sonnet-4-6'

  switch (provider) {
    case 'google':
      return google(modelId)
    case 'anthropic':
    default:
      return anthropic(modelId)
  }
}

export async function generateNarrative(ticker: string, signals: SignalData): Promise<string> {
  const top = signals.topVolOiContracts[0]
  const prompt = `Ticker: ${ticker}

Signal data:
- Put/call ratio: ${signals.putCallRatio?.toFixed(4) ?? 'n/a'} (above 1.0 = more put volume than call volume)
- Top contract by vol/OI: ${top ? `${top.symbol} (${top.optionType}, $${top.strike} strike) — vol/OI ratio of ${top.volOiRatio.toFixed(1)}` : 'n/a'}
- 2nd contract: ${signals.topVolOiContracts[1] ? `${signals.topVolOiContracts[1].symbol} (${signals.topVolOiContracts[1].optionType}, $${signals.topVolOiContracts[1].strike}) — vol/OI ${signals.topVolOiContracts[1].volOiRatio.toFixed(1)}` : 'n/a'}
- IV skew (OTM calls minus OTM puts): ${signals.ivSkew != null ? signals.ivSkew.toFixed(4) : 'n/a'} (negative = puts have higher IV than calls)
${signals.volumeChange ? `- Volume change vs yesterday (top movers): ${Object.entries(signals.volumeChange).slice(0, 3).map(([k, v]) => `${k}: ${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%`).join(', ')}` : ''}
${signals.ivChange ? `- IV change vs yesterday: ${Object.entries(signals.ivChange).slice(0, 3).map(([k, v]) => `${k}: ${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}pp`).join(', ')}` : ''}

Write exactly 3 complete sentences summarizing what these signals show. Cite the actual numbers. Explain what they suggest about current positioning. Do not trail off.`

  const { text } = await generateText({
    model: getModel(),
    system: SYSTEM_PROMPT,
    prompt,
    maxOutputTokens: 600,
  })
  return text.trim()
}
