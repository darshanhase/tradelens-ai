import { DownloadCloud, HardDriveDownload, HardDriveUpload } from "lucide-react";
import { useApp } from "@/hooks/useApp";
import { downloadBlob } from "@/services/importExport/exporter";
import { createBackup } from "@/services/importExport/backup";
import { updateSettings } from "@/services/store";
import { Link } from "react-router-dom";

/**
 * Small persistent backup reminder (prompt §10): shows how long since the
 * last JSON backup and a one-click download. Browser-local data can be lost
 * if site storage is cleared, so this stays visible in the sidebar.
 */
export function BackupReminder() {
  const { trades, settings } = useApp();
  if (!settings) return null;
  const last = settings.lastBackupAt ? new Date(settings.lastBackupAt) : null;
  const days = last ? Math.floor((Date.now() - last.getTime()) / 86400000) : null;
  const stale = days === null || days >= 7;

  const backup = () => {
    const data = JSON.stringify(createBackup(trades, settings), null, 2);
    downloadBlob(data, `tradelens-ai-backup-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
    void updateSettings({ lastBackupAt: new Date().toISOString() });
  };

  return (
    <div className={`rounded-lg border p-3 text-xs ${stale ? "border-warn/40 bg-warn/10" : "border-line-700 bg-surface-850"}`}>
      <div className="flex items-center gap-1.5 font-medium text-slate-300">
        <HardDriveDownload size={13} />
        Backup
      </div>
      <p className="mt-1 text-muted leading-snug">
        {stale
          ? "Your journal lives only in this browser — download a JSON backup to keep it safe."
          : `Last backup ${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`}.`}
      </p>
      <button className={`mt-2 btn ${stale ? "btn-ghost border-warn/50 text-warn" : "btn-ghost"} !py-1 !text-xs w-full justify-center`} onClick={backup}>
        <DownloadCloud size={13} /> Download backup
      </button>
      <Link to="/settings" className="mt-1.5 flex items-center gap-1 text-[11px] text-muted hover:text-slate-300">
        <HardDriveUpload size={11} /> Restore from a backup
      </Link>
    </div>
  );
}
