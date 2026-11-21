# skin-api

A small HTTP service that the phone app sends face photos to. It forwards each photo to a paid
skin-analysis provider (Perfect Corp YouCam by default), using an API key that stays on the
server. It then returns a normalized result. Photos are held in memory only: they are never
stored and never logged.

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
| `SKIN_PROVIDER`      | `youcam`                          | `youcam` or `mock`.                                                                                     |
| `YOUCAM_API_KEY`     | none                              | Secret. Without it, `/health` says `configured: false` and `/v1/analyze` returns 503. Never logged.     |
| `YOUCAM_BASE_URL`    | `https://yce-api-01.makeupar.com` |                                                                                                         |
| `SKIN_CONCERNS`      | `acne,wrinkles,pores,texture`     | Any of `acne, wrinkles, pores, texture, spots, redness, oiliness, darkCircles, eyeBags, moisture, radiance, firmness`. Results come back in this order. |
| `ALLOWED_ORIGINS`    | none (no browser origins)         | Comma list of exact origins or patterns with `*`, e.g. `http://localhost:3000,https://*-sanchires-projects.vercel.app`. `*` matches letters, digits and `-` only, so it never crosses a dot. |
| `RATE_LIMIT_PER_MIN` | `6`                               | Limit on `POST /v1/analyze` per client IP (first `x-forwarded-for` entry). In memory, per instance.     |
| `MAX_IMAGE_BYTES`    | `5000000`                         | `5_000_000` also works.                                                                                 |

Empty values count as unset. An invalid value stops the service at startup with a clear error.

## Endpoints

`GET /health` returns
`200 {"ok":true,"provider":"youcam","configured":true,"concerns":["acne",...]}`

`POST /v1/analyze` takes the raw image bytes as the body, with `Content-Type: image/jpeg` or
`image/png`. A success returns:

```json
{
  "provider": "youcam",
  "concerns": [
    { "id": "acne", "score": 72, "severity": 28, "level": "mild", "maskUrl": "https://...", "regions": [{ "name": "forehead", "score": 80 }] }
  ],
  "skinAge": 27
}
```

- `score` is from 1 to 100, and higher means healthier skin.
- `severity` is `100 - score`.
- `level` comes from severity: below 20 is `none`, below 45 is `mild`, below 70 is `moderate`, and anything higher is `high`.
- `regions` is `[]` when the provider gives none.
- `maskUrl` and `skinAge` can be `null`.
- If the provider returns nothing for a requested concern, that concern is left out.

Errors use the shape `{"error": code, "message": text}`:

| Status | `error`                                                                 |
| ------ | ----------------------------------------------------------------------- |
| 400    | `bad_image`: wrong Content-Type, empty body, or bytes that are not a JPEG/PNG |
| 403    | `origin_not_allowed`: a browser POST from an origin not in `ALLOWED_ORIGINS` |
| 413    | `too_large`                                                             |
| 422    | `no_face`, `face_too_small`, `too_dark`, `pose`, `image_too_small`      |
| 429    | `rate_limited`: our limiter (sends `Retry-After`) or the provider's     |
| 502    | `provider_error`: rejected API key, out of credits, or anything else unexpected |
| 503    | `not_configured`                                                        |
| 504    | `timeout`: the provider call is capped at 45 s in total                 |

CORS works as follows:

- An allowed origin gets its own origin echoed back in `Access-Control-Allow-Origin`, plus `Access-Control-Allow-Methods: POST, GET, OPTIONS`, `Access-Control-Allow-Headers: Content-Type` and `Access-Control-Max-Age: 600`.
- A request with no `Origin` header (curl, server-to-server) is allowed.

## Deploy (Railway)

Point a Railway service at this repo and set its **Root Directory** to `services/skin-api`.
Railway does not look for the config file relative to the Root Directory, so set the config
file path to `/services/skin-api/railway.json`. That file sets the build command, start command
(`node dist/index.js`), health check (`/health`) and watch paths. Set `YOUCAM_API_KEY` as a
Railway variable. Never put it in the repo.

## Adding a provider

1. Create `src/providers/<name>.ts` that exports a factory returning a `SkinProvider`
   (`src/types.ts`).
   - Convert the provider's numbers to our health scale (1..100, higher is healthier) and build
     each concern with `makeConcern()`. That function derives `severity` and `level`.
   - Throw `ApiError` (`src/errors.ts`) for failures the client should see.
   - Take `fetch` as an injectable dependency so it can be tested without the network.
2. Add the name to `PROVIDER_NAMES` in `src/types.ts`, and add one entry to `factories` in
   `src/providers/index.ts`. Add any new env vars to `src/config.ts`.
3. Add tests with a fake `fetch`, like `test/youcam.test.ts`, then set `SKIN_PROVIDER=<name>`.

## YouCam notes

- The flow is: upload slot, then PUT to the presigned URL, then create the task, then poll every 1.5 s.
- Only SD actions are requested. The concern-to-action mapping is `YOUCAM_ACTIONS` in
  `src/providers/youcam.ts`.
- **ASSUMPTION:** `ui_score` is treated as a health score (higher means healthier). This has
  not been checked against a real response yet. If the first real call shows the opposite,
  flip it in `youcamHealthScore()` in that same file. Nothing else needs to change.
