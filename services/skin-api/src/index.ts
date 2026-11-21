import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig, type Config } from "./config.js";
import { consoleLogger as logger } from "./log.js";
import { createProvider } from "./providers/index.js";

let config: Config;
try {
  config = loadConfig();
} catch (err) {
  logger.error("bad_config", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
}

const provider = createProvider(config);
const app = createApp({ config, provider, logger });

const server = serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  logger.info("listening", { port, provider: provider.name, configured: provider.configured, concerns: config.concerns });
  if (!provider.configured) logger.warn("provider_not_configured", { provider: provider.name });
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
