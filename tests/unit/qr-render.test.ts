import { describe, expect, it } from "vitest";
import { qrLimits } from "@/config/limits";
import { contrastRatio, getStyleWarnings, normalizeHex } from "@/features/qr/lib/colors";
import { LruCache, getMatrix, pngDimensions, renderSvg, type QrRenderConfig } from "@/features/qr/lib/render";
import { defaultStyle, parseBatch, validateContent, validateStyle } from "@/features/qr/lib/validation";

const config = (overrides: Partial<QrRenderConfig> = {}): QrRenderConfig => ({
  content: "https://example.com",
  ...defaultStyle,
  ...overrides,
});

describe("QR rendering", () => {
  it("creates a QR matrix and an SVG using the chosen colours", () => {
    const svg = renderSvg(config({ foregroundColor: "#AA0033", backgroundColor: "#FFEECC" }));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('fill="#aa0033"');
    expect(svg).toContain('<rect width="');
    expect(svg).toContain('fill="#ffeecc"');
    const matrix = getMatrix("https://example.com", "M");
    expect(matrix.size).toBeGreaterThanOrEqual(21);
    expect(matrix.dark.some(Boolean)).toBe(true);
  });

  it("omits the background entirely when transparent, so exports keep real alpha", () => {
    const svg = renderSvg(config({ transparentBackground: true, backgroundColor: "#ffffff" }));
    expect(svg).not.toContain("<rect");
    expect(svg).not.toContain("#ffffff");
  });

  it("never embeds the encoded text in SVG markup", () => {
    const svg = renderSvg(config({ content: '<script>alert("x")</script>' }));
    expect(svg).not.toContain("script");
  });

  it("applies the margin to the viewBox", () => {
    const size = getMatrix("hello", "L").size;
    expect(renderSvg(config({ content: "hello", errorCorrectionLevel: "L", margin: 0 }))).toContain(`viewBox="0 0 ${size} ${size}"`);
    expect(renderSvg(config({ content: "hello", errorCorrectionLevel: "L", margin: 4 }))).toContain(
      `viewBox="0 0 ${size + 8} ${size + 8}"`,
    );
  });

  it("computes integer-scaled PNG dimensions within limits", () => {
    const dims = pngDimensions(config(), 1024);
    expect(dims.pixels % dims.total).toBe(0);
    expect(Math.abs(dims.pixels - 1024)).toBeLessThan(dims.total);
    expect(pngDimensions(config(), 999_999).pixels).toBeLessThanOrEqual(qrLimits.maxExportSize + dims.total);
  });

  it("bounds the preview cache", () => {
    const cache = new LruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.size).toBe(2);
  });
});

describe("QR validation", () => {
  it("rejects blank content", () => {
    expect(validateContent("   ", "text", "M")).toMatch(/enter some text/i);
    expect(validateContent("", "url", "M")).toMatch(/enter a url/i);
  });

  it("validates URLs and suggests a protocol", () => {
    expect(validateContent("https://example.com/a?b=1", "url", "M")).toBeNull();
    expect(validateContent("example.com", "url", "M")).toMatch(/https:\/\/example\.com/);
    expect(validateContent("javascript:alert(1)", "url", "M")).toMatch(/https:\/\//);
  });

  it("rejects oversized payloads and level-specific capacity overflow", () => {
    expect(validateContent("x".repeat(qrLimits.maxContentBytes + 1), "text", "L")).toMatch(/maximum is/);
    const longText = "x".repeat(2000);
    expect(validateContent(longText, "text", "L")).toBeNull();
    expect(validateContent(longText, "text", "H")).toMatch(/error correction level H/);
  });

  it("validates HEX colours", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("12ab34")).toBe("#12ab34");
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("red")).toBeNull();
    expect(validateStyle({ ...defaultStyle, foregroundColor: "#zzz" }).foregroundColor).toBeDefined();
    expect(validateStyle({ ...defaultStyle, backgroundColor: "nope", transparentBackground: true })).toEqual({});
    expect(validateStyle({ ...defaultStyle, margin: 99 }).margin).toBeDefined();
  });

  it("warns about low contrast and inverted colours without changing them", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    const style = { ...defaultStyle, foregroundColor: "#dddddd", backgroundColor: "#ffffff" };
    const warnings = getStyleWarnings(style);
    expect(warnings.some((w) => /very low contrast/i.test(w.message))).toBe(true);
    expect(warnings.some((w) => /lighter than the background/i.test(w.message))).toBe(false);
    expect(style.foregroundColor).toBe("#dddddd");
    const inverted = getStyleWarnings({ ...defaultStyle, foregroundColor: "#ffffff", backgroundColor: "#111111" });
    expect(inverted.some((w) => /lighter than the background/i.test(w.message))).toBe(true);
    expect(getStyleWarnings({ ...defaultStyle, transparentBackground: true }).some((w) => /transparent/i.test(w.message))).toBe(true);
  });

  it("parses batches with optional names and reports per-line errors", () => {
    const result = parseBatch("Menu | https://example.com/menu\n\nplain text\n | ", "M");
    expect(result.error).toBeNull();
    expect(result.items).toEqual([
      { line: 1, name: "Menu", content: "https://example.com/menu" },
      { line: 3, name: "plain text", content: "plain text" },
    ]);
    expect(result.errors).toEqual([{ line: 4, message: expect.stringMatching(/enter some text/i) }]);
    expect(parseBatch(Array.from({ length: qrLimits.maxBatchItems + 1 }, (_, i) => `item ${i}`).join("\n"), "M").error).toMatch(
      /up to/,
    );
  });
});
