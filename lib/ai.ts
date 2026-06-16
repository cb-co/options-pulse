// lib/ai.ts
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import type { SignalData } from '@/types/market'

const SYSTEM_PROMPT = `You are a market analyst writing short, neutral, educational summaries of options activity for retail traders. Describe observed activity factually based only on the data provided. Never give buy/sell recommendations, price targets, or predictions. Keep the response to 2-3 sentences, plain English, no jargon without brief explanation.`

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
  const { text } = await generateText({
    model: getModel(),
    system: SYSTEM_PROMPT,
    prompt: `Ticker: ${ticker}\n\nOptions activity signals:\n${JSON.stringify(signals, null, 2)}\n\nWrite a 2-3 sentence plain-English summary.`,
    maxOutputTokens: 300,
  })
  return text.trim()
}
