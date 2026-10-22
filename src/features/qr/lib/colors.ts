import type { QrStyle } from "@/lib/db";

const HEX_PATTERN = /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Returns a lowercase #rrggbb colour, or null if the value is not a 3/6-digit hex colour. */
export function normalizeHex(value: string): string | null {
  const trimmed = value.trim();
  if (!HEX_PATTERN.test(trimmed)) return null;
  let hex = trimmed.replace("#", "").toLowerCase();
  if (hex.length === 3) hex = [...hex].map((char) => char + char).join("");
  return `#${hex}`;
}

export function isValidHex(value: string): boolean {
  return normalizeHex(value) !== null;
}

/** WCAG 2.x relative luminance of a hex colour. */
export function relativeLuminance(hex: string): number {
  const normalized = normalizeHex(hex) ?? "#000000";
  const channels = [1, 3, 5].map((start) => parseInt(normalized.slice(start, start + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

export interface ColorPreset {
  name: string;
  foreground: string;
  background: string;
}

export const colorPresets: readonly ColorPreset[] = [
  { name: "Classic", foreground: "#000000", background: "#ffffff" },
  { name: "Navy", foreground: "#1b1f3b", background: "#ffffff" },
  { name: "Indigo", foreground: "#3730a3", background: "#eef0ff" },
  { name: "Forest", foreground: "#14532d", background: "#f0fdf4" },
  { name: "Plum", foreground: "#581c87", background: "#faf5ff" },
  { name: "Espresso", foreground: "#3b2a20", background: "#fdf6ec" },
  { name: "Crimson", foreground: "#881337", background: "#fff1f2" },
  { name: "Teal", foreground: "#134e4a", background: "#f0fdfa" },
];

export interface StyleWarning {
  tone: "warning" | "info";
  message: string;
}

/**
 * Readability warnings for a style. These never change the user's colours —
 * they only explain the scanning risk.
 */
export function getStyleWarnings(style: Pick<QrStyle, "foregroundColor" | "backgroundColor" | "transparentBackground" | "margin">): StyleWarning[] {
  const warnings: StyleWarning[] = [];
  const fg = normalizeHex(style.foregroundColor);
  const bg = normalizeHex(style.backgroundColor);
  if (!fg || (!bg && !style.transparentBackground)) return warnings;

  if (style.transparentBackground) {
    warnings.push({
      tone: "info",
      message:
        "Transparent background: the code will only scan if the surface you place it on contrasts strongly with the foreground colour.",
    });
    if (relativeLuminance(fg) > 0.4) {
      warnings.push({
        tone: "warning",
        message: "The foreground is light. On a transparent background it will need a dark surface behind it to scan.",
      });
    }
  } else if (bg) {
    const ratio = contrastRatio(fg, bg);
    if (ratio < 2.5) {
      warnings.push({
        tone: "warning",
        message: `Very low contrast (${ratio.toFixed(1)}:1). Most scanners will fail to read this code. Aim for at least 4:1.`,
      });
    } else if (ratio < 4) {
      warnings.push({
        tone: "warning",
        message: `Low contrast (${ratio.toFixed(1)}:1). Some scanners may struggle, especially in poor light. Aim for at least 4:1.`,
      });
    }
    if (relativeLuminance(fg) > relativeLuminance(bg)) {
      warnings.push({
        tone: "warning",
        message: "The foreground is lighter than the background. Inverted codes are not supported by many scanner apps.",
      });
    }
  }

  if (style.margin < 2) {
    warnings.push({
      tone: "info",
      message: "A quiet zone under 2 modules can make the code hard to detect next to other content. 4 is the standard.",
    });
  }
  return warnings;
}
