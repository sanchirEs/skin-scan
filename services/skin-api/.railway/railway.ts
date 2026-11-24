import { defineRailway, preserve, project, service } from "railway/iac";

// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "skin-api";

export default defineRailway(() => {
  const skin_api = service("skin-api", {
    build: "npm run build",
    start: "node dist/index.js",
    healthcheck: "/health",
    healthcheckTimeout: 60,
    // Every variable must be listed: one left out is deleted on apply. preserve() keeps the value
    // already set in Railway, so no key is written here. Change values in the Railway dashboard.
    env: {
      SKIN_PROVIDER: preserve(),
      SKIN_CONCERNS: preserve(),
      ALLOWED_ORIGINS: preserve(),
      RATE_LIMIT_PER_MIN: preserve(),
      YOUCAM_API_KEY: preserve(),
      AILABTOOLS_API_KEY: preserve(),
    },
  });
  return project("skin-scan", {
    resources: [skin_api],
  });
});
