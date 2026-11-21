# Skin Check (phase 1)

A phone-browser skin check. The customer scans their face with the front camera (the screen is the light). The face is measured on the phone, and the customer gets a reading, a morning and evening routine from your products, and can send an order request. The face photo never leaves the phone.

- Design: `docs/superpowers/specs/2026-11-21-skin-check-phase1-design.md`
- Build plan: `docs/superpowers/plans/2026-11-21-skin-check-phase1.md`
- Product notes: `PRODUCT.md`

## Run it

```bash
npm install          # also copies the MediaPipe runtime and downloads the face model into public/mediapipe
npm run dev          # http://localhost:3000
npm test             # 83 unit tests: colour math, zones, measurements, quality checks, rules, schemas
npm run build
```

Dev-only URL switches (switched off in production):

| URL | What it does |
|---|---|
| `/?demo=1` | Walk the whole flow without a camera, using illustrative readings |
| `/?demo=1&data=worst` | Same, with a worst-case catalog (long names, $1,249.50 prices, empty ingredient lists, an unflagged retinoid). A toggle at the top switches Demo / Worst case / Empty / One |
| `/?debug=1` | Shows the raw measurements under the report. Use it to tune thresholds on real faces |

The camera only works over https or on localhost. To test on a real phone, deploy to Vercel (a preview link is fine).

## Connect Supabase

1. Create a Supabase project and run `supabase/migrations/0001_init.sql` in its SQL editor.
2. Set these on Vercel (or in `.env.local`):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (server only, never `NEXT_PUBLIC_`)
3. Orders appear in the `orders` table. The `scans` table holds anonymous numbers: count `ordered = true` against all rows to get your scan-to-order rate.

Without these variables the app runs in development (orders are not stored). In production a missing database makes the order fail visibly, so a customer is never told "Order sent" when nothing was saved.

## Make it yours

| File | What to change |
|---|---|
| `src/config/brand.ts` | Brand name, currency, contact link, phone, thank-you text |
| `src/config/messages.ts` | Every sentence the customer reads |
| `src/data/products.ts` | Your real products: names, prices, full ingredient lists, safety flags, which concerns each helps |
| `src/app/globals.css` | Colours (the `--cap` teal is the brand colour) |
| `src/app/privacy/page.tsx` | Your legal details |

## Before launch

- [ ] Real catalog in `products.ts`, with complete ingredient lists. Safety rules also read the ingredient text, but the hand-set flags should still be right.
- [ ] Someone who knows your formulas checks the safety rules in `src/lib/rules/routine.ts` and every product's flags.
- [ ] Scan 3 to 5 people with different skin tones on real iPhone and Android phones, with `?debug=1`. Repeat scans should land within about 5 points. Tune the thresholds in `src/lib/analysis/readings.ts`.
- [ ] Open the link from inside Instagram and Facebook to check the "open in your browser" screen.
- [ ] Decide the launch country: phone format, currency, Supabase region, privacy text.
- [ ] Fill in the privacy page.
