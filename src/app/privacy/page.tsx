import { ArrowLeft, Camera, ChartBar, ClockCounterClockwise, Package, Sparkle, Trash } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = { title: `Privacy | ${BRAND.name}` };

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] bg-strip-raised p-5 lift">
      <h2 className="flex items-center gap-3 text-[18px] font-semibold">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cap-tint text-cap">{icon}</span>
        {title}
      </h2>
      <p className="mt-3 text-[15.5px] leading-[1.6] text-ink-soft">{children}</p>
    </section>
  );
}

// TEMPLATE: the brand completes this with its legal details before launch.
export default function Privacy() {
  const icon = { size: 21, weight: "duotone" as const, "aria-hidden": true };
  return (
    <main className="mx-auto max-w-[560px] px-5 pt-6 pb-16">
      <Link href="/" className="-ml-1 inline-flex h-11 items-center gap-2 text-[15px] font-semibold text-cap">
        <ArrowLeft size={18} weight="bold" aria-hidden />
        Back to the skin check
      </Link>
      <h1 className="type-display mt-4 text-[38px]">How we handle your data</h1>
      <p className="mt-3 max-w-[38ch] text-[16px] leading-[1.55] text-ink-soft">
        In short: your photos are never stored, and we only keep your details if you send an order.
      </p>

      <div className="mt-8 grid gap-3">
        <Section icon={<Camera {...icon} />} title="Your photos">
          The scan takes a photo of your face from the front, then one turned to each side, which you can skip. With &ldquo;Scan on
          this phone only&rdquo;, the scan runs entirely on your phone and the photos never leave it. When you leave the page, they
          are gone.
        </Section>
        <Section icon={<Sparkle {...icon} />} title="The AI check">
          If you choose &ldquo;Scan with AI check&rdquo;, cropped photos of your face, from the front and from each side, are sent
          securely to our server and on to our AI partner, Perfect Corp (YouCam), to find acne, wrinkles and pores. We do not store
          the photos. Perfect Corp keeps the analysis results for up to 30 days under its own privacy policy. We keep only the
          resulting numbers. Without the AI check, the side photos are only used on your phone.
        </Section>
        <Section icon={<ChartBar {...icon} />} title="Anonymous scan numbers">
          After each scan we save a few numbers (the readings shown on your report, photo quality and your phone type). They carry no
          name, photo or contact details. We use them to make the scan more accurate and to count how many scans lead to an order.
        </Section>
        <Section icon={<Package {...icon} />} title="When you order">
          If you send an order, we save your name, phone number, any address or note you add, the products you chose, and your skin
          readings and quiz answers, so we can confirm the order and advise you. We never save your answer about pregnancy.
        </Section>
        <Section icon={<ClockCounterClockwise {...icon} />} title="How long we keep it">
          {BRAND.name} keeps order details only as long as needed to deliver and support your order.
        </Section>
        <Section icon={<Trash {...icon} />} title="Deleting your details">
          {BRAND.privacyContact} You can reach us at{" "}
          <a href={BRAND.contact.url} className="font-semibold text-cap underline">
            {BRAND.contact.label.toLowerCase()}
          </a>{" "}
          or {BRAND.contact.phone}.
        </Section>
      </div>
    </main>
  );
}
