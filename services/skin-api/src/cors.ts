const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Build a matcher for ALLOWED_ORIGINS entries. An entry is an exact origin
 * ("http://localhost:3000") or a pattern where "*" stands for one or more
 * of [A-Za-z0-9-], so it never spans a dot ("https://*-team.vercel.app").
 */
export function originMatcher(patterns: readonly string[]): (origin: string) => boolean {
  const regexes = patterns.map((p) => {
    const body = p.replace(/\/+$/, "").split("*").map(escapeRegex).join("[A-Za-z0-9-]+");
    return new RegExp(`^${body}$`, "i");
  });
  return (origin) => regexes.some((r) => r.test(origin));
}
