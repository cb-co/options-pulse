import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const origin = req.headers.get('origin') ?? 'http://localhost:3000'

  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    customer_email: user.email,
    success_url: `${origin}/dashboard?upgraded=true`,
    cancel_url: `${origin}/pricing`,
    metadata: { user_id: user.id },
  })

  return NextResponse.redirect(session.url!, { status: 303 })
}
