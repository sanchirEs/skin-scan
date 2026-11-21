# Skin Check Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone-browser skin check. It scans the face with the front camera and screen flash, measures skin zones on the device, runs a short quiz, builds a routine from the brand's products with safety rules, and saves an order request to Supabase.

**Architecture:** A Next.js App Router app. The whole customer flow is one client component state machine. All image analysis is pure TypeScript over RGBA buffers (unit-tested in Node), fed by MediaPipe Face Landmarker running in the browser. Only two server routes exist, `POST /api/scans` (anonymous numbers) and `POST /api/orders`. Both validate with zod and write to Supabase with the service-role key. With no Supabase env set they log and succeed, so the app runs locally.

**Tech Stack:** Next.js 16.4, React 19, TypeScript, Tailwind CSS 4, @mediapipe/tasks-vision 1.2, @supabase/supabase-js 2, zod 4, motion 14, @phosphor-icons/react 2, vitest 5.

**Spec:** `docs/superpowers/specs/2026-11-21-skin-check-phase1-design.md`. The direction contract is in `.impeccable/surfaces/src-app-page-tsx.md`, and product truth is in `PRODUCT.md`.

## Global Constraints

- No face image data ever leaves the device. Request bodies carry numbers only.
- Cosmetic wording only. Never diagnose ("signs of redness", never "rosacea").
- Skin tone is shown as information on the tone key and is never scored or ranked.
- Only permissive licenses (Apache 2.0, MIT, BSD). No Ultralytics.
- All UI text lives in `src/config/messages.ts`, and all brand values in `src/config/brand.ts`.
- MediaPipe wasm and the model are served from `/public/mediapipe/`, never from a CDN at runtime.
- No em dashes or en dashes in user-visible copy.
- Light theme only. The screen is the light source during capture (recorded reason).
- Sunscreen is in every routine. Cap the routine at 5 products.
- "Prefer not to say" on pregnancy is treated as yes.
- Order totals are recalculated on the server from `src/data/products.ts`.

## Review Focus

1. Camera blocked, denied, missing, or inside an in-app browser: the user gets a specific explanation and steps (Task 9, `cameraErrorKind` tests).
2. Landmarker model fails to load (slow or offline network): the user gets a retry, not a frozen screen (Task 8, `loadLandmarker` rejects with a typed error, covered by its test).
3. Partial face or tiny zones: measurements return `null` with a reason, never `NaN`, and the flow asks for a retake (Task 4, empty-mask test).
4. Order submit fails or is tapped twice: the form keeps its values and offers retry. A client-generated order id makes a duplicate insert a no-op (Task 7, duplicate-id test).
5. Extreme light (dark room, direct sun, clipped highlights): quality checks block capture with the right single hint (Task 5, clipped-pixel test).

---

### Task 1: Scaffold and tooling

**Files:**
- Create: the Next.js app via `npx create-next-app@16.4.6 . --ts --tailwind --app --src-dir --eslint --import-alias "@/*" --use-npm --yes`
- Create: `vitest.config.ts`, `scripts/fetch-mediapipe.mjs`, `src/lib/smoke.test.ts`
- Modify: `package.json` (scripts `test`, `fetch:mediapipe`, `postinstall`)

- [ ] Scaffold the app, then install `@mediapipe/tasks-vision@1.2.3 @supabase/supabase-js zod motion @phosphor-icons/react` and dev `vitest`.
- [ ] Write `scripts/fetch-mediapipe.mjs`. It copies `node_modules/@mediapipe/tasks-vision/wasm/*` to `public/mediapipe/wasm/` and downloads `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task` to `public/mediapipe/face_landmarker.task`, skipping the download when the file already exists.
- [ ] Run `npm run fetch:mediapipe`. Expected: both paths exist, and the model is over 3 MB.
- [ ] Write the smoke test `expect(1 + 1).toBe(2)` and run `npx vitest run`. Expected: 1 passed.
- [ ] Run `npm run build`. Expected: the build succeeds.
- [ ] Commit `chore: scaffold next app with tooling`.

### Task 2: Color conversion

**Files:** Create `src/lib/color/convert.ts` and `src/lib/color/convert.test.ts`.

**Interfaces:**
- Produces: `srgbToLab(r: number, g: number, b: number): [L: number, a: number, b: number]` (0-255 in, D65), `labToSrgb(L, a, b): [r, g, b]`, `ita(L: number, b: number): number` (degrees), `itaCategory(deg: number): ToneCategory` where `type ToneCategory = "very-light" | "light" | "intermediate" | "tan" | "brown" | "dark"`, and `isSpecular(r, g, b): boolean` (HSV V > 0.92 and S < 0.18).

- [ ] Tests:
  - white gives L≈100, a≈0, b≈0 (±0.5)
  - pure red (255,0,0) gives L≈53.24, a≈80.09, b≈67.20 (±0.1)
  - mid grey (119,119,119) gives L≈50.0 (±0.5)
  - round trip for (200,150,120) within 1 per channel
  - `ita(70, 15)` ≈ 53.13
  - category edges: 56 is very-light, 50 light, 30 intermediate, 20 tan, -10 brown, -40 dark
  - `isSpecular(250,248,245)` is true and `isSpecular(200,150,120)` is false
- [ ] Implement with the standard sRGB companding, the D65 white point (95.047, 100, 108.883) and CIE epsilon/kappa. ITA bounds: >55 very-light, >41 light, >28 intermediate, >10 tan, >-30 brown, else dark.
- [ ] Run `npx vitest run src/lib/color`. Expected: pass. Commit `feat: color conversion and ITA`.

### Task 3: Geometry, masks and face zones

**Files:** Create `src/lib/analysis/geometry.ts`, `src/lib/analysis/zones.ts`, and their tests `geometry.test.ts` and `zones.test.ts`.

**Interfaces:**
- Produces in `geometry.ts`:
  - `type Pt = { x: number; y: number }` (pixels)
  - `type Mask = { width: number; height: number; data: Uint8Array }`
  - `rasterizePolygon(pts: Pt[], w: number, h: number): Mask`, a scanline even-odd fill
  - `ellipseMask(c: Pt, rx: number, ry: number, w: number, h: number): Mask`
  - `scalePolygon(pts: Pt[], factor: number): Pt[]`, which scales about the centroid
  - `intersect(a: Mask, b: Mask): Mask` and `subtract(a: Mask, b: Mask): Mask`
  - `countMask(m: Mask): number`
- Produces in `zones.ts`:
  - `type ZoneId = "forehead" | "nose" | "cheekL" | "cheekR" | "chin" | "underEyeL" | "underEyeR"`, where L and R are image sides
  - `buildZones(lm: Pt[], w: number, h: number): Record<ZoneId, Mask>`
  - `FACE_OVAL`, `LIPS`, `EYE_L`, `EYE_R`, `BROW_L`, `BROW_R` index arrays
- Zone rules (exact):
  - eyeSpan = |lm[33] - lm[263]|
  - forehead: ellipse at lerp(lm[9], lm[10], 0.45), rx 0.38·eyeSpan, ry 0.33·|lm[9]-lm[10]|
  - cheeks: ellipses at lm[50] and lm[280], rx 0.22·eyeSpan, ry 0.20·eyeSpan
  - nose: a quad around segment lm[168]→lm[4], half-width 0.07·eyeSpan at the top and 0.13·eyeSpan at the bottom, with the bottom 15% trimmed
  - chin: a quad from lm[17] to lm[152], top half-width 0.55·|lm[61]-lm[291]|/2, bottom half-width 0.35·the same, scaled by 0.85
  - under-eye: the lower-lid points (L: 33,7,163,144,145,153,154,155,133; R: 263,249,390,373,374,380,381,382,362) translated down 0.10·eyeSpan form the top edge, and the same translated down 0.28·eyeSpan form the bottom edge
  - every zone is intersected with the face oval, then has eyes, brows and lips subtracted, each scaled by 1.35
- [ ] Tests:
  - a 10×10 square polygon in a 20×20 frame has count 100 (±10)
  - an ellipse of rx 5, ry 5 has count ≈ 78.5 (±8)
  - subtracting a mask from itself gives 0
  - `scalePolygon` by 0.5 keeps the centroid
  - `buildZones` on the synthetic face fixture `makeFixtureLandmarks(400, 400)` (defined in the test with all used indices placed on a plausible frontal layout) gives every zone count > 50 and no overlap between `underEyeL` and `EYE_L`
- [ ] Implement, run the tests, then commit `feat: face zone masks`.

### Task 4: Measurements and readings

**Files:** Create `src/lib/analysis/measure.ts`, `src/lib/analysis/readings.ts`, `src/lib/analysis/types.ts`, and the tests `measure.test.ts` and `readings.test.ts`.

**Interfaces:**
- Consumes: Task 2 and Task 3 exports.
- Produces:
  - `type Rgba = { width: number; height: number; data: Uint8ClampedArray }`
  - `type RawMetrics = { rednessMeanA: number; rednessFraction: number; evennessStd: number; spotCount: number; spotsPerKpx: number; darkCircleDeltaL: number; shineT: number; shineCheeks: number; toneL: number; toneB: number; itaDeg: number; zonePixels: Record<ZoneId, number> }`
  - `measure(img: Rgba, zones: Record<ZoneId, Mask>): { ok: true; raw: RawMetrics; maps: { redness: Uint8Array; spots: Pt[] } } | { ok: false; reason: "too-few-pixels" | "overexposed" | "underexposed" }`
  - `type Level = "none" | "mild" | "moderate" | "high"`
  - `type Reading = { id: MeasureId; intensity: number /*0..100*/; level: Level; label?: string }`
  - `type MeasureId = "redness" | "evenness" | "darkCircles" | "shine"`
  - `toReadings(raw: RawMetrics): { readings: Reading[]; tone: { ita: number; category: ToneCategory } }`
- Rules:
  - Skin pixels are zone pixels that are not specular and have L* in [15, 97]
  - Any zone under 40 skin pixels gives `too-few-pixels`
  - If more than 25% of cheek pixels are specular or L* > 97, the result is `overexposed`. A median cheek L* below 18 is `underexposed`
  - Redness: baseline = median a* over all zones. rednessFraction = share of cheek and nose skin pixels with a* > baseline + 6. rednessMeanA = mean a* over the cheeks and nose. Intensity = 70·clamp01((fraction − 0.03)/0.22) + 30·clamp01((meanA − 10)/12)
  - Evenness: in the cheeks and forehead, residual = L* − masked box blur (radius = round(width/24)). evennessStd = std(residual). Spots = 4-connected components with residual < −2.2·std and area in [3, 120] px. Intensity = 60·clamp01((std − 1.2)/3.8) + 40·clamp01(spotsPerKpx/1.5)
  - Dark circles: deltaL = median L*(cheekL ∪ cheekR) − median L*(underEyeL ∪ underEyeR). Intensity = 100·clamp01((deltaL − 3)/11)
  - Shine: shineT = specular share of forehead ∪ nose, and shineCheeks the same for the cheeks. Intensity = 100·clamp01((shineT − 0.02)/0.18). The label is "matte" under 20, "balanced" under 55, and "shiny" otherwise
  - Tone: median L* and b* of the cheeks, giving ITA
  - Levels: under 20 none, under 45 mild, under 70 moderate, else high
- [ ] Tests (synthetic `Rgba` builders inside the test):
  - a uniform skin-colour image gives redness intensity < 20 and evenness intensity < 20
  - the same image with 30% of cheek pixels pushed +12 in a* gives a redness level of at least moderate
  - adding 10 dark 3×3 blobs inside the cheeks gives spotCount ≥ 8
  - under-eye 9 L* darker than the cheeks gives darkCircles ≥ moderate
  - 20% specular pixels in the forehead gives the shine label "shiny"
  - an empty mask gives `{ ok: false, reason: "too-few-pixels" }`
  - 40% clipped white cheeks gives `overexposed`
  - the same uniform image at three skin tones (ITA 50, 20, −35) gives redness and dark-circle intensities that differ by under 10 between tones (fairness)
- [ ] Implement, run the tests, then commit `feat: skin measurements and readings`.

### Task 5: Capture quality checks

**Files:** Create `src/lib/analysis/quality.ts` and `quality.test.ts`.

**Interfaces:**
- Produces:
  - `type Hint = "no-face" | "one-face" | "closer" | "farther" | "center" | "straight" | "more-light" | "less-light" | "even-light" | "hold-still" | "ok"`
  - `type QualityInput = { faces: number; bbox: { x: number; y: number; w: number; h: number } /*0..1*/; poseDeg: { yaw: number; pitch: number; roll: number }; cheekL: number /*L* median*/; cheekR: number; clippedShare: number; motion: number /*mean landmark move, fraction of face width*/ }`
  - `checkQuality(q: QualityInput): Hint`, which returns the first failing hint in this exact order: no-face, one-face, closer (bbox.w < 0.38), farther (> 0.66), center (|center − 0.5| > 0.12 on either axis), straight (|yaw| or |pitch| > 12, or |roll| > 10), more-light (mean cheek L* < 38), less-light (clippedShare > 0.12 or mean > 88), even-light (|L − R| > 9), hold-still (motion > 0.012), ok
  - `poseFromMatrix(m: number[] /*4x4 column-major*/): { yaw; pitch; roll }`
  - `laplacianVariance(gray: Uint8Array, w: number, h: number): number`
- [ ] Tests:
  - one test per hint in order (each case breaks only that rule)
  - an identity matrix gives a pose of 0,0,0
  - a 20° rotation about Y gives yaw 20 (±0.5)
  - a checkerboard has higher Laplacian variance than its box-blurred copy
  - clippedShare 0.3 with otherwise-good input gives "less-light"
- [ ] Implement, run the tests, then commit `feat: capture quality checks`.

### Task 6: Quiz, concerns and routine rules

**Files:** Create `src/lib/rules/types.ts`, `src/lib/rules/concerns.ts`, `src/lib/rules/routine.ts`, `src/data/products.ts`, and the tests `concerns.test.ts` and `routine.test.ts`.

**Interfaces:**
- Produces:
  - `type QuizAnswers = { feel: "oily" | "t-zone" | "normal" | "dry"; breakouts: "rarely" | "sometimes" | "often" | "painful"; stinging: "no" | "sometimes" | "often"; goals: Goal[] /*max 2*/; age: "<20" | "20-29" | "30-39" | "40-49" | "50+"; pregnant: "yes" | "no" | "prefer-not"; sun: "little" | "some" | "a-lot" }`
  - `type Goal = "clear" | "even" | "calm" | "hydrate" | "firm" | "eyes"`
  - `type ConcernId = "oiliness" | "breakouts" | "redness" | "uneven" | "darkCircles" | "dryness" | "sensitivity" | "aging"`
  - `type Concern = { id: ConcernId; level: Level; source: "measured" | "answers" | "both" }`
  - `deriveConcerns(readings: Reading[], q: QuizAnswers): Concern[]`, sorted by level then the order above
  - `type Slot = "am-cleanser" | "am-serum" | "am-moisturizer" | "am-sunscreen" | "pm-cleanser" | "pm-treatment" | "pm-moisturizer" | "eye"`
  - `type Product = { id: string; name: string; slot: Slot[]; price: number; image: string; ingredients: string[]; helps: ConcernId[]; feel: QuizAnswers["feel"][]; flags: { retinoid?: boolean; hydroquinone?: boolean; salicylicPct?: number; ahaPct?: number; bpoPct?: number; fragrance?: boolean; essentialOils?: boolean }; sample: true }`
  - `buildRoutine(concerns: Concern[], q: QuizAnswers, catalog: Product[]): { slots: { slot: Slot; product: Product | null; reason: ConcernId | null; lookFor: string[] }[]; excluded: { product: Product; rule: SafetyRule }[]; seeDermatologist: boolean }`
  - `type SafetyRule = "pregnancy" | "sensitive" | "very-sensitive" | "under-20"`
  - `INGREDIENTS: Record<ConcernId, string[]>`, exactly as in spec §7.5
- Rules:
  - Concern levels:
    - oiliness: max(shine level, feel oily → moderate, t-zone → mild)
    - breakouts: rarely none, sometimes mild, often moderate, painful high
    - sensitivity: no none, sometimes mild, often high
    - dryness: feel dry → moderate
    - aging: goal firm → mild, plus one step if age 40+
    - redness, uneven and darkCircles come from readings, each raised to at least mild when the matching goal (calm, even, eyes) is picked
    - any concern at "none" is dropped
  - Safety filters, exactly as in spec §7.5:
    - pregnant yes or prefer-not: no retinoid, no hydroquinone, salicylicPct ≤ 2, ahaPct ≤ 10
    - stinging sometimes: no fragrance, no essentialOils
    - stinging often: the "sometimes" rules plus ahaPct ≤ 10, salicylicPct ≤ 2, bpoPct ≤ 2.5, no retinoid
    - age <20: no retinoid, ahaPct ≤ 10
  - Slot filling: the slots are am-cleanser, am-serum, am-moisturizer, am-sunscreen, pm-cleanser, pm-treatment, pm-moisturizer, plus eye only when darkCircles is at least mild. Score = Σ over the product's concerns, weighted by level (mild 1, moderate 2, high 3), +1 if feel matches, then take the best. One product may fill both a morning and an evening slot. Cap at 5 distinct products, dropping the lowest-scoring non-sunscreen slots. An empty slot gets product null and the `lookFor` ingredients
  - seeDermatologist is true when breakouts is "painful" or redness intensity ≥ 85
- [ ] `products.ts`: 8 sample products covering every slot, with realistic but clearly sample names (marked `sample: true`). Include at least one retinoid serum, one 2% salicylic cleanser, one fragranced moisturizer, one SPF 50 sunscreen, and one caffeine eye cream. Images go under `/products/*.webp`, generated as flat colour placeholders in Task 12.
- [ ] Tests:
  - a pregnant user never gets a retinoid, and the retinoid serum appears in `excluded` with rule "pregnancy"
  - "prefer-not" behaves the same as "yes"
  - stinging "often" excludes the fragranced moisturizer and the retinoid
  - am-sunscreen is always filled when a sunscreen exists in the catalog
  - the routine never has more than 5 distinct products
  - breakouts "painful" sets seeDermatologist
  - with no product for a slot, the slot is null and `lookFor` is non-empty
  - breakouts comes from answers only, with source "answers"
- [ ] Implement, run the tests, then commit `feat: concerns and routine rules`.

### Task 7: Orders, scans, API routes and database

**Files:** Create `src/lib/order/schema.ts`, `src/lib/order/schema.test.ts`, `src/lib/server/supabase.ts`, `src/lib/server/rate-limit.ts`, `src/app/api/orders/route.ts`, `src/app/api/scans/route.ts`, and `supabase/migrations/0001_init.sql`.

**Interfaces:**
- Produces:
  - `OrderRequest` (zod): `{ id: uuid; name: 1-80; phone: 5-25, matching /^[+0-9 ()-]+$/; address?: ≤200; note?: ≤500; consent: literal true; items: { productId: string; qty: 1-9 }[1..10]; scanScores: { readings: Reading[]; tone: {...} }; quiz: Omit<QuizAnswers,"pregnant">; scanId?: uuid; utm?: { source?; medium?; campaign? } }`
  - `priceOrder(items, catalog): { lines: { productId; name; unitPrice; qty }[]; total: number } | { error: "unknown-product" }`
  - `ScanRequest` (zod): `{ id: uuid; readings; tone; quality: Record<string, number>; device: { os: string; browser: string }; utm? }`
  - `POST /api/scans` → `201 { id }`
  - `POST /api/orders` → `201 { id }`, or `400 { error }` / `429`
  - `insertRow(table: "orders" | "scans", row): Promise<"inserted" | "duplicate" | "skipped">`, where "skipped" means no env is set
  - `markScanOrdered(id: string): Promise<void>`
  - `rateLimit(key: string, limit: number, windowMs: number): boolean`, in memory
- SQL:
  - `orders` and `scans` tables as in spec §7.7, with `id uuid primary key` and `created_at timestamptz default now()`
  - `orders` has no scan_id column
  - `scans.ordered boolean default false`
  - RLS enabled on both, with no policies
- [ ] Tests:
  - `priceOrder` ignores client prices and sums from the catalog
  - an unknown product returns an error
  - the schema rejects consent false, a 3-character phone, and 11 items
  - the schema strips a `pregnant` key from quiz
  - a request containing `image` or `photo` keys is rejected (`.strict()`)
- [ ] Route behaviour:
  - limit to 10 requests a minute per IP and 20 KB per body
  - a duplicate id (Postgres 23505) returns 201 with the same id, which makes retries safe
  - an order with a scanId calls `markScanOrdered` and never stores it
- [ ] Run the tests and build, then commit `feat: order and scan api with supabase schema`.

### Task 8: Vision runtime (browser)

**Files:** Create `src/lib/vision/landmarker.ts`, `src/lib/vision/capture.ts`, and `src/lib/vision/analyze-frame.ts`.

**Interfaces:**
- Produces:
  - `loadLandmarker(mode: "VIDEO" | "IMAGE"): Promise<FaceLandmarker>`, which caches per mode, uses `/mediapipe/wasm` and `/mediapipe/face_landmarker.task`, sets `outputFacialTransformationMatrixes: true` and `numFaces: 2`, tries the GPU delegate and falls back to CPU, and rejects with `class VisionLoadError`
  - `liveQuality(video: HTMLVideoElement, lm: FaceLandmarker, prev: Pt[] | null, ts: number): { hint: Hint; landmarks: Pt[] | null }`
  - `captureBurst(video, n = 5): Promise<ImageBitmap[]>`, which keeps the sharpest frame by Laplacian variance on a 160 px grey copy
  - `analyzeFrame(bitmap: ImageBitmap): Promise<{ ok: true; readings; tone; raw; maps; photoUrl: string /*object URL, mirrored*/; zones: Record<ZoneId, Mask>; crop: { w; h } } | { ok: false; reason }>`. It runs IMAGE mode on the full frame, crops the face bbox with a 12% margin, scales to 480 px wide, then calls `buildZones`, `measure` and `toReadings`
- [ ] Verification is manual in the browser in Task 14. `npm run build` passes.
- [ ] Commit `feat: browser vision runtime`.

### Task 9: Design tokens, shell, flow state, welcome and tips

**Files:**
- Create: `src/config/brand.ts`, `src/config/messages.ts`, `src/app/globals.css` (tokens), `src/app/layout.tsx` (Archivo via next/font with the `wdth` axis), `src/components/flow/flow.tsx` (reducer and context), `src/components/flow/SkinCheckApp.tsx`, `src/components/ui/Button.tsx`, `src/components/ui/TopBand.tsx`, `src/components/strip/Strip.tsx`, `src/components/flow/Welcome.tsx`, `src/components/flow/Tips.tsx`, `src/lib/env/camera-support.ts`, `src/lib/env/camera-support.test.ts`, `src/lib/utm.ts`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Produces:
  - `type Step = "welcome" | "tips" | "camera" | "analyzing" | "quiz" | "report" | "order" | "done"`
  - `useFlow(): { state; dispatch }`
  - `Strip({ pads: { id: MeasureId; color: string; label: string }[]; develop?: boolean; example?: boolean })`
  - `cameraErrorKind(err: unknown, ua: string): "denied" | "in-app" | "no-camera" | "insecure" | "unknown"`
  - `captureUtm(search: string): void`
  - `readUtm(): Utm | undefined`
- Tokens (exact): `--strip:#F3F5F2; --ink:#15191B; --ink-soft:#4A5257; --rule:#D5DAD6; --cap:#0E4D48; --cap-ink:#F3F5F2`, plus key ramps `--red-0:#F7E1E1 --red-1:#C2263D --even-0:#EFE6D8 --even-1:#6B4A2B --dark-0:#E9E6EF --dark-1:#4B3F63 --shine-0:#E4E7E8 --shine-1:#8FD3DD`, and the tone chips very-light `#F1D3C2`, light `#E5B89C`, intermediate `#C99674`, tan `#A97452`, brown `#7A4E33`, dark `#4A2E20`.
- [ ] Tests for `cameraErrorKind`:
  - `NotAllowedError` gives denied
  - an Instagram UA with any error gives in-app
  - `NotFoundError` gives no-camera
  - an insecure context gives insecure
- [ ] Build both screens per the FIRST VIEWPORT block of the direction contract.
- [ ] Run `npm run build`, then commit `feat: shell, tokens, welcome and tips`.

### Task 10: Camera screen

**Files:** Create `src/components/flow/Camera.tsx` and `src/components/flow/CameraProblem.tsx`.

- [ ] Use `getUserMedia({ video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })`. The mirrored preview sits in an oval cut-out, and the rest of the screen is `--strip` at full white for the screen flash.
- [ ] Run a requestAnimationFrame loop calling `liveQuality`, throttled to about 15 fps. Show exactly one hint at a time (from messages), with a large sentence and a crossfade between hints. After `ok` holds for 1000 ms, call `captureBurst`, then dispatch analyzing.
- [ ] `CameraProblem` renders per `cameraErrorKind`, with steps and a retry. A model load failure shows a retry button.
- [ ] Stop the stream tracks on unmount.
- [ ] Commit `feat: camera capture with screen flash`.

### Task 11: Analyzing and quiz

**Files:** Create `src/components/flow/Analyzing.tsx` and `src/components/flow/Quiz.tsx`.

- [ ] `Analyzing` runs `analyzeFrame`. On `ok: false` it shows the reason, with a retake button that goes back to camera. It skeletons the strip while it runs.
- [ ] `Quiz` shows one question per view with directional slide transitions (motion, reduced-motion safe). Goals allow up to 2 choices. Back goes to the previous question. A progress line uses strip pads.
- [ ] After the quiz, POST `/api/scans` fire-and-forget with a client uuid, and keep the scanId in state.
- [ ] Commit `feat: analyzing and quiz steps`.

### Task 12: Report

**Files:** Create `src/components/report/Report.tsx`, `KeyScale.tsx`, `ToneKey.tsx`, `ZoneOverlay.tsx`, `Routine.tsx`, `ProductCard.tsx`, `DebugPanel.tsx`, and `scripts/make-placeholders.mjs` (writes flat colour webp product placeholders with ImageMagick into `public/products/`).

- [ ] The strip develops (signature move): the pads fill in sequence at 140 ms stagger, then the markers settle. Under `useReducedMotion` this is instant.
- [ ] For each reading, `KeyScale` shows the ramp, the marker at the intensity, the level word, and one sentence from messages. Tapping the pad highlights its zone on `ZoneOverlay`, which draws the zone masks over the mirrored photo.
- [ ] `ToneKey` shows six equal chips with the user's category marked and no score. Its copy says tone helps pick sunscreen texture and is never something to fix.
- [ ] Quiz-only concerns render with the stamp "from your answers".
- [ ] `Routine` has AM and PM columns of slots. An empty slot reads "nothing from our range here yet, look for: …". There's a seeDermatologist note when set.
- [ ] The primary CTA is "Order these". "Message us" is a secondary link, and "Retake scan" is tertiary. There's a disclaimer at the bottom.
- [ ] With `?debug=1`, `DebugPanel` shows the raw metrics table and the zone outlines.
- [ ] Commit `feat: report with developing strip`.

### Task 13: Order form, thank you, privacy

**Files:** Create `src/components/order/OrderForm.tsx`, `src/components/flow/ThankYou.tsx`, and `src/app/privacy/page.tsx`.

- [ ] Recommended products are prechecked. An unchecked product stays visible and struck through (stamp, not vanish). Quantity is 1-9 and the total updates live.
- [ ] Labels sit above the inputs, with errors below. The consent checkbox is required.
- [ ] Generate the order uuid once per form. Submit is disabled while pending. On failure, show an inline error with retry and keep all values.
- [ ] The thank-you screen uses the brand text from config, with a "Message us" link.
- [ ] The privacy page uses brand-completable template text.
- [ ] Commit `feat: order form and thank you`.

### Task 14: Browser QA

- [ ] Run `npm run dev`. Open the app in the browser pane at 390×844 and at desktop width, and walk the whole flow. The camera can be faked with a test-pattern page or skipped through a dev-only `?demo=1` that feeds a bundled synthetic face image into `analyzeFrame`. Add that path with a clear dev-only guard.
- [ ] Run the break-ui pass: long names, 9 quantities, offline submit, double tap, denied camera.
- [ ] Run `impeccable detect --json src` and fix the mechanical findings.
- [ ] Confirm there's no image data in network requests.
- [ ] Commit `fix: qa pass`.
