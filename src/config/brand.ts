// Every brand value in one place. PLACEHOLDERS until the brand sends real ones.
export const BRAND = {
  name: "Your Brand",
  /** Shown in the top band. Replace with an SVG logo path when there is one. */
  logo: null as string | null,
  currency: { code: "USD", symbol: "$", position: "before" as "before" | "after" },
  contact: {
    label: "Message us",
    /** Instagram, Messenger or WhatsApp link. */
    url: "https://instagram.com/",
    phone: "+1 000 000 0000",
  },
  thankYou: "We'll call you soon to confirm your order and delivery.",
  privacyContact: "Send us a message and we'll delete your order details.",
} as const;

const groups = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const cents = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Thousands grouped, cents only when there are cents: $18, $1,249.50. */
export function formatPrice(amount: number): string {
  const value = Number.isInteger(amount) ? groups.format(amount) : cents.format(amount);
  return BRAND.currency.position === "before"
    ? `${BRAND.currency.symbol}${value}`
    : `${value} ${BRAND.currency.symbol}`;
}
