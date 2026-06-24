// app/api/cron/daily-digest/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { runDailyPipeline } from '@/lib/pipeline'

async function handle(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const ticker = searchParams.get('ticker')
  const onlyTickers = ticker ? ticker.split(',').map(t => t.trim()) : undefined

  const date = new Date()
  const result = await runDailyPipeline(date, onlyTickers)

  return NextResponse.json({
    ok: true,
    date: date.toISOString().split('T')[0],
    ...result,
  })
}

export const GET = handle
export const POST = handle
