import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = { title: `Privacy | ${BRAND.name}` };

// TEMPLATE: the brand completes this with its legal details before launch.
export default function Privacy() {
  return (
    <main className="mx-auto max-w-[560px] px-5 pt-10 pb-16">
      <Link href="/" className="text-[15px] text-cap underline">
        Back to the skin check
      </Link>
      <h1 className="type-display mt-6 text-[32px]">How we handle your data</h1>
      <div className="mt-6 space-y-5 text-[16px] leading-[1.6] text-ink-soft [&_h2]:mt-8 [&_h2]:text-[18px] [&_h2]:font-semibold [&_h2]:text-ink">
        <h2>Your photo</h2>
        <p>
          The scan runs on your phone. Your face photo is never uploaded, stored or shared. When you leave the page, it is gone.
        </p>
        <h2>Anonymous scan numbers</h2>
        <p>
          After each scan we save a few numbers (the readings shown on your report, photo quality and your phone type). They carry no
          name, photo or contact details. We use them to make the scan more accurate and to count how many scans lead to an order.
        </p>
        <h2>When you order</h2>
        <p>
          If you send an order, we save your name, phone number, any address or note you add, the products you chose, and your skin
          readings and quiz answers, so we can confirm the order and advise you. We never save your answer about pregnancy.
        </p>
        <h2>How long we keep it</h2>
        <p>{BRAND.name} keeps order details only as long as needed to deliver and support your order.</p>
        <h2>Deleting your details</h2>
        <p>
          {BRAND.privacyContact} You can reach us at{" "}
          <a href={BRAND.contact.url} className="text-cap underline">
            {BRAND.contact.label.toLowerCase()}
          </a>{" "}
          or {BRAND.contact.phone}.
        </p>
      </div>
    </main>
  );
}
