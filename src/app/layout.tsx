import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { BRAND } from "@/config/brand";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: `Skin check | ${BRAND.name}`,
  description: "Scan your face on your phone and get a skin reading and a simple routine. Your photo never leaves your phone.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0e4d48",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} h-full antialiased`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
