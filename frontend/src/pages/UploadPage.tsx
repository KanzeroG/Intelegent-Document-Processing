// Upload screen: stage one or many documents, pick a type per file, then run
// extraction for the whole batch. Files are extracted sequentially (the local
// model handles one at a time); each result is persisted and added to the
// "My Documents" table as it completes.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  extractDocument,
  exportAllUrl,
  downloadFile,
  downloadSelectedCsv,
  listModels,
  type DocStatus,
  type DocType,
  type ModelOption,
} from "../api";
import { useAuth, useDocuments } from "../store";
import StatusBadge from "../components/StatusBadge";
import { DOC_TYPE_LABEL, docLabel, formatDateTime } from "../lib/format";

const TYPES: DocType[] = ["invoice", "purchase_order", "receipt"];
// Type stamped on newly added files; change each file's type in the staged list.
const DEFAULT_DOC_TYPE: DocType = "invoice";
const STATUSES: DocStatus[] = ["extracted", "in_review", "flagged", "approved", "rejected"];
const STATUS_LABEL: Record<DocStatus, string> = {
  extracted: "Extracted",
  in_review: "In Review",
  flagged: "Flagged",
  approved: "Approved",
  rejected: "Rejected",
};

interface Staged {
  key: string;
  file: File;
  docType: DocType;
}

const newKey = () =>
  (globalThis.crypto?.randomUUID?.() ?? String(Math.random())).slice(0, 12);

export default function UploadPage() {
  const { role } = useAuth();
  const { docs, addRecord, loading: docsLoading, loadError } = useDocuments();
  const navigate = useNavigate();

  const [staged, setStaged] = useState<Staged[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Extraction model. Empty string = whatever the backend defaults to, so the
  // picker never has to hard-code which model that is.
  const [models, setModels] = useState<ModelOption[]>([]);
  const [model, setModel] = useState("");

  useEffect(() => {
    // A failure here is non-fatal: the picker just stays hidden and extraction
    // uses the backend default, exactly as it did before this existed.
    listModels()
      .then((m) => {
        setModels(m);
        // Preselect the backend's own default (DEFAULT_MODEL) rather than
        // guessing, so .env stays authoritative. Fall back to any usable model —
        // never one whose API key is missing, or the first extraction would fail
        // for no clear reason.
        setModel(
          (cur) =>
            cur || m.find((x) => x.default_extract)?.key || m.find((x) => x.configured)?.key || "",
        );
      })
      .catch(() => setModels([]));
  }, []);

  const activeModel = models.find((m) => m.key === model);

  const loading = progress !== null;
  // Staff/admin see everyone's documents, so show who uploaded each one and
  // allow filtering by uploader + selecting rows to export.
  const showUploader = role !== "user";
  const canExport = role === "staff" || role === "admin";

  // --- My Documents: filters + row selection ------------------------------
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

  // Close the export menu on outside-click or Escape.
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

  // Distinct uploader emails present in the current document set (staff/admin).
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

  function clearFilters() {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setUploader("all");
    setTypeFilter("all");
    setStatusFilter("all");
  }

  // Only APPROVED rows are exportable — a document must clear human review
  // before its data can leave the system. So only approved rows are selectable.
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

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list).map((file) => ({ key: newKey(), file, docType: DEFAULT_DOC_TYPE }));
    setStaged((prev) => [...prev, ...next]);
  }

  async function runBatch() {
    if (staged.length === 0) return;
    let ok = 0;
    for (let i = 0; i < staged.length; i++) {
      const s = staged[i];
      setProgress({ done: i, total: staged.length, current: s.file.name });
      try {
        addRecord(await extractDocument(s.file, s.docType, model || undefined));
        ok += 1;
      } catch (e) {
        toast.error(`${s.file.name}: ${e instanceof Error ? e.message : "failed"}`);
      }
    }
    setProgress(null);
    setStaged([]);
    if (ok) toast.success(`Extracted ${ok} document${ok > 1 ? "s" : ""}`);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-headline-lg text-text-primary">Upload Documents</h1>
      <p className="mt-1 text-body-md text-on-surface-variant">
        Process one or many financial documents using Indonesian-optimized AI.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-gutter lg:grid-cols-3">
        {/* Drop zone + staged list */}
        <div className="lg:col-span-2 space-y-gutter">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = ""; // allow re-selecting the same file
            }}
          />

          <div
            onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              addFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={[
              "flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-surface-white p-8 text-center transition-colors",
              dragActive ? "border-secondary bg-secondary/5" : "border-outline-variant",
            ].join(" ")}
          >
            <span className="material-symbols-outlined text-5xl text-secondary">cloud_upload</span>
            <p className="mt-3 text-headline-md text-text-primary">
              Drag invoices, purchase orders, or receipts here
            </p>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              Multiple files supported · PDF, PNG, or JPG
            </p>
            <span className="mt-4 rounded-lg bg-primary px-4 py-2 text-body-md font-semibold text-white">
              Browse files
            </span>
          </div>

          {/* Staged files */}
          {staged.length > 0 && (
            <div className="rounded-lg border border-border-base bg-surface-white shadow-sm">
              <div className="flex items-center justify-between border-b border-border-base px-5 py-3">
                <span className="text-body-md font-semibold text-text-primary">
                  {staged.length} file{staged.length > 1 ? "s" : ""} ready
                </span>
                <button
                  onClick={() => setStaged([])}
                  disabled={loading}
                  className="text-body-sm text-on-surface-variant hover:text-status-error disabled:opacity-50"
                >
                  Clear all
                </button>
              </div>

              <ul className="divide-y divide-border-base">
                {staged.map((s) => (
                  <li key={s.key} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="material-symbols-outlined text-secondary">description</span>
                    <span className="flex-1 truncate text-body-md text-text-primary">{s.file.name}</span>
                    <select
                      value={s.docType}
                      disabled={loading}
                      onChange={(e) =>
                        setStaged((prev) => prev.map((x) => (x.key === s.key ? { ...x, docType: e.target.value as DocType } : x)))
                      }
                      className="rounded-lg border border-border-base bg-surface-white px-2 py-1 text-body-sm"
                    >
                      {TYPES.map((t) => (
                        <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setStaged((prev) => prev.filter((x) => x.key !== s.key))}
                      disabled={loading}
                      className="text-on-surface-variant hover:text-status-error disabled:opacity-50"
                      aria-label="Remove"
                    >
                      <span className="material-symbols-outlined text-base">close</span>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="border-t border-border-base p-4">
                {progress ? (
                  <div>
                    <div className="flex justify-between text-body-sm text-on-surface-variant">
                      <span className="truncate">Extracting {progress.current}…</span>
                      <span className="mono">{progress.done}/{progress.total}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-surface-container">
                      <div className="h-2 rounded-full bg-secondary transition-all"
                        style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={runBatch}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary font-semibold text-white hover:bg-primary-container"
                  >
                    <span className="material-symbols-outlined text-base">auto_awesome</span>
                    Extract {staged.length} document{staged.length > 1 ? "s" : ""}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Processing settings */}
        <div className="rounded-lg border border-border-base bg-surface-white p-5 shadow-sm">
          <h3 className="text-headline-md text-text-primary">Processing Settings</h3>

          {/* Model picker. Hidden when /models is unreachable — extraction then
              falls back to the backend default. */}
          {models.length > 0 && (
            <label className="mt-4 block">
              <span className="text-label-md text-on-surface-variant">Extraction Model</span>
              <select
                value={model}
                disabled={loading}
                onChange={(e) => setModel(e.target.value)}
                aria-label="Extraction model"
                className="mt-1.5 h-10 w-full rounded-lg border border-border-base bg-surface-white px-3 text-body-md text-text-primary focus:border-secondary focus:outline-none disabled:opacity-50"
              >
                {models.map((m) => (
                  <option key={m.key} value={m.key} disabled={!m.configured}>
                    {m.label}
                    {!m.configured ? " — API key needed" : ""}
                  </option>
                ))}
              </select>
              {/* Hosted models send the document off this machine — say so, since
                  on-premise privacy is part of this project's pitch. */}
              {activeModel?.remote && (
                <span className="mt-1.5 flex gap-1.5 text-body-sm text-status-review">
                  <span className="material-symbols-outlined text-base">cloud_upload</span>
                  Documents are sent to a hosted API, not processed on this machine.
                </span>
              )}
            </label>
          )}

          <label className="mt-4 block">
            <span className="text-label-md text-on-surface-variant">Extraction Language</span>
            <div className="mt-1.5 flex h-10 items-center gap-2 rounded-lg border border-border-base px-3 text-body-md text-text-primary">
              <span className="material-symbols-outlined text-base text-on-surface-variant">language</span>
              Bahasa Indonesia / English
            </div>
          </label>

          <div className="mt-4 flex gap-2 rounded-lg bg-secondary/5 p-3 text-body-sm text-secondary">
            <span className="material-symbols-outlined text-base">info</span>
            Files extract one at a time locally; a batch of many docs will take a while.
          </div>
        </div>
      </div>

      {/* My Documents */}
      <div className="mt-8 rounded-lg border border-border-base bg-surface-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-base px-5 py-4">
          <h3 className="text-headline-md text-text-primary">My Documents</h3>
          <div className="flex flex-wrap items-center gap-4">
            {/* Export menu (staff/admin). Only approved documents are exportable —
                exports are attributed in the audit log. */}
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

        {/* Filter toolbar */}
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
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
                aria-label="Uploaded from date"
                className="mt-1 h-9 rounded-lg border border-border-base px-2 text-body-sm focus:border-secondary focus:outline-none"
              />
            </label>
            <label>
              <span className="text-label-sm uppercase text-on-surface-variant">to</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
                aria-label="Uploaded to date"
                className="mt-1 h-9 rounded-lg border border-border-base px-2 text-body-sm focus:border-secondary focus:outline-none"
              />
            </label>

            {showUploader && uploaderOptions.length > 0 && (
              <label>
                <span className="text-label-sm uppercase text-on-surface-variant">Uploaded by</span>
                <select
                  value={uploader}
                  onChange={(e) => setUploader(e.target.value)}
                  aria-label="Filter by uploader"
                  className="mt-1 h-9 rounded-lg border border-border-base bg-surface-white px-2 text-body-sm focus:border-secondary focus:outline-none"
                >
                  <option value="all">All</option>
                  {uploaderOptions.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </label>
            )}

            <label>
              <span className="text-label-sm uppercase text-on-surface-variant">Type</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as DocType | "all")}
                aria-label="Filter by type"
                className="mt-1 h-9 rounded-lg border border-border-base bg-surface-white px-2 text-body-sm focus:border-secondary focus:outline-none"
              >
                <option value="all">All</option>
                {TYPES.map((t) => (
                  <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </label>

            <label>
              <span className="text-label-sm uppercase text-on-surface-variant">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as DocStatus | "all")}
                aria-label="Filter by status"
                className="mt-1 h-9 rounded-lg border border-border-base bg-surface-white px-2 text-body-sm focus:border-secondary focus:outline-none"
              >
                <option value="all">All</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </label>

            {filtersActive && (
              <button
                onClick={clearFilters}
                className="flex h-9 items-center gap-1 rounded-lg border border-border-base px-3 text-body-sm font-semibold text-text-primary hover:bg-surface-container"
              >
                <span className="material-symbols-outlined text-base">filter_alt_off</span>
                Clear
              </button>
            )}
          </div>
        )}

        {docsLoading && docs.length === 0 ? (
          // Initial load: skeleton rows instead of a misleading empty state.
          <div className="space-y-3 px-5 py-6" aria-label="Loading documents">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded-lg bg-surface-container" />
            ))}
          </div>
        ) : docs.length === 0 ? (
          <div className="px-5 py-12 text-center text-body-md text-on-surface-variant">
            {loadError
              ? "Couldn't load documents — check the backend connection, then Retry from the banner above."
              : "No documents yet — upload one above to get started."}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-body-md text-on-surface-variant">
            No documents match these filters.{" "}
            <button onClick={clearFilters} className="font-semibold text-secondary hover:underline">
              Clear filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className={`w-full ${showUploader ? "min-w-[880px]" : "min-w-[720px]"} text-left`}>
              <thead>
                <tr className="text-label-sm uppercase text-on-surface-variant">
                  {canExport && (
                    <th className="w-10 px-5 py-3">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        disabled={selectableIds.length === 0}
                        onChange={toggleSelectAll}
                        aria-label="Select all approved documents"
                        title="Select all approved documents"
                        className="h-4 w-4 accent-secondary disabled:opacity-40"
                      />
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
                {filtered.map((d, i) => (
                  <tr
                    key={d.id}
                    className={selected.has(d.id) ? "bg-secondary/5" : i % 2 ? "bg-surface-container-low/40" : ""}
                  >
                    {canExport && (
                      <td className="px-5 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(d.id)}
                          disabled={d.status !== "approved"}
                          onChange={() => toggleRow(d.id)}
                          aria-label={`Select ${docLabel(d)}`}
                          title={
                            d.status === "approved"
                              ? `Select ${docLabel(d)}`
                              : "Only approved documents can be exported"
                          }
                          className="h-4 w-4 accent-secondary disabled:cursor-not-allowed disabled:opacity-30"
                        />
                      </td>
                    )}
                    <td className="px-5 py-3 font-semibold text-secondary mono">{docLabel(d)}</td>
                    <td className="max-w-[260px] truncate px-5 py-3 text-text-primary">{d.fileName}</td>
                    <td className="px-5 py-3 text-on-surface-variant">{DOC_TYPE_LABEL[d.docType]}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-on-surface-variant">{formatDateTime(d.uploadedAt)}</td>
                    {showUploader && (
                      <td className="whitespace-nowrap px-5 py-3 text-on-surface-variant">{d.uploadedBy ?? "—"}</td>
                    )}
                    <td className="px-5 py-3">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => navigate(`/review/${encodeURIComponent(d.id)}`)}
                        className="font-semibold text-secondary hover:underline"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
