import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createAdminClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      await supabase
        .from('profiles')
        .update({
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
          subscription_status: 'active',
        })
        .eq('email', session.customer_email!)
      break
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const status = sub.status === 'active' ? 'active' : sub.status
      await supabase
        .from('profiles')
        .update({ subscription_status: status })
        .eq('stripe_subscription_id', sub.id)
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      await supabase
        .from('profiles')
        .update({ subscription_status: 'free' })
        .eq('stripe_subscription_id', sub.id)
      break
    }
  }

  return NextResponse.json({ ok: true })
}
