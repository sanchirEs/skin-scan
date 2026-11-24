# skin-api

A small HTTP service that the phone app sends face photos to. It forwards the photos to a paid
skin-analysis provider (Perfect Corp YouCam by default, or AILabTools), using an API key that
stays on the server. It then returns a normalized result. Photos are held in memory only: they
are never stored and never logged.

This is a standalone package (own `package.json` and lockfile). It is not part of the Next.js
app's build.

## Run it

```sh
npm install
npm test          # vitest, no network
npm run dev       # tsx watch; reads ./.env if present
npm run build     # tsc -> dist/
npm start         # node dist/index.js
```

To build app UI without spending credits, set `SKIN_PROVIDER=mock`.

## Environment

| Variable             | Default                           | Notes                                                                                                   |
| -------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `PORT`               | `8080`                            | Railway sets this.                                                                                      |
| `SKIN_PROVIDER`      | `youcam`                          | `youcam`, `ailabtools` or `mock`.                                                                       |
| `YOUCAM_API_KEY`     | none                              | Secret. Never logged.                                                                                   |
| `YOUCAM_BASE_URL`    | `https://yce-api-01.makeupar.com` |                                                                                                         |
| `AILABTOOLS_API_KEY` | none                              | Secret. Never logged.                                                                                   |
| `AILAB_BASE_URL`     | `https://www.ailabapi.com`        |                                                                                                         |
| `AILAB_TIER`         | `pro`                             | `pro` (70 credits per successful call) or `advanced` (30 credits). See the AILabTools notes below.       |
| `SKIN_CONCERNS`      | `acne,wrinkles,pores,texture`     | Any of `acne, wrinkles, pores, texture, spots, redness, oiliness, darkCircles, eyeBags, moisture, radiance, firmness`. Results come back in this order. |
| `ALLOWED_ORIGINS`    | none (no browser origins)         | Comma list of exact origins or patterns with `*`, e.g. `http://localhost:3000,https://*-sanchires-projects.vercel.app`. `*` matches letters, digits and `-` only, so it never crosses a dot. |
| `RATE_LIMIT_PER_MIN` | `6`                               | Limit on `POST /v1/analyze` per client IP (first `x-forwarded-for` entry). In memory, per instance.     |
| `MAX_IMAGE_BYTES`    | `5000000`                         | Per photo. `5_000_000` also works.                                                                      |

Empty values count as unset. An invalid value stops the service at startup with a clear error.

### Switching providers

Set `SKIN_PROVIDER` and that provider's key, then restart:

- `SKIN_PROVIDER=youcam` with `YOUCAM_API_KEY`
- `SKIN_PROVIDER=ailabtools` with `AILABTOOLS_API_KEY` (and optionally `AILAB_TIER`)
- `SKIN_PROVIDER=mock` (no key)

`/health` reports which provider is active. Its `configured` field is true only when the active
provider's key is set. Without the key, `/v1/analyze` returns 503 `not_configured`.

## Endpoints

`GET /health` returns
`200 {"ok":true,"provider":"youcam","configured":true,"concerns":["acne",...]}`

`POST /v1/analyze` accepts the photos in either of two forms:

- **Raw body:** the image bytes, with `Content-Type: image/jpeg` or `image/png`.
- **`multipart/form-data`:**
  - `image` (required): the front photo.
  - `left` and `right` (optional): photos with the face turned to each side.

  Each file must be a JPEG or PNG (checked from its bytes) of at most `MAX_IMAGE_BYTES`. Any other
  field is rejected with 400 `bad_image`.

A success returns:

```json
{
  "provider": "youcam",
  "concerns": [
    { "id": "acne", "score": 72, "severity": 28, "level": "mild", "maskUrl": "https://...", "regions": [{ "name": "forehead", "score": 80 }] }
  ],
  "skinAge": 27,
  "usedSides": false
}
```

- `score` is from 1 to 100, and higher means healthier skin.
- `severity` is `100 - score`.
- `level` comes from severity: below 20 is `none`, below 45 is `mild`, below 70 is `moderate`, and anything higher is `high`.
- `regions` is `[]` when the provider gives none.
- `maskUrl` is an `https://` URL (YouCam), a `data:image/...;base64,` URL (AILabTools), or `null`.
- `skinAge` can be `null`.
- `usedSides` is true only if the provider actually analyzed the side photos.
- If the provider returns nothing for a requested concern, that concern is left out.

Errors use the shape `{"error": code, "message": text}`:

| Status | `error`                                                                 |
| ------ | ----------------------------------------------------------------------- |
| 400    | `bad_image`: wrong Content-Type, empty body, a file that is not a JPEG/PNG, an unexpected form field, or a PNG sent to AILabTools (it accepts JPEG only) |
| 403    | `origin_not_allowed`: a browser POST from an origin not in `ALLOWED_ORIGINS` |
| 413    | `too_large`                                                             |
| 422    | `no_face`, `face_too_small`, `too_dark`, `pose`, `image_too_small`      |
| 429    | `rate_limited`: our limiter (sends `Retry-After`) or the provider's     |
| 502    | `provider_error`: rejected API key, out of credits, a blurry or covered face (AILabTools), or anything else unexpected |
| 503    | `not_configured`                                                        |
| 504    | `timeout`: the provider call is capped at 45 s in total                 |

CORS works as follows:

- An allowed origin gets its own origin echoed back in `Access-Control-Allow-Origin`, plus `Access-Control-Allow-Methods: POST, GET, OPTIONS`, `Access-Control-Allow-Headers: Content-Type` and `Access-Control-Max-Age: 600`.
- A request with no `Origin` header (curl, server-to-server) is allowed.

## Logs

Every request to `/v1/analyze` writes one JSON line:

| Event              | When                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `analyze_ok`       | The analysis succeeded. Includes provider, bytes, `usedSides` and `ms`.                  |
| `provider_failed`  | The provider call failed (level `warn`). Includes `provider`, our `code`, `step` (e.g. `file`, `upload`, `task`, `poll`, `analyze`), `providerStatus`, `providerCode` and `providerMessage`. |
| `request_rejected` | The request was refused before reaching the provider (bad input, origin, rate limit, not configured). |

API keys and image bytes are never logged.

## Deploy (Railway)

The service's settings live in `.railway/railway.ts` (Railway Infrastructure as Code): build
command, start command (`node dist/index.js`) and health check (`/health`). Railway does not
read that file during a deploy. Push changes to it with `railway config plan`, then
`railway config apply`, run in PowerShell from this folder. In Git Bash the `railway` package's
version check misreads the CLI version and refuses to run.

Every variable the service has must be listed under `env` in that file, or `apply` deletes it.
They are listed as `preserve()`, which keeps the value set in Railway, so the API keys never go
in the repo. Set or change values in the Railway dashboard; add the name to the file too.

Deploy the code from this folder:

```bash
railway up --project 7b44c9ca-fe47-49d4-ab9d-eb3ee36972e1 --environment 757d20fc-b130-4a23-81cb-cca0c2a2fadb --service skin-api --detach
```

## Adding a provider

1. Create `src/providers/<name>.ts` that exports a factory returning a `SkinProvider`
   (`src/types.ts`).
   - Convert the provider's numbers to our health scale (1..100, higher is healthier) and build
     each concern with `makeConcern()`. That function derives `severity` and `level`.
   - Throw `ApiError` (`src/errors.ts`) for failures the client should see. Pass a
     `FailureDetail` (step, provider status and code) so the `provider_failed` log line says
     what went wrong.
   - Take `fetch` as an injectable dependency so it can be tested without the network.
   - Set `usedSides` in the result.
2. Add the name to `PROVIDER_NAMES` in `src/types.ts`, and add one entry to `factories` in
   `src/providers/index.ts`. Add any new env vars to `src/config.ts`.
3. Add tests with a fake `fetch`, like `test/youcam.test.ts`, then set `SKIN_PROVIDER=<name>`.

## YouCam notes

- The flow is: upload slot, then PUT to the presigned URL, then create the task, then poll every 1.5 s.
- Only SD actions are requested. The concern-to-action mapping is `YOUCAM_ACTIONS` in
  `src/providers/youcam.ts`.
- Side photos are ignored, because each extra image would cost a full analysis. `usedSides` is
  always `false`.
- **ASSUMPTION:** `ui_score` is treated as a health score (higher means healthier). If real
  responses show the opposite, flip it in `youcamHealthScore()` in that same file. Nothing else
  needs to change.

## AILabTools notes

- **Call:** one synchronous `POST {AILAB_BASE_URL}/api/portrait/analysis/skin-analysis-pro` (or
  `-advanced`) with header `ailabapi-api-key`, sent as `multipart/form-data`. The front photo is
  the `image` field.
- **Photo limits:** JPG/JPEG only, between 200×200 and 4096×4096 px. The file can be up to
  8 MB (Pro) or 5 MB (Advanced). The face box should be wider than 400 px.
- **Pro (default) scores:**
  - Scores come from `result.score_info`. The provider's Degree & Score bands are none
    [90, 100], mild [70, 89], moderate [50, 69] and severe [30, 49]. Higher is healthier, so the
    scores are used as they are.
  - Supported concerns: acne, wrinkles, pores, texture, spots, redness, oiliness, darkCircles,
    eyeBags and moisture. `radiance` and `firmness` are not measured.
  - Regions come from pores, dark circles and wrinkles. Wrinkle regions use the per-region
    `wrinkle_severity_level`.
- **Pro masks:** masks come from `return_maps`. Only the requested concerns' maps are asked for.
  Each map is base64 and is returned as a data URL. A mask larger than about 600 KB is dropped,
  but its concern is kept.
- **Side photos:** with Pro, side photos are sent as `left_side_image` / `right_side_image` (JPEG
  only; PNG sides are skipped). Their `left_acne_info.score` / `right_acne_info.score` become acne
  regions `leftSide` / `rightSide`. If AILabTools rejects a request that had side photos because
  of the photos (HTTP 400/413/415/422, for example `ERROR_FACE_UNRECOGNIZABLE`), the call is
  retried once with the front photo alone. Failed calls are not billed. The `analyze_ok` log
  line then has `sidesRejected` with the provider's code, and `provider_failed` lines have
  `sidesSent`.
- **Advanced:** has no numeric scores, so yes/no answers and severity levels are mapped onto
  the Pro bands. This mapping is an ASSUMPTION; see `DEGREE` in `src/providers/ailabtools.ts`.
  Advanced does not measure texture.
- **Coordinates not used yet:** Pro also returns rectangles and polygons, for example
  `result.acne.polygon`, `brown_spot` and `dark_circle_mark`. They are not used yet.
