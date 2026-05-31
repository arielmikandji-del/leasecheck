# LeaseCheck — Go Live Checklist
# Complete these steps in order. Takes about 2 hours total.

## STEP 1 — GitHub (10 min)
1. Go to github.com → New repository → name it "leasecheck"
2. Upload all files from this folder
3. Done. Vercel will connect to this.

## STEP 2 — Vercel (15 min)
1. Go to vercel.com → Sign up with GitHub
2. Click "Add New Project" → import your leasecheck repo
3. Click Deploy
4. Your site is live at something like leasecheck.vercel.app
5. Later: add your custom domain leasecheck.co.uk in Settings → Domains

## STEP 3 — Vercel Edge Config / KV Store (10 min)
This is the free "notepad" Vercel gives you to store payment tokens temporarily.
1. In Vercel Dashboard → Storage → Edge Config → Create
2. Copy the ID (looks like ecfg_xxxxx) → save it
3. Go to Settings → Tokens → Create token → save it

## STEP 4 — Anthropic API Key (5 min)
1. Go to console.anthropic.com
2. API Keys → Create Key → copy it → save it
3. Add some credit (£10 gets you ~250 analyses at the current rate)

## STEP 5 — Stripe (20 min)
1. Go to stripe.com → create account
2. Get your Secret Key from Developers → API Keys → save it
3. Create 3 Payment Links:
   - Products → Add product → "Quick Scan" £4.99
     → After payment, redirect to: https://leasecheck.co.uk/success.html?session_id={CHECKOUT_SESSION_ID}
     (copy that URL exactly including the {CHECKOUT_SESSION_ID} bit — Stripe fills it in automatically)
   - Repeat for "Full Report" £9.99 and "Landlord Pack" £19.99
4. Webhooks → Add endpoint → URL: https://leasecheck.co.uk/api/webhook
   → Select event: checkout.session.completed
   → Copy the Signing Secret (whsec_xxxxx) → save it

## STEP 6 — Add environment variables to Vercel (10 min)
In Vercel Dashboard → your project → Settings → Environment Variables
Add each of these:

STRIPE_SECRET_KEY          → your Stripe secret key
STRIPE_WEBHOOK_SECRET      → your Stripe webhook signing secret
ANTHROPIC_API_KEY          → your Anthropic key
EDGE_CONFIG_ID             → your Vercel Edge Config ID
VERCEL_API_TOKEN           → your Vercel token
ALLOWED_ORIGIN             → https://leasecheck.co.uk

Then: Deployments → Redeploy (so it picks up the new variables)

## STEP 7 — Update the landing page (5 min)
In leasecheck-landing.html, replace:
  YOUR_STRIPE_LINK_499   → your actual £4.99 Stripe Payment Link URL
  YOUR_STRIPE_LINK_999   → your actual £9.99 Stripe Payment Link URL
  YOUR_STRIPE_LINK_1999  → your actual £19.99 Stripe Payment Link URL

Push to GitHub → Vercel redeploys automatically.

## STEP 8 — Test end to end (15 min)
1. Use Stripe test mode first (toggle in Stripe Dashboard)
2. Go to your site → upload any PDF → click £9.99
3. Use Stripe test card: 4242 4242 4242 4242 / any future date / any CVC
4. Should land on success.html → upload PDF → get report
5. If it works → switch Stripe to live mode → you're live

## TOTAL COST TO RUN
- Vercel: free
- Edge Config: free
- Domain: ~£10/year
- Anthropic API: ~£0.04 per analysis (you charge £9.99)
- Stripe: 1.5% + 25p per transaction
- Net margin per £9.99 sale: ~£9.35

## SUPPORT EMAIL
Set up a free Zoho or Gmail alias: support@leasecheck.co.uk
Add it to the error message in success.html
