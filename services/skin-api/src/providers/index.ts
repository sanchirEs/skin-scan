import type { Config } from "../config.js";
import type { ProviderName, SkinProvider } from "../types.js";
import { createAilabProvider } from "./ailabtools.js";
import { createMockProvider } from "./mock.js";
import { createYouCamProvider } from "./youcam.js";

/** Runtime dependencies a provider may use; tests inject fakes. */
export interface ProviderDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** SKIN_PROVIDER value -> factory. To add a provider: add its name to PROVIDER_NAMES and an entry here. */
const factories: Record<ProviderName, (config: Config, deps: ProviderDeps) => SkinProvider> = {
  youcam: (config, deps) => createYouCamProvider({ ...config.youcam, ...deps }),
  ailabtools: (config, deps) => createAilabProvider({ ...config.ailabtools, fetch: deps.fetch }),
  mock: () => createMockProvider(),
};

export function createProvider(config: Config, deps: ProviderDeps = {}): SkinProvider {
  return factories[config.provider](config, deps);
}
