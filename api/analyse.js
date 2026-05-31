// api/analyse.js
// User sends their PDF + Stripe token → we verify payment → run Claude analysis → return report

const SYSTEM_PROMPT = `You are a UK tenancy law expert specialising in the Renters' Rights Act 2025 and its impact on private rented sector agreements in England.

You will analyse a tenancy agreement uploaded as a PDF and return a structured JSON report. Your analysis must reflect the law as it stands from 1 May 2026, when Phase 1 of the Renters' Rights Act came into force.

KEY LEGAL CONTEXT YOU MUST APPLY:
- Assured Shorthold Tenancies (ASTs) no longer exist for new tenancies from 1 May 2026
- Section 21 "no-fault" evictions are abolished from 1 May 2026
- All new tenancies must be periodic (rolling), not fixed-term
- Landlords must now use Section 8 grounds to end a tenancy
- Rent increases must follow the new prescribed process (annual, with proper notice)
- Landlords must give 4 months notice for possession grounds related to sale, family, or own use
- Tenants can request pets and landlords cannot unreasonably refuse
- The Decent Homes Standard applies to the private rented sector

RESPONSE FORMAT:
Return ONLY a valid JSON object. No preamble, no markdown, no explanation outside the JSON.

{
  "tenancy_type": "AST pre-May-2026 | Periodic post-May-2026 | Unknown",
  "signed_before_rra": true | false | null,
  "overall_risk": "red | amber | green",
  "rra_compliance_verdict": "one sentence plain english verdict",
  "summary": "2-3 sentences plain english summary of the lease and its key risks",
  "clauses": [
    {
      "id": "unique_slug",
      "name": "Clause name",
      "risk": "red | amber | green",
      "plain_english": "what this clause means in plain English, max 2 sentences",
      "rra_issue": "if this conflicts with RRA 2025 explain how, otherwise null",
      "what_to_do": "specific actionable advice for the tenant, max 2 sentences"
    }
  ],
  "key_flags": {
    "section_21_clause_present": true | false,
    "fixed_term_clause_present": true | false,
    "rent_increase_compliant": true | false | null,
    "notice_period_compliant": true | false | null,
    "deposit_protection_mentioned": true | false,
    "pets_clause_present": true | false
  },
  "top_3_actions": ["action 1", "action 2", "action 3"],
  "negotiate_these": [
    { "clause": "clause name", "suggested_wording": "what to ask landlord to change it to" }
  ],
  "disclaimer": "This report is for informational purposes only and does not constitute legal advice. Laws may have changed. Consult a solicitor or Shelter for advice specific to your situation."
}

RULES:
- Flag any Section 21 reference as RED immediately
- Flag any fixed-term clause in a post-May-2026 agreement as RED
- Use AMBER for legal but unfavourable clauses
- Use GREEN only for clearly fair and compliant clauses
- Always include at least 5 clauses
- top_3_actions must be specific, not generic`;


export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // CORS headers so your frontend can call this
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { token, pdfBase64, tier } = req.body;
  const isFree = tier === 'free';

  if (!pdfBase64) {
    return res.status(400).json({ error: 'Missing PDF.' });
  }

  if (!isFree && !token) {
    return res.status(400).json({ error: 'Missing payment token.' });
  }

  // ── 1. Verify the Stripe payment token (skip for free tier) ───────────────
  if (!isFree) {
    let tokenData;
    try {
      const kvRes = await fetch(
        `https://edge-config.vercel.com/${process.env.EDGE_CONFIG_ID}/item/token_${token}`,
        { headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}` } }
      );
      tokenData = await kvRes.json();
    } catch {
      return res.status(500).json({ error: 'Could not verify payment.' });
    }

    if (!tokenData || tokenData.used) {
      return res.status(403).json({ error: 'Invalid or already used payment token.' });
    }

    const ONE_HOUR = 60 * 60 * 1000;
    if (Date.now() - tokenData.created > ONE_HOUR) {
      return res.status(403).json({ error: 'Payment session expired. Please contact support.' });
    }

    // ── 2. Mark token as used immediately (prevents double-use) ─────────────
    await fetch(`https://api.vercel.com/v1/edge-config/${process.env.EDGE_CONFIG_ID}/items`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [{ operation: 'upsert', key: `token_${token}`, value: { used: true, created: tokenData.created } }]
      })
    });
  }

  // ── 3. Call Claude API with the PDF ───────────────────────────────────────
  let claudeResponse;
  try {
    claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: isFree ? 1500 : 4000,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 }
            },
            {
              type: 'text',
              text: isFree
                ? 'Analyse this tenancy agreement. Return ONLY the top 3 most serious red flags as clauses. Keep the response short — no negotiate_these section, and limit top_3_actions to brief one-liners. Return the full JSON structure but with only 3 clauses maximum.'
                : 'Analyse this tenancy agreement and return the full JSON report. Check carefully for compliance with the Renters Rights Act 2025 which came into force on 1 May 2026.'
            }
          ]
        }]
      })
    });
  } catch (err) {
    return res.status(500).json({ error: 'Analysis service unavailable. Please try again.' });
  }

  const claudeData = await claudeResponse.json();

  if (claudeData.error) {
    return res.status(500).json({ error: 'Analysis failed. Please contact support.' });
  }

  const rawText = claudeData.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  const clean = rawText.replace(/```json|```/g, '').trim();

  let report;
  try {
    report = JSON.parse(clean);
  } catch {
    return res.status(500).json({ error: 'Could not parse analysis. Please try again.' });
  }

  // ── 4. Return the report ───────────────────────────────────────────────────
  return res.status(200).json({ success: true, report });
}
