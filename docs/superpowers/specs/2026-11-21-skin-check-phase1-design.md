# Skin Check, phase 1: design

Date: 2026-11-21
Status: draft, waiting for owner approval

## 1. Intent

A skincare brand with no online shop wants a mobile website where a customer:

1. scans their face with the phone's front camera,
2. gets a friendly cosmetic skin report (what looks good, what could improve),
3. gets a simple morning and evening routine,
4. sees which of the brand's own products fit that routine,
5. sends an order request, and the brand then calls them to confirm.

Why: to sell the brand's products by first helping customers understand their skin. The scan only works as a sales tool if people trust it, so it has to be consistent, honest and private.

Who uses it:
- Customers, on their own phones (iPhone Safari and Android Chrome), often arriving from a social media link.
- Brand staff, who read incoming orders in the Supabase dashboard.

What success looks like in phase 1:
- People finish the scan and send orders. We measure the share of finished scans that end in an order.
- The same person scanned twice in the same conditions gets nearly the same scores (target: within ±5 points out of 100).
- The analysis takes under about 3 seconds on a mid-range phone.

## 2. Goals (phase 1)

- Guided capture with the front camera, using the screen as a light source ("screen flash"), with live quality checks.
- Face landmarks and face zones in the browser, using MediaPipe Face Landmarker.
- Color-math measurements: redness, evenness and dark spots, dark circles, shine, plus skin tone (descriptive only).
- A short quiz for what the camera can't see.
- A rule engine that turns scores and answers into concerns, then ingredients, then a routine built from the brand's products.
- A report screen.
- An order request form saved to Supabase.
- All UI text in English, kept in one file so other languages are easy to add later.
- Brand settings (name, logo, colors, currency, contact link) in one config file, using placeholders until the brand sends real ones.

## 3. Non-goals (not in phase 1)

- No trained AI models. No acne, wrinkle or pore detection (phases 2 and 3).
- No online payment. The brand confirms by phone, then takes cash on delivery or a bank transfer.
- No customer accounts or logins, and no progress tracking across visits.
- No admin screens. Staff use the Supabase dashboard.
- No chat-AI-written reports. Report text comes from templates.
- No native app.
- No order notifications (email or Telegram). Staff check the dashboard. This is a small add-on later.

## 4. Anti-goals (a failure even if it technically works)

- Medical language or diagnosis ("you have rosacea"). Wording is cosmetic: "signs of redness".
- Treating skin tone as good or bad. Tone is shown as information only and never scored.
- Scores that jump between repeat scans of the same face.
- The face photo leaving the phone in any form: not uploaded, stored, logged or sent to analytics.
- Recommending something unsafe, such as a retinoid to someone pregnant or breastfeeding, or strong acids to someone with very sensitive skin.
- Inventing products, or pushing products the brand doesn't have for a step. If no product fits a step, say so honestly.
- Silently failing on a bad camera or an in-app browser. The user must always be told what to do next.

## 5. Constraints

- Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Supabase, deployed on Vercel. This matches the owner's other projects (invitation_site, ayiig-taa, tsogts-admin).
- Browsers: iOS Safari 16 and later, and Android Chrome from the last three years or so. The camera only works on an https site (localhost is fine during development).
- In-app browsers: links shared on Instagram or Facebook open in those apps' built-in browsers, where camera access may be blocked. Detect a failed camera start and show clear steps to open the page in Safari or Chrome.
- All image analysis runs in the browser. Serve MediaPipe's model and wasm files from our own site (`/public`), not a third-party CDN, for privacy and reliability.
- Licenses: only permissive ones (Apache 2.0, MIT, BSD). No Ultralytics/AGPL code or models, and no non-commercial datasets or weights.
- Phone screen brightness can't be set from a web page, so the capture screen tells the user to turn brightness up.
- This is a cosmetic tool, not a medical device. A short disclaimer appears on the report.

## 6. Approaches considered

### 6.1 Analysis engine

| Approach | Trade-off |
|---|---|
| **On-device hybrid (picked)**: MediaPipe plus our own color math now, our own small trained models later, all in the browser | Nothing to pay per scan, the photo stays on the phone, results are consistent and the brand owns the tech. Weaker on day 1: no acne, wrinkles or pores in phase 1. |
| Paid skin-analysis API (Perfect Corp, Haut.AI, Revieve) | Best quality on day 1, but pays per scan forever, sends photos to a third party, and the brand doesn't own it. Rejected because of cost. |
| Chat AI vision (send the photo to an LLM) | Fast to prototype, but scores change between scans, it can invent findings, and the photo leaves the phone. Rejected. |

The owner picked on-device hybrid.

### 6.2 Lighting

| Approach | Trade-off |
|---|---|
| **Screen flash (picked)**: the screen shows a bright white frame around the camera preview | Works with the front camera on every phone, and the user can see themselves. Weak in bright sunlight, which the quality checks handle. |
| Rear flashlight | The user can't see their own face, browser control is unreliable on iPhone, and it causes heavy glare. Rejected. |
| Room light only | The least consistent option. Used only as a fallback when the room is already bright enough. |

### 6.3 Ordering

| Approach | Trade-off |
|---|---|
| **Order form saved to Supabase (picked)** | We learn which scans turned into orders, and the brand gets the skin result with each order. Means storing names and phone numbers, which requires a consent checkbox. |
| Chat link only (Instagram, Messenger) | Fastest to build, but we can't measure conversion and some apps can't prefill the product list. Kept only as a small "or message us" link. |

The owner picked the order form.

## 7. What gets built

### 7.1 User flow

1. **Welcome**: what the scan does, about 1 minute, the photo never leaves your phone, "not medical advice". Start button.
2. **Tips**: remove makeup and glasses, hair away from the face, face a window or stay indoors, turn screen brightness up.
3. **Camera**: an oval face guide on a bright white screen with live checks (7.2). Captures automatically when all checks pass.
4. **Analyzing**: a short progress screen while measurements run in the browser.
5. **Quiz**: 7 quick questions (7.4).
6. **Report**: scores, what they mean, the routine and products (7.6).
7. **Order form** (7.7), then a **Thank you** screen.

The user can retake the scan from the report. Leaving the page drops the photo from memory.

### 7.2 Capture and quality checks

- Start the front camera (`facingMode: "user"`) at the highest resolution available up to 1920×1080. Build the white "screen flash" frame around the preview.
- Run Face Landmarker in VIDEO mode on the live preview and show each check as a simple hint ("move closer", "turn your face toward the light"):
  - exactly one face,
  - face size inside the oval (distance),
  - head straight: yaw, pitch and roll within about ±10°, from the face transform matrix,
  - skin brightness inside a usable range (not too dark, not blown out),
  - left and right cheeks of similar brightness (no strong side light),
  - face held still (little landmark movement).
- When all checks pass for about 1 second, capture a short burst (about 5 frames). Drop blurry frames (Laplacian variance below a threshold) and analyze the sharpest one. Using a median of the measurements across good frames instead is left to the builder.
- If the camera can't start (permission denied, in-app browser, no camera), show a specific explanation and steps.

### 7.3 Measurements

All measurements run on the captured frame in the browser.

- Run Face Landmarker in IMAGE mode on the full-resolution frame.
- Build zones from landmark polygons: forehead, nose, left cheek, right cheek, chin, left under-eye, right under-eye. Remove eyes, brows, lips and nostrils. Within skin, ignore pixels that are clearly hair, beard or deep shadow.
- Convert colors from sRGB to linear, then XYZ (D65), then CIELAB.
- Prefer relative measures (comparing zones of the same face, or a pixel against its surroundings) over absolute ones, because room light changes absolute values.

| Measure | Method | Shown as |
|---|---|---|
| Redness | a* of cheeks and nose, plus the share of skin pixels whose a* is clearly above the face's own baseline. Also build a redness map for the overlay | 0–100 score (higher means calmer skin), zone highlight |
| Evenness and dark spots | Spread of L* after removing smooth lighting gradients (subtract a heavily blurred copy), plus a count of small local dark blobs | 0–100 score, spot markers |
| Dark circles | Under-eye L* compared with cheek L* (ΔL*) | 0–100 score |
| Shine | Share of specular pixels (very bright, low saturation) in the T-zone (forehead and nose) compared with the cheeks | 0–100 score plus a label (matte, balanced, shiny) |
| Skin tone | ITA° = arctan((L* − 50) / b*) × 180/π from the median of the cheeks, mapped to the standard ITA categories | Text only, never scored |

- Scores map raw values to 0–100 with simple curves. Initial thresholds come from the builder's reading and testing, and get tuned later.
- A debug mode (`?debug=1`) shows raw values for each zone, the zone outlines and the masks on the photo. This is how thresholds get tuned.

### 7.4 Quiz

Seven questions, single taps where possible:

1. How does your skin feel by midday? (oily all over / oily T-zone only / normal / tight or dry)
2. How often do you get breakouts? (rarely / sometimes / often / painful deep spots)
3. Do products often sting or make you red? (no / sometimes / often)
4. What do you most want to improve? (pick up to 2: clearer skin, more even tone, less redness, more hydration, firmer skin and fewer lines, brighter eye area)
5. Age range (under 20 / 20–29 / 30–39 / 40–49 / 50+)
6. Are you pregnant or breastfeeding? (yes / no / prefer not to say). "Prefer not to say" is treated as yes for safety.
7. How much time do you spend in the sun most days? (little / some / a lot)

The quiz covers what phase 1 can't see. Breakouts in particular come only from question 2, since there is no acne detection yet.

### 7.5 Rule engine

- Concerns: oiliness, breakouts, redness, uneven tone and dark spots, dark circles, dryness, sensitivity, aging signs.
- Each concern gets a level (none, mild, moderate, high) from camera scores, quiz answers, or both. For example, oiliness comes from shine plus question 1, and breakouts come from question 2 only.
- Concern to ingredient map (initial version, the builder may refine it):
  - oiliness and breakouts: salicylic acid, niacinamide, benzoyl peroxide
  - uneven tone and dark spots: vitamin C, niacinamide, azelaic acid, sunscreen
  - redness and sensitivity: azelaic acid, centella, fragrance-free formulas
  - aging signs: retinoids, sunscreen
  - dryness: ceramides, glycerin, hyaluronic acid
  - dark circles: caffeine, vitamin C (with modest expectations)
- Routine slots: morning is cleanser, then serum, moisturizer, sunscreen. Evening is cleanser, then treatment, moisturizer. Eye cream is optional. Each slot gets the best-matching product, up to about 5 products in total. Sunscreen is always included.
- Safety filters run before matching. They are deliberately strict, because no formulator has reviewed them yet:
  - pregnant, breastfeeding or "prefer not to say": no retinoids (including retinol and retinal), no hydroquinone, no salicylic acid above 2%, no peels (AHA above 10%)
  - sensitivity "sometimes": no fragrance or essential oils
  - sensitivity "often": the "sometimes" rules plus no AHA above 10%, no salicylic acid above 2%, no benzoyl peroxide above 2.5%, and no retinoids
  - under 20: no retinoids, no peels
  - Before launch, someone at the brand who knows the formulas checks these rules and the safety flags on each real product. This step is on the launch checklist.
- If no product fits a slot, show "nothing from our range here yet" and the ingredient to look for. Never fill a slot with a poor match.
- If question 2 is "painful deep spots", or redness is very high, show a gentle "consider seeing a dermatologist" note.
- Product data lives in a typed data file in the repo for phase 1. It holds about 8 sample products until the brand sends real ones. Each product has: id, name, type (slot), price, image, key ingredients, concerns it helps, suitable skin feel, safety flags (retinoid, hydroquinone, salicylic acid %, AHA %, benzoyl peroxide %, fragrance, essential oils), and morning or evening use.

### 7.6 Report screen

- The captured photo (from memory only) with a zone overlay that can be turned on and off, per concern.
- A summary line, then one card per measured concern: a score bar, one sentence on what it means, and what helps (ingredients). Skin tone appears as a neutral info card.
- Concerns that came only from the quiz (breakouts, dryness, sensitivity) are labeled as "from your answers".
- The morning and evening routine with product cards: image, name, price, and a short "why this for you".
- Buttons: "Order these" (the main action), "Message us" (secondary link from config), and "Retake scan".
- A cosmetic disclaimer at the bottom.

### 7.7 Order form and data

- The form opens with the recommended products already checked, each with quantity 1. The customer can uncheck products or change quantities. The total updates live.
- Fields: name (required), phone (required), address or city (optional), note (optional), and a consent checkbox (required): "Save my order and skin results so [brand] can contact me."
- On submit, a Next.js route handler validates the input (zod), recalculates prices and the total from the product data file (the browser's numbers are never trusted), and inserts a row into Supabase using the service role key. That key lives on the server only.
- `orders` table: id, created_at, name, phone, address, note, items (jsonb: product_id, name, unit price, qty), total, currency, scan_scores (jsonb: scores and raw measurements, no image), quiz (jsonb, without the pregnancy answer), consent (bool), and source fields (utm_source, utm_medium, utm_campaign).
- `scans` table: when a report is shown, store an anonymous row with id, created_at, scores and raw measurements, capture quality values, device type (phone OS and browser family), source fields (utm_*), and `ordered` (bool). No image, no identity, no quiz health answers. When an order is placed, the server sets `ordered = true` on that scan's row. The order row never stores the scan id, so scans stay anonymous and can't be linked back to a named person. This measures scans versus orders and collects real raw values for tuning thresholds. A short notice on the welcome screen says anonymous scan numbers are saved.
- Source tracking: UTM values from the landing URL are kept in sessionStorage and attached to the scan and order rows. No cookies, no third-party scripts.
- A simple privacy page (template text the brand completes) covers what is stored, why, for how long, and how to ask for an order to be deleted (a contact method from config).
- Row Level Security on, with no public read or write on either table. Only the server route writes. Staff read in the Supabase dashboard.
- Basic abuse protection on the route: a request size limit, field length limits, and a simple per-IP rate limit.
- The thank-you screen text (for example "We'll call you soon to confirm") comes from config.

### 7.8 Config and text

- `brand` config: name, logo, primary and accent colors, currency code and symbol, contact link and label, phone, thank-you text.
- `messages` file: all UI and report template text in English.
- Placeholders until the brand sends real values.

## 8. Testing

- Unit tests: color conversion against known reference values, each measurement function on synthetic test images (for example a red patch raises the redness score, an uneven patch lowers evenness), rule engine cases including the safety filters, and order validation and total recalculation.
- Manual device checks on at least one recent iPhone (Safari) and one mid-range Android phone (Chrome). Also open the link from inside the Instagram app to test the in-app browser path.
- Consistency check: 5 back-to-back scans of the same person in the same conditions, using debug mode. Each score must stay within ±5. Run it on at least 3 people with clearly different skin tones.
- Skin-tone fairness check: redness and dark circles are measured against each face's own baseline. Before launch, compare scores across ITA skin-tone groups in the test group. Deeper tones must not score systematically worse on redness or dark circles just because of tone.
- Check that no request ever contains image data, by watching network requests during a full scan.

## 9. Left to the builder

- Exact landmark indices for each zone polygon.
- Score curves and starting thresholds (tuned later with debug mode and the `scans` data).
- Hair and shadow masking details, and whether to use one frame or a median of frames.
- Visual design within the brand colors, plus screen and component structure.
- Quiz and report wording, within the cosmetic-language rule.
- The rate limiting method.
- The sample product list.
- Running MediaPipe on the GPU or CPU, with fallback.

## 10. Later phases (context only)

- Phase 2: our own acne detector (permissively licensed detector such as RT-DETR or YOLOX, fine-tuned on commercially licensed data plus customer photos shared with explicit opt-in), running in the browser through ONNX Runtime Web.
- Phase 3: wrinkles, pores, progress tracking, order notifications, and an admin page.
