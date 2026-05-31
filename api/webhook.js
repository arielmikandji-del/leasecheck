// api/webhook.js
// Stripe tells us "payment successful" → we store a token so the user can get their report

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const token = session.id; // Stripe session ID = one-use access token

    // Store token with 1-hour expiry in a simple KV store
    // Using Vercel KV (free tier) — just a key/value store
    await fetch(`https://api.vercel.com/v1/edge-config/${process.env.EDGE_CONFIG_ID}/items`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [{
          operation: 'upsert',
          key: `token_${token}`,
          value: { used: false, created: Date.now() }
        }]
      })
    });
  }

  res.json({ received: true });
}

export const config = { api: { bodyParser: false } };
