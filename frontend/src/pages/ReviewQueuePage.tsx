import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  exportAllUrl,
  downloadFile,
  downloadSelectedCsv,
  deleteDocument,
  type DocStatus,
  type DocType,
} from "../api";
import { useAuth, useDocuments } from "../store";
import StatusBadge from "../components/StatusBadge";
import { DOC_TYPE_LABEL, docLabel, formatDateTime } from "../lib/format";

const TYPES: DocType[] = ["invoice", "purchase_order", "receipt"];
const STATUSES: DocStatus[] = ["extracted", "in_review", "flagged", "approved", "rejected"];
const STATUS_LABEL: Record<DocStatus, string> = {
  extracted: "To Review",
  in_review: "Warning",
  flagged: "Error",
  approved: "Approved",
  rejected: "Rejected",
};

export default function ReviewQueuePage() {
  const { role } = useAuth();
  const { docs, loading: docsLoading, loadError, reload } = useDocuments();
  const navigate = useNavigate();

  const showUploader = role !== "user";
  const canExport = role === "staff" || role === "admin";

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [uploader, setUploader] = useState("all");
  const [typeFilter, setTypeFilter] = useState<DocType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<DocStatus | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [page, setPage] = useState(1);
  const rowsPerPage = 10;

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const uploaderOptions = useMemo(
    () => [...new Set(docs.map((d) => d.uploadedBy).filter((v): v is string => !!v))].sort(),
    [docs],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (q && !`${docLabel(d)} ${d.fileName}`.toLowerCase().includes(q)) return false;
      if (dateFrom && d.uploadedAt < dateFrom) return false;
      if (dateTo && d.uploadedAt > dateTo) return false;
      if (uploader !== "all" && d.uploadedBy !== uploader) return false;
      if (typeFilter !== "all" && d.docType !== typeFilter) return false;
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      return true;
    });
  }, [docs, search, dateFrom, dateTo, uploader, typeFilter, statusFilter]);

  const filtersActive =
    search !== "" || dateFrom !== "" || dateTo !== "" || uploader !== "all" ||
    typeFilter !== "all" || statusFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setUploader("all");
    setTypeFilter("all");
    setStatusFilter("all");
    setPage(1);
  };

  const handleDelete = async (id: string, fileName: string) => {
    if (!confirm(`Are you sure you want to permanently delete document "${fileName}"?`)) return;
    try {
      await deleteDocument(id);
      toast.success("Document deleted");
      await reload();
    } catch (e) {
      toast.error("Failed to delete document");
    }
  };

  useEffect(() => {
    setPage(1);
  }, [search, dateFrom, dateTo, uploader, typeFilter, statusFilter]);

  const totalPages = Math.ceil(filtered.length / rowsPerPage);
  const paginatedDocs = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return filtered.slice(start, start + rowsPerPage);
  }, [filtered, page]);

  const selectableIds = filtered.filter((d) => d.status === "approved").map((d) => d.id);
  const selectedVisible = selectableIds.filter((id) => selected.has(id));
  const allVisibleSelected = selectableIds.length > 0 && selectedVisible.length === selectableIds.length;
  const approvedAvailable = docs.some((d) => d.status === "approved");

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) selectableIds.forEach((id) => next.delete(id));
      else selectableIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function exportSelected() {
    if (selectedVisible.length === 0 || exporting) return;
    setMenuOpen(false);
    setExporting(true);
    try {
      await downloadSelectedCsv(selectedVisible, "documents_selected.csv");
      toast.success(`Exported ${selectedVisible.length} document${selectedVisible.length > 1 ? "s" : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  function exportAllApproved() {
    setMenuOpen(false);
    downloadFile(exportAllUrl("approved"), "documents_approved.csv").catch((e) =>
      toast.error(e instanceof Error ? e.message : "Download failed"),
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-headline-lg text-text-primary">Review Queue</h1>
      <p className="mt-1 text-body-md text-on-surface-variant">
        Manage and review extracted documents.
      </p>

      <div className="mt-8 rounded-lg border border-border-base bg-surface-white shadow-sm">
        {/* Table Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-base px-5 py-4">
          <h3 className="text-headline-md text-text-primary">Document List</h3>
          <div className="flex flex-wrap items-center gap-4">
            {canExport && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  disabled={exporting}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-body-sm font-semibold text-white hover:bg-primary-container disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-base">download</span>
                  {exporting ? "Exporting…" : "Export"}
                  <span className="material-symbols-outlined text-base">
                    {menuOpen ? "arrow_drop_up" : "arrow_drop_down"}
                  </span>
                </button>
                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-border-base bg-surface-white p-1 shadow-lg"
                  >
                    <button
                      role="menuitem"
                      onClick={() => void exportSelected()}
                      disabled={selectedVisible.length === 0}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-body-sm text-text-primary hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-base">checklist</span>
                      Export selected to CSV
                      {selectedVisible.length > 0 && ` (${selectedVisible.length})`}
                    </button>
                    {role === "admin" && (
                      <button
                        role="menuitem"
                        onClick={exportAllApproved}
                        disabled={!approvedAvailable}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-body-sm text-text-primary hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-base">done_all</span>
                        Export all approved to CSV
                      </button>
                    )}
                    <p className="px-3 py-1.5 text-label-sm text-on-surface-variant">
                      Tick approved rows below to export a selection.
                    </p>
                  </div>
                )}
              </div>
            )}
            <span className="text-body-sm text-on-surface-variant">
              {filtersActive ? `${filtered.length} of ${docs.length}` : docs.length} document(s)
            </span>
          </div>
        </div>

        {/* Filters */}
        {docs.length > 0 && (
          <div className="flex flex-wrap items-end gap-3 border-b border-border-base px-5 py-3">
            <label className="flex-1 min-w-[200px]">
              <span className="text-label-sm uppercase text-on-surface-variant">Search</span>
              <div className="mt-1 flex h-9 items-center gap-2 rounded-lg border border-border-base px-2.5">
                <span className="material-symbols-outlined text-base text-on-surface-variant">search</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="File name or Doc ID"
                  aria-label="Search by file name or document ID"
                  className="h-full w-full bg-transparent text-body-sm focus:outline-none"
                />
              </div>
            </label>

            <label>
              <span className="text-label-sm uppercase text-on-surface-variant">Uploaded from</span>
              <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} className="mt-1 h-9 rounded-lg border border-border-base px-2 text-body-sm focus:border-secondary focus:outline-none" />
            </label>
            <label>
              <span className="text-label-sm uppercase text-on-surface-variant">to</span>
              <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} className="mt-1 h-9 rounded-lg border border-border-base px-2 text-body-sm focus:border-secondary focus:outline-none" />
            </label>

            {showUploader && uploaderOptions.length > 0 && (
              <label>
                <span className="text-label-sm uppercase text-on-surface-variant">Uploaded by</span>
                <select value={uploader} onChange={(e) => setUploader(e.target.value)} className="mt-1 h-9 rounded-lg border border-border-base bg-surface-white px-2 text-body-sm focus:border-secondary focus:outline-none">
                  <option value="all">All</option>
                  {uploaderOptions.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </label>
            )}

            <label>
              <span className="text-label-sm uppercase text-on-surface-variant">Type</span>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as DocType | "all")} className="mt-1 h-9 rounded-lg border border-border-base bg-surface-white px-2 text-body-sm focus:border-secondary focus:outline-none">
                <option value="all">All</option>
                {TYPES.map((t) => <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>)}
              </select>
            </label>

            <label>
              <span className="text-label-sm uppercase text-on-surface-variant">Status</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as DocStatus | "all")} className="mt-1 h-9 rounded-lg border border-border-base bg-surface-white px-2 text-body-sm focus:border-secondary focus:outline-none">
                <option value="all">All</option>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>

            {filtersActive && (
              <button onClick={clearFilters} className="flex h-9 items-center gap-1 rounded-lg border border-border-base px-3 text-body-sm font-semibold text-text-primary hover:bg-surface-container">
                <span className="material-symbols-outlined text-base">filter_alt_off</span>
                Clear
              </button>
            )}
          </div>
        )}

        {/* Table */}
        {docsLoading && docs.length === 0 ? (
          <div className="space-y-3 px-5 py-6">
            {[0, 1, 2].map((i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-surface-container" />)}
          </div>
        ) : docs.length === 0 ? (
          <div className="px-5 py-12 text-center text-body-md text-on-surface-variant">
            {loadError ? "Couldn't load documents." : "No documents yet."}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-body-md text-on-surface-variant">
            No documents match these filters. <button onClick={clearFilters} className="font-semibold text-secondary hover:underline">Clear filters</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className={`w-full ${showUploader ? "min-w-[880px]" : "min-w-[720px]"} text-left`}>
              <thead>
                <tr className="text-label-sm uppercase text-on-surface-variant">
                  {canExport && (
                    <th className="w-10 px-5 py-3">
                      <input type="checkbox" checked={allVisibleSelected} disabled={selectableIds.length === 0} onChange={toggleSelectAll} className="h-4 w-4 accent-secondary disabled:opacity-40" />
                    </th>
                  )}
                  <th className="px-5 py-3">Doc ID</th>
                  <th className="px-5 py-3">File Name</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Uploaded</th>
                  {showUploader && <th className="px-5 py-3">Uploaded By</th>}
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="text-body-md">
                {paginatedDocs.map((d, i) => (
                  <tr key={d.id} className={selected.has(d.id) ? "bg-secondary/5" : i % 2 ? "bg-surface-container-low/40" : ""}>
                    {canExport && (
                      <td className="px-5 py-3">
                        <input type="checkbox" checked={selected.has(d.id)} disabled={d.status !== "approved"} onChange={() => toggleRow(d.id)} className="h-4 w-4 accent-secondary disabled:cursor-not-allowed disabled:opacity-30" />
                      </td>
                    )}
                    <td className="px-5 py-3 font-semibold text-secondary mono">{docLabel(d)}</td>
                    <td className="max-w-[260px] truncate px-5 py-3 text-text-primary">{d.fileName}</td>
                    <td className="px-5 py-3 text-on-surface-variant">{DOC_TYPE_LABEL[d.docType]}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-on-surface-variant">{formatDateTime(d.uploadedAt)}</td>
                    {showUploader && <td className="whitespace-nowrap px-5 py-3 text-on-surface-variant">{d.uploadedBy ?? "—"}</td>}
                    <td className="px-5 py-3"><StatusBadge status={d.status} /></td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-4 items-center">
                        <button onClick={() => navigate(`/review/${encodeURIComponent(d.id)}`)} className="font-semibold text-secondary hover:underline">View</button>
                        {role === "admin" && (
                          <button onClick={() => handleDelete(d.id, d.fileName)} className="text-status-error hover:text-red-700 hover:bg-red-50 p-1 rounded transition-colors flex items-center justify-center" title="Delete Document">
                            <span className="material-symbols-outlined text-[20px]">delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border-base px-5 py-3 bg-surface-white">
                <span className="text-body-sm text-on-surface-variant">
                  Showing {(page - 1) * rowsPerPage + 1} to {Math.min(page * rowsPerPage, filtered.length)} of {filtered.length}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-border-base text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-lg">chevron_left</span>
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-border-base text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-lg">chevron_right</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
