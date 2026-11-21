# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Supabase, deployed on Vercel. This matches the owner's other projects, and the owner approved it in conversation on 2026-11-21.

## Users

- **Customers of a skincare brand**, on their own phones, usually arriving from a social media link (Instagram or Facebook). They want to know what is going on with their skin and what to put on it, in about a minute, without a dermatologist visit or a sales pitch.
- **Brand staff**, who read incoming order requests in the Supabase dashboard and phone the customer to confirm.

## Product Purpose

A phone-browser skin check. The customer scans their face with the front camera and gets a friendly cosmetic report on redness, evenness and dark spots, dark circles, shine, and skin tone (descriptive only). They answer a short quiz, get a morning and evening routine built from the brand's own products, and send an order request. The brand has no online shop, so the order request is the sale.

Success means finished scans turn into order requests, and repeat scans of the same face in the same conditions give nearly the same scores (within ±5 out of 100).

## Positioning

The analysis runs entirely on the phone. The face photo is never uploaded, there is no fee per scan, and the results come from measurement (color math on face zones), not a chatbot's opinion. Product picks come from fixed rules with safety filters, so the app never invents products or recommends something unsafe.

## Operating Context

- Used on a phone, often in mixed indoor light. The screen itself is the light source ("screen flash").
- Links shared on social media may open in in-app browsers, which can block the camera.
- Phase 1 has no trained AI models, no acne, wrinkle or pore detection, no payments, no accounts, and no admin UI.
- Design spec: `docs/superpowers/specs/2026-11-21-skin-check-phase1-design.md`.

## Capabilities and Constraints

- Cosmetic, not medical: wording is "signs of redness", never a diagnosis.
- Skin tone is information only and never scored.
- No face image ever leaves the device.
- Only permissively licensed code and models (Apache 2.0, MIT, BSD).
- English UI first, with all text in one file for later translation.
- Undecided as of 2026-11-21: launch country (affects phone format, database region and privacy rules), whether paid social ads need conversion tracking, who will test across skin tones, the brand name, logo, colors, currency, and the real product catalog. Placeholders are used until the owner provides these.

## Brand Commitments

None yet. No brand name, logo, or palette has been provided. Do not invent a brand identity that looks final. Brand values live in one config file.

## Evidence on Hand

None. No real products, prices, customer photos, testimonials, or clinical claims exist. Sample products must be clearly marked as samples. Never fabricate results claims, customer counts, or dermatologist endorsements.

## Product Principles

1. Trust before sale: be honest, consistent and private first, and let the sale follow.
2. Measure, don't guess: show what was measured and where, and say plainly what the camera cannot see.
3. One clear next step on every screen.
4. Safe by default: when unsure, recommend less.
5. Every skin tone gets the same care: no tone is a problem to fix.

## Accessibility & Inclusion

Must work for all skin tones and on mid-range phones. Text must stay readable on a bright white "screen flash" background. Respect reduced motion. Clear guidance for users who cannot or will not use the camera.
