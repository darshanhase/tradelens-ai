import type { ResultSource } from "./trade";

/**
 * User-defined instrument specification. Contract size and the calculation
 * rule are per-instrument; a universal lot multiplier is deliberately NOT
 * hardcoded (prompt §5).
 */
export interface Instrument {
  id: string;
  /** Canonical symbol, e.g. "EURUSD", "XAUUSD", "NAS100". */
  symbol: string;
  /** Human-friendly alias shown in dropdown alongside the symbol. */
  label?: string;
  /**
   * Units of the quote currency per 1 price point per 1 lot — the contract
   * size (forex standard lot 100000, gold 100 oz, one futures contract, etc).
   */
  contractSize: number;
  /**
   * Currency the instrument is quoted in; used as the P&L currency for
   * calculated results.
   */
  quoteCurrency: string;
  /**
   * Optional smaller tick/pip size for display; not required for the P&L
   * formula which works directly on price points.
   */
  precision: number;
}

/**
 * How a manual spreadsheet column for monetary result maps: manual values win,
 * calculated values are computed from prices per the instrument spec
 * (prompt §5 "Result: auto-calculated or manual override").
 */
export type ResultPreference = ResultSource | "ask";

/** Application-level settings, persisted alongside trades (prompt §12). */
export interface Settings {
  schemaVersion: number;
  /** Account currency used to aggregate monetary metrics. */
  accountCurrency: string;
  /** Display date format: ISO or localized short. */
  dateFormat: "iso" | "dd/mm/yyyy" | "mm/dd/yyyy";
  theme: "dark" | "light";
  defaultInstrument: string | null;
  instruments: Instrument[];
  /** Preferred default result source applied to new spreadsheet rows. */
  defaultResultSource: ResultSource;
  /** ISO timestamp of the last JSON backup, or null; drives the backup reminder. */
  lastBackupAt: string | null;
}

export const DEFAULT_ACCOUNT_CURRENCY = "USD";

export function defaultInstruments(): Instrument[] {
  // Sensible starting specs the user can edit or delete in Settings.
  // These are common broker defaults, not universal truths.
  return [
    { id: "instr-eurusd", symbol: "EURUSD", contractSize: 100000, quoteCurrency: "USD", precision: 5 },
    { id: "instr-gbpusd", symbol: "GBPUSD", contractSize: 100000, quoteCurrency: "USD", precision: 5 },
    { id: "instr-usdjpy", symbol: "USDJPY", contractSize: 100000, quoteCurrency: "JPY", precision: 3 },
    { id: "instr-xauusd", symbol: "XAUUSD", label: "Gold", contractSize: 100, quoteCurrency: "USD", precision: 2 },
    { id: "instr-xagusd", symbol: "XAGUSD", label: "Silver", contractSize: 5000, quoteCurrency: "USD", precision: 3 },
    { id: "instr-us30", symbol: "US30", label: "Dow Jones", contractSize: 1, quoteCurrency: "USD", precision: 1 },
    { id: "instr-nas100", symbol: "NAS100", label: "Nasdaq 100", contractSize: 1, quoteCurrency: "USD", precision: 1 },
    { id: "instr-ukbrent", symbol: "UKOIL", label: "Brent Oil", contractSize: 1000, quoteCurrency: "USD", precision: 2 },
  ];
}

export function defaultSettings(): Settings {
  return {
    schemaVersion: 1,
    accountCurrency: DEFAULT_ACCOUNT_CURRENCY,
    dateFormat: "iso",
    theme: "dark",
    defaultInstrument: null,
    instruments: defaultInstruments(),
    defaultResultSource: "manual",
    lastBackupAt: null,
  };
}
