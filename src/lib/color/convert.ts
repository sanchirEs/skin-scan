// sRGB <-> CIELAB (D65) and the Individual Typology Angle used for skin tone.

export type ToneCategory = "very-light" | "light" | "intermediate" | "tan" | "brown" | "dark";

const WHITE = [95.047, 100, 108.883] as const;
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;

// 8-bit sRGB to linear light, precomputed once.
const LINEAR = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const f = (t: number) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
const fInv = (t: number) => (t * t * t > EPS ? t * t * t : (116 * t - 16) / KAPPA);

export function srgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = LINEAR[r | 0];
  const G = LINEAR[g | 0];
  const B = LINEAR[b | 0];
  const x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) * 100;
  const y = (R * 0.2126729 + G * 0.7151522 + B * 0.072175) * 100;
  const z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) * 100;
  const fx = f(x / WHITE[0]);
  const fy = f(y / WHITE[1]);
  const fz = f(z / WHITE[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToSrgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const x = (fInv(fx) * WHITE[0]) / 100;
  const y = (L > KAPPA * EPS ? fy * fy * fy : L / KAPPA) * (WHITE[1] / 100);
  const z = (fInv(fz) * WHITE[2]) / 100;
  const lin = [
    x * 3.2404542 + y * -1.5371385 + z * -0.4985314,
    x * -0.969266 + y * 1.8760108 + z * 0.041556,
    x * 0.0556434 + y * -0.2040259 + z * 1.0572252,
  ];
  return lin.map((c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  }) as [number, number, number];
}

/** Individual Typology Angle, in degrees. */
export function ita(L: number, b: number): number {
  return (Math.atan2(L - 50, b) * 180) / Math.PI;
}

export function itaCategory(deg: number): ToneCategory {
  if (deg > 55) return "very-light";
  if (deg > 41) return "light";
  if (deg > 28) return "intermediate";
  if (deg > 10) return "tan";
  if (deg > -30) return "brown";
  return "dark";
}

/** Bright, nearly colourless pixels: light reflecting off oil, not skin colour. */
export function isSpecular(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max / 255;
  const s = max === 0 ? 0 : (max - min) / max;
  return v > 0.92 && s < 0.18;
}
