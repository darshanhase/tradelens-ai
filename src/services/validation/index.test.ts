import { describe, expect, it } from "vitest";
import { parseDecimal, parseIsoDate, validateInstrument, validateSettings, normalizePsychology } from ".";
import type { Settings } from "@/types/settings";
import { defaultSettings } from "@/types/settings";
import { generateInsights } from "@/services/analytics/insights";
import type { Trade } from "@/types/trade";

describe("parseDecimal", () => {
  it("handles US and European formatting and currency marks", () => {
    expect(parseDecimal("1,234.56")).toBe(1234.56);
    expect(parseDecimal("1.234,56")).toBe(1234.56);
    expect(parseDecimal("$2,500")).toBe(2500);
    expect(parseDecimal("-75.25")).toBe(-75.25);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
  });
});

describe("parseIsoDate", () => {
  it("validates real calendar dates only", () => {
    expect(parseIsoDate("2026-02-28")).toBe("2026-02-28");
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("2026-13-01")).toBeNull();
    expect(parseIsoDate("xxxx")).toBeNull();
  });
});

describe("instrument validation", () => {
  it("requires positive contract size and unique symbols", () => {
    const errors = validateSettings({
      ...defaultSettings(),
      instruments: [
        { id: "a", symbol: "EURUSD", contractSize: 100000, quoteCurrency: "USD", precision: 5 },
        { id: "b", symbol: "eurusd", contractSize: 0, quoteCurrency: "USD", precision: 5 },
      ],
    });
    expect(errors.join(" ")).toContain("unique");
    expect(errors.join(" ")).toContain("contract size");
  });

  it("requires a 3-letter account currency", () => {
    const errors = validateSettings({ ...defaultSettings(), accountCurrency: "USDX" } as Settings);
    expect(errors.join(" ")).toContain("3-letter");
    expect(validateSettings(defaultSettings())).toEqual([]);
  });

  it("validateInstrument flags missing quote currency", () => {
    expect(validateInstrument({ id: "1", symbol: "XAU", contractSize: 100, quoteCurrency: "", precision: 2 })).toHaveLength(1);
  });
});

describe("normalizePsychology", () => {
  it("matches known tags case-insensitively and drops empties", () => {
    expect(normalizePsychology(["fomo", "  Disciplined ", "", 42, "Custom Tag"])).toEqual(["FOMO", "Disciplined", "Custom Tag"]);
    expect(normalizePsychology("oops" as unknown as string[])).toEqual([]);
  });
});

describe("insight rules", () => {
  function t(id: string, date: string, pnl: number | null, psychology: string[]): Trade {
    return {
      id, date, instrument: "EURUSD", direction: "BUY", entryPrice: 1, exitPrice: 2, lotSize: 1,
      realizedPnl: pnl, pnlCurrency: "USD", resultSource: "manual", psychology, notes: "",
      createdAt: new Date(2026, 0, 1, 0, 0, 0, Date.now() % 1000).toISOString(), updatedAt: "", schemaVersion: 1,
    };
  }

  it("flags tiny samples instead of hiding the conclusion (prompt §8 rule)", () => {
    const insights = generateInsights([t("1", "2026-01-01", -10, ["FOMO"])], "USD");
    const aboutFomo = insights.filter((i) => i.message.includes("FOMO"));
    expect(aboutFomo).toHaveLength(1);
    expect(aboutFomo[0].message).toContain("small sample");
    expect(insights.length).toBeGreaterThan(0);
  });

  it("reports negative-average tags with the sample size", () => {
    const trades = Array.from({ length: 12 }, (_, i) => t(String(i), `2026-01-${String(i + 1).padStart(2, "0")}`, -20, ["FOMO"]));
    const insights = generateInsights(trades, "USD");
    const fomo = insights.find((i) => i.message.includes("FOMO") && i.message.includes("average"));
    expect(fomo).toBeDefined();
    expect(fomo?.message).toContain("12");
    expect(fomo?.message).toContain("-20.00");
  });

  it("never claims causation in cross-tag comparisons", () => {
    const fomo = Array.from({ length: 10 }, (_, i) => t(`f${i}`, `2026-01-${String(i + 1).padStart(2, "0")}`, -10, ["FOMO"]));
    const disc = Array.from({ length: 10 }, (_, i) => t(`d${i}`, `2026-02-${String(i + 1).padStart(2, "0")}`, 15, ["Disciplined"]));
    const insights = generateInsights([...fomo, ...disc], "USD");
    const comparisons = insights.filter((i) => i.message.includes("more often"));
    expect(comparisons.length).toBeGreaterThan(0);
    for (const c of comparisons) expect(c.message).toContain("not proof of cause");
  });

  it("reports consecutive losing streaks in period", () => {
    const trades = Array.from({ length: 5 }, (_, i) => t(String(i), `2026-01-${String(i + 1).padStart(2, "0")}`, -7, []));
    const insights = generateInsights(trades, "USD");
    expect(insights.some((i) => i.message.includes("consecutive") && i.message.includes("losing"))).toBe(true);
  });

  it("empty data → helpful guidance, no fabricated claims", () => {
    const insights = generateInsights([], "USD");
    expect(insights).toHaveLength(1);
    expect(insights[0].message).toMatch(/Tag your next|No psychology-tagged/);
  });
});
