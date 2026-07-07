// Audit log (admin-only): the append-only trail of who did what — logins,
// uploads, corrections, approvals/rejections, and evaluation runs. Entries are
// written server-side, so the trail also covers actions outside this UI.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listAudit, type AuditEntry } from "../api";
import { useDocuments } from "../store";
import { docLabel, formatDateTime } from "../lib/format";

const ACTION_STYLE: Record<AuditEntry["action"], { label: string; cls: string }> = {
  login: { label: "Login", cls: "bg-status-neutral/10 text-status-neutral" },
  login_failed: { label: "Login failed", cls: "bg-status-error/10 text-status-error" },
  upload: { label: "Upload", cls: "bg-status-review/10 text-status-review" },
  update: { label: "Correction", cls: "bg-status-warning/10 text-status-warning" },
  approve: { label: "Approve", cls: "bg-status-success/10 text-status-success" },
  reject: { label: "Reject", cls: "bg-status-error/10 text-status-error" },
  status_change: { label: "Status change", cls: "bg-status-neutral/10 text-status-neutral" },
  eval_run: { label: "Eval run", cls: "bg-status-review/10 text-status-review" },
  export: { label: "Export", cls: "bg-secondary/10 text-secondary" },
  settings_update: { label: "Settings", cls: "bg-status-review/10 text-status-review" },
  user_create: { label: "User added", cls: "bg-status-success/10 text-status-success" },
  user_delete: { label: "User removed", cls: "bg-status-error/10 text-status-error" },
};

export default function AuditPage() {
  const { docs } = useDocuments();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await listAudit(200));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the audit log.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Prefer the human identifier (doc_number) when the document is in the store.
  function docCell(docId: string | null) {
    if (!docId) return <span className="text-on-surface-variant">—</span>;
    const doc = docs.find((d) => d.id === docId);
    return (
      <Link
        to={`/review/${encodeURIComponent(docId)}`}
        className="mono font-semibold text-secondary hover:underline"
      >
        {doc ? docLabel(doc) : docId.slice(0, 8)}
      </Link>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-lg text-text-primary">Audit Log</h1>
          <p className="mt-1 text-body-md text-on-surface-variant">
            Who did what, and when — newest first (last {entries?.length ?? 0} events).
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1 rounded-lg border border-border-base bg-surface-white px-3 py-2 text-body-sm font-semibold text-text-primary disabled:opacity-50"
        >
          <span className={`material-symbols-outlined text-base ${loading ? "animate-spin" : ""}`}>
            refresh
          </span>
          Refresh
        </button>
      </div>

      <div className="mt-6 rounded-lg border border-border-base bg-surface-white shadow-sm">
        {entries === null && !error ? (
          <div className="space-y-3 px-5 py-6" aria-label="Loading audit log">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded-lg bg-surface-container" />
            ))}
          </div>
        ) : error ? (
          <div className="px-5 py-12 text-center text-body-md">
            <p className="text-status-error">{error}</p>
            <button
              onClick={() => void load()}
              className="mt-3 font-semibold text-secondary hover:underline"
            >
              Try again
            </button>
          </div>
        ) : entries && entries.length === 0 ? (
          <div className="px-5 py-12 text-center text-body-md text-on-surface-variant">
            No activity recorded yet — sign-ins, uploads, and review actions will appear here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-body-sm">
              <thead>
                <tr className="border-b border-border-base text-label-sm uppercase text-on-surface-variant">
                  <th className="px-5 py-3">Time</th>
                  <th className="px-5 py-3">Actor</th>
                  <th className="px-5 py-3">Action</th>
                  <th className="px-5 py-3">Document</th>
                  <th className="px-5 py-3">Detail</th>
                </tr>
              </thead>
              <tbody>
                {(entries ?? []).map((e, i) => {
                  const style = ACTION_STYLE[e.action] ?? {
                    label: e.action,
                    cls: "bg-status-neutral/10 text-status-neutral",
                  };
                  return (
                    <tr key={e.id} className={i % 2 ? "bg-surface-container-low/40" : ""}>
                      <td className="whitespace-nowrap px-5 py-2.5 text-on-surface-variant">
                        {formatDateTime(e.ts)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5">
                        <span className="text-text-primary">{e.actor ?? "anonymous"}</span>
                        {e.role && (
                          <span className="ml-1.5 text-label-sm uppercase text-on-surface-variant">
                            {e.role}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-label-sm ${style.cls}`}>
                          {style.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5">{docCell(e.doc_id)}</td>
                      <td className="min-w-[240px] px-5 py-2.5 text-on-surface-variant">{e.detail}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
