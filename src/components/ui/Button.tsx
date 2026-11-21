import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "quiet";

const base =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold " +
  "transition-[transform,background-color,color,box-shadow] duration-150 ease-[cubic-bezier(0.2,0,0,1)] " +
  "active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100";

const variants: Record<Variant, string> = {
  primary:
    "h-14 px-7 text-[17px] bg-cap text-cap-ink shadow-[0_6px_18px_-8px_rgb(14_77_72/0.55)] hover:bg-cap-deep",
  secondary: "h-12 px-6 text-[16px] bg-strip-raised text-ink ring-1 ring-inset ring-rule hover:ring-ink-soft",
  quiet: "h-11 px-3 text-[15px] text-cap underline decoration-1 underline-offset-4 hover:text-cap-deep",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button type="button" className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "secondary",
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </a>
  );
}
