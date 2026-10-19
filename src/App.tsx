import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, NotebookPen, BarChart, ArrowLeftRight, Settings2, X, Menu } from "lucide-react";
import { useState } from "react";
import { BackupReminder } from "@/components/common/BackupReminder";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/journal", label: "Trade Journal", icon: NotebookPen },
  { to: "/analytics", label: "Analytics", icon: BarChart },
  { to: "/import-export", label: "Import / Export", icon: ArrowLeftRight },
  { to: "/settings", label: "Settings", icon: Settings2 },
];

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  const nav = (
    <nav className="flex flex-col gap-0.5">
      {links.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) => `sidebar-link ${isActive ? "sidebar-link-active" : ""}`}
        >
          <Icon size={17} strokeWidth={1.8} />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="h-full flex">
      {/* Desktop sidebar (prompt §4: exactly the five required sections) */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-line-900 bg-surface-900 p-4 gap-6">
        <Brand />
        {nav}
        <div className="mt-auto">
          <BackupReminder />
        </div>
      </aside>

      {/* Mobile top bar + slide-down menu */}
      <div className="md:hidden fixed inset-x-0 top-0 z-30 border-b border-line-900 bg-surface-900">
        <div className="flex items-center justify-between p-3">
          <Brand />
          <button aria-label="Toggle menu" className="btn-ghost !p-2" onClick={() => setMenuOpen((v) => !v)}>
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
        {menuOpen && (
          <div className="border-t border-line-900 p-3">
            {nav}
            <div className="mt-3">
              <BackupReminder />
            </div>
          </div>
        )}
      </div>

      <main className="flex-1 min-w-0 overflow-y-auto pb-16 md:pb-0 pt-14 md:pt-0">
        <div className="mx-auto max-w-6xl p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <span className="grid place-items-center h-8 w-8 rounded bg-accent/20 text-accent font-bold text-sm">TL</span>
      <div className="leading-tight">
        <div className="font-semibold text-slate-100">TradeLens AI</div>
        <div className="text-[10px] text-muted">trading journal</div>
      </div>
    </div>
  );
}
