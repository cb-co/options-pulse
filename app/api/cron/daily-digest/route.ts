// app/api/cron/daily-digest/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { runDailyPipeline } from '@/lib/pipeline'

async function handle(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const date = new Date()
  const result = await runDailyPipeline(date)

  return NextResponse.json({
    ok: true,
    date: date.toISOString().split('T')[0],
    ...result,
  })
}

export const GET = handle
export const POST = handle
