import { AlertTriangle, Info } from "lucide-react";

export function MixedCurrencyBanner({
  excludedCount,
  currencies,
  accountCurrency,
  onSwitch,
}: {
  excludedCount: number;
  currencies: string[];
  accountCurrency: string;
  onSwitch?: (currency: string) => void;
}) {
  if (excludedCount === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
      <AlertTriangle size={14} className="shrink-0" />
      <span>
        {excludedCount} trade{excludedCount === 1 ? "" : "s"} in {currencies.join(", ")} excluded from {accountCurrency} totals — monetary metrics would be meaningless if mixed currencies were summed.
      </span>
      {onSwitch &&
        currencies.map((c) => (
          <button key={c} className="btn-ghost !py-0.5 !px-2 !text-[11px]" onClick={() => onSwitch(c)}>
            Show {c} instead
          </button>
        ))}
    </div>
  );
}

export function EmptyState({ title, hint, children }: { title: string; hint: string; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 p-10 text-center">
      <Info size={20} className="text-muted mt-1" />
      <div className="font-medium text-slate-200">{title}</div>
      <p className="max-w-sm text-xs text-muted leading-relaxed">{hint}</p>
      {children}
    </div>
  );
}
