// The Archive: where a document lands once an admin approves it.
//
//   upload -> review -> approve -> archive
//
// Two views share this file because they're two zoom levels on the same data:
//   /archive              -> a year of 12 month cards (count per month)
//   /archive/:year/:month -> that month's approved documents, grouped by the
//                            date they were approved (= the export date),
//                            each date collapsible.
//
// Grouping is by `approvedAt`, not upload time — the archive answers "what was
// signed off and released, and when", which is the question an audit asks.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useDocuments, type DocRecord } from "../store";
import { DOC_TYPE_LABEL, docLabel } from "../lib/format";
import { downloadArchiveExport, type DocType, type ExportFormat } from "../api";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const TYPES: DocType[] = ["invoice", "purchase_order", "receipt"];

// "YYYY-MM-DD" of the approval, or null if the doc never got approved.
// Tolerates both shapes the backend can produce ("...T..." and "... ...").
function archiveDate(d: DocRecord): string | null {
  if (d.status !== "approved" || !d.approvedAt) return null;
  return d.approvedAt.slice(0, 10);
}

// Only approved documents live in the archive; newest approval first.
function useArchivedDocs(): DocRecord[] {
  const { docs } = useDocuments();
  return useMemo(
    () =>
      docs
        .filter((d) => archiveDate(d) !== null)
        .sort((a, b) => (b.approvedAt ?? "").localeCompare(a.approvedAt ?? "")),
    [docs],
  );
}

// A long date header like "Saturday, 26 July 2026".
function formatDayHeading(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Export menu — pick a period + a file format, download the report
// ---------------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, "0");

// First / last calendar day of a month, as "YYYY-MM-DD". Day 0 of the *next*
// month is the last day of this one, which gets February right for free.
const monthStart = (year: number, month: number) => `${year}-${pad2(month + 1)}-01`;
const monthEnd = (year: number, month: number) =>
  `${year}-${pad2(month + 1)}-${pad2(new Date(year, month + 1, 0).getDate())}`;

// How the reviewer describes the period they want. All three collapse to one
// inclusive start/end pair before they reach the backend, which only speaks
// dates — the modes exist so nobody has to type "1 Jan" to mean "this year".
type RangeMode = "year" | "months" | "dates";

const FORMATS: { key: ExportFormat; label: string; hint: string; icon: string }[] = [
  { key: "pdf", label: "PDF", hint: "Printable report", icon: "picture_as_pdf" },
  { key: "docx", label: "Word", hint: ".docx table", icon: "description" },
  { key: "xlsx", label: "Excel", hint: ".xlsx + line items", icon: "table_view" },
  { key: "csv", label: "CSV", hint: "Raw columns", icon: "table_rows" },
  { key: "json", label: "JSON", hint: "Full structured data", icon: "data_object" },
];

function ExportMenu({ year, archived }: { year: number; archived: DocRecord[] }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<RangeMode>("year");
  const [fromMonth, setFromMonth] = useState(0);
  const [toMonth, setToMonth] = useState(11);
  // Empty means "not chosen yet" and falls back to the year's bounds below, so
  // the date fields never need re-syncing when the reviewer switches years.
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [docType, setDocType] = useState<DocType | "all">("all");
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Click-outside / Escape to dismiss, the way a menu is expected to behave.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const range = useMemo(() => {
    if (mode === "months") {
      return { start: monthStart(year, fromMonth), end: monthEnd(year, toMonth) };
    }
    if (mode === "dates") {
      return {
        start: fromDate || monthStart(year, 0),
        end: toDate || monthEnd(year, 11),
      };
    }
    return { start: monthStart(year, 0), end: monthEnd(year, 11) };
  }, [mode, year, fromMonth, toMonth, fromDate, toDate]);

  const reversed = range.start > range.end;

  // Counted client-side from the same records the grid renders, so the button
  // can say up-front how many documents the file will hold.
  const matchCount = useMemo(() => {
    if (reversed) return 0;
    return archived.filter((d) => {
      const day = archiveDate(d)!;
      if (day < range.start || day > range.end) return false;
      return docType === "all" || d.docType === docType;
    }).length;
  }, [archived, range, docType, reversed]);

  async function runExport() {
    setBusy(true);
    try {
      await downloadArchiveExport({
        start: range.start,
        end: range.end,
        format,
        docType: docType === "all" ? undefined : docType,
      });
      toast.success(`Exported ${matchCount} document${matchCount === 1 ? "" : "s"} as ${format.toUpperCase()}`);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  // Keep the two month pickers in order: moving one past the other drags the
  // other along, rather than leaving an impossible range on screen.
  function pickFromMonth(m: number) {
    setFromMonth(m);
    if (m > toMonth) setToMonth(m);
  }
  function pickToMonth(m: number) {
    setToMonth(m);
    if (m < fromMonth) setFromMonth(m);
  }

  const fieldClass =
    "mt-1 h-9 w-full rounded-lg border border-border-base bg-surface-white px-2 text-body-sm focus:border-secondary focus:outline-none";

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-border-base px-3 text-body-sm font-semibold text-text-primary hover:bg-surface-container"
      >
        <span className="material-symbols-outlined text-base">download</span>
        Export
        <span className="material-symbols-outlined text-base">
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>

      {open && (
        // Anchored left: the trigger sits near the start of the content area, so
        // a right-anchored panel would slide under the sidebar. Height is capped
        // to the viewport and scrolls, so the Export button stays reachable.
        <div
          role="dialog"
          aria-label="Export archive"
          className="animate-fade-slide-up absolute left-0 z-20 mt-2 flex max-h-[calc(100vh-13rem)] w-[22rem] flex-col overflow-hidden rounded-lg border border-border-base bg-surface-white shadow-lg"
        >
          {/* Scrollable body; the footer below stays pinned so the Export
              button is reachable without scrolling to it. */}
          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-label-sm uppercase text-on-surface-variant">Period</p>
            <div className="mt-1.5 flex rounded-lg border border-border-base p-0.5">
              {([
                ["year", "Full year"],
                ["months", "Months"],
                ["dates", "Dates"],
              ] as [RangeMode, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setMode(key)}
                  className={[
                    "flex-1 rounded-md px-2 py-1.5 text-body-sm font-semibold transition-colors",
                    mode === key
                      ? "bg-secondary-container text-on-secondary-container"
                      : "text-on-surface-variant hover:bg-surface-container",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === "year" && (
              <p className="mt-3 rounded-lg bg-surface-container-low/60 px-3 py-2 text-body-sm text-on-surface-variant">
                All of <span className="font-semibold text-text-primary">{year}</span> — 1 January
                to 31 December.
              </p>
            )}

            {mode === "months" && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label>
                  <span className="text-label-sm uppercase text-on-surface-variant">From</span>
                  <select
                    value={fromMonth}
                    onChange={(e) => pickFromMonth(Number(e.target.value))}
                    className={fieldClass}
                  >
                    {MONTHS.map((m, i) => <option key={m} value={i}>{m} {year}</option>)}
                  </select>
                </label>
                <label>
                  <span className="text-label-sm uppercase text-on-surface-variant">To</span>
                  <select
                    value={toMonth}
                    onChange={(e) => pickToMonth(Number(e.target.value))}
                    className={fieldClass}
                  >
                    {MONTHS.map((m, i) => <option key={m} value={i}>{m} {year}</option>)}
                  </select>
                </label>
              </div>
            )}

            {mode === "dates" && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label>
                  <span className="text-label-sm uppercase text-on-surface-variant">From</span>
                  <input
                    type="date"
                    value={fromDate || monthStart(year, 0)}
                    onChange={(e) => setFromDate(e.target.value)}
                    className={fieldClass}
                  />
                </label>
                <label>
                  <span className="text-label-sm uppercase text-on-surface-variant">To</span>
                  <input
                    type="date"
                    value={toDate || monthEnd(year, 11)}
                    onChange={(e) => setToDate(e.target.value)}
                    className={fieldClass}
                  />
                </label>
              </div>
            )}

            <label className="mt-3 block">
              <span className="text-label-sm uppercase text-on-surface-variant">Type</span>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocType | "all")}
                className={fieldClass}
              >
                <option value="all">All types</option>
                {TYPES.map((t) => <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>)}
              </select>
            </label>

            <p className="mt-4 text-label-sm uppercase text-on-surface-variant">Format</p>
            <div className="mt-1.5 space-y-1">
              {FORMATS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFormat(f.key)}
                  aria-pressed={format === f.key}
                  className={[
                    "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                    format === f.key
                      ? "border-secondary bg-secondary/10"
                      : "border-transparent hover:bg-surface-container",
                  ].join(" ")}
                >
                  <span className="material-symbols-outlined text-lg text-on-surface-variant">
                    {f.icon}
                  </span>
                  <span className="flex-1">
                    <span className="block text-body-sm font-semibold text-text-primary">{f.label}</span>
                    <span className="block text-label-sm text-on-surface-variant">{f.hint}</span>
                  </span>
                  {format === f.key && (
                    <span className="material-symbols-outlined text-base text-secondary">check</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border-base bg-surface-white px-4 py-3">
            <span className="text-body-sm text-on-surface-variant">
              {reversed
                ? "End is before start"
                : `${matchCount} document${matchCount === 1 ? "" : "s"}`}
            </span>
            <button
              onClick={() => void runExport()}
              disabled={busy || reversed || matchCount === 0}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-secondary px-4 text-body-sm font-semibold text-on-secondary hover:opacity-90 disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-base">
                {busy ? "hourglass_top" : "download"}
              </span>
              {busy ? "Preparing…" : "Export"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// /archive — the 12-month grid for one year
// ---------------------------------------------------------------------------

export default function ArchivePage() {
  const archived = useArchivedDocs();
  const navigate = useNavigate();
  const { loading } = useDocuments();

  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);

  // Documents per month index (0-11) for the selected year.
  const perMonth = useMemo(() => {
    const counts = new Array(12).fill(0) as number[];
    for (const d of archived) {
      const date = archiveDate(d)!;
      if (Number(date.slice(0, 4)) === year) counts[Number(date.slice(5, 7)) - 1] += 1;
    }
    return counts;
  }, [archived, year]);

  // Years that actually hold documents — used to stop the arrows wandering
  // into empty decades.
  const years = useMemo(() => {
    const set = new Set<number>([thisYear]);
    for (const d of archived) set.add(Number(archiveDate(d)!.slice(0, 4)));
    return [...set].sort((a, b) => a - b);
  }, [archived, thisYear]);

  const minYear = years[0];
  const maxYear = years[years.length - 1];
  const yearTotal = perMonth.reduce((a, b) => a + b, 0);

  return (
    <div className="mx-auto max-w-6xl p-gutter">
      <h1 className="text-headline-lg text-text-primary">Archive</h1>
      <p className="mt-1 text-body-md text-on-surface-variant">
        Approved documents, filed by the month they were approved. Pick a month to
        open it.
      </p>

      {/* Year switcher */}
      <div className="mt-8 flex items-center justify-between gap-3 rounded-lg border border-border-base bg-surface-white px-5 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setYear((y) => y - 1)}
            disabled={year <= minYear}
            aria-label="Previous year"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-base text-on-surface-variant hover:bg-surface-container disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-lg">chevron_left</span>
          </button>
          <span className="min-w-[5ch] text-center text-headline-md font-semibold text-text-primary">
            {year}
          </span>
          <button
            onClick={() => setYear((y) => y + 1)}
            disabled={year >= maxYear}
            aria-label="Next year"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-base text-on-surface-variant hover:bg-surface-container disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-lg">chevron_right</span>
          </button>
          <ExportMenu year={year} archived={archived} />
        </div>
        <span className="text-body-sm text-on-surface-variant">
          {yearTotal} approved document{yearTotal === 1 ? "" : "s"} in {year}
        </span>
      </div>

      {/* Month grid */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MONTHS.map((name, i) => {
          const count = perMonth[i];
          const empty = count === 0;
          return (
            <button
              key={name}
              disabled={empty}
              onClick={() => navigate(`/archive/${year}/${String(i + 1).padStart(2, "0")}`)}
              className={[
                "animate-fade-slide-up flex flex-col items-start gap-1 rounded-lg border p-5 text-left transition-all",
                empty
                  ? "cursor-not-allowed border-border-base bg-surface-container-low/40 text-on-surface-variant"
                  : "border-border-base bg-surface-white shadow-sm hover:-translate-y-0.5 hover:border-secondary hover:shadow-md",
              ].join(" ")}
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <div className="flex w-full items-center justify-between">
                <span className={`text-headline-md ${empty ? "" : "text-text-primary"}`}>{name}</span>
                <span className="material-symbols-outlined text-lg text-on-surface-variant">
                  {empty ? "folder_off" : "folder"}
                </span>
              </div>
              <span className="text-body-sm text-on-surface-variant">
                {loading && empty ? "…" : empty ? "No documents" : `${count} document${count === 1 ? "" : "s"}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// /archive/:year/:month — one month, grouped by approval date
// ---------------------------------------------------------------------------

export function ArchiveMonthPage() {
  const { year = "", month = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const archived = useArchivedDocs();

  const yearNum = Number(year);
  const monthNum = Number(month);
  const prefix = `${year}-${String(monthNum).padStart(2, "0")}`; // "2026-07"
  const monthLabel = MONTHS[monthNum - 1] ?? month;

  // The document just approved (passed by the review page) gets highlighted and
  // its day opened, so the reviewer lands on exactly what they signed off.
  const focusDoc = params.get("doc");
  const focusDate = params.get("date");

  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState(focusDate ?? "");
  const [typeFilter, setTypeFilter] = useState<DocType | "all">("all");
  // `null` means "the reviewer hasn't opened/closed anything yet", in which case
  // the default below applies. Derived rather than synced in an effect, so the
  // open set can never lag behind the groups it refers to.
  const [openDays, setOpenDays] = useState<Set<string> | null>(
    () => (focusDate ? new Set([focusDate]) : null),
  );

  const inMonth = useMemo(
    () => archived.filter((d) => archiveDate(d)!.startsWith(prefix)),
    [archived, prefix],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inMonth.filter((d) => {
      if (q && !`${docLabel(d)} ${d.fileName}`.toLowerCase().includes(q)) return false;
      if (dateFilter && archiveDate(d) !== dateFilter) return false;
      if (typeFilter !== "all" && d.docType !== typeFilter) return false;
      return true;
    });
  }, [inMonth, search, dateFilter, typeFilter]);

  // Date -> documents, newest day first (the map preserves insertion order and
  // `archived` is already sorted newest-first).
  const byDay = useMemo(() => {
    const groups = new Map<string, DocRecord[]>();
    for (const d of filtered) {
      const key = archiveDate(d)!;
      const day = groups.get(key);
      if (day) day.push(d);
      else groups.set(key, [d]);
    }
    return [...groups.entries()];
  }, [filtered]);

  // Default: the newest day is expanded, so the page is never a wall of closed
  // rows — whatever the filters currently leave at the top.
  const defaultOpen = useMemo(() => new Set(byDay.slice(0, 1).map(([day]) => day)), [byDay]);
  const openSet = openDays ?? defaultOpen;

  function toggleDay(day: string) {
    setOpenDays((prev) => {
      const next = new Set(prev ?? defaultOpen);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  // A date outside this month is still a valid thing to ask for — jump to the
  // month that owns it rather than showing an empty list.
  function onDateChange(value: string) {
    setDateFilter(value);
    setParams({}, { replace: true }); // drop the post-approval focus params
    if (value && !value.startsWith(prefix)) {
      navigate(`/archive/${value.slice(0, 4)}/${value.slice(5, 7)}?date=${value}`);
      return;
    }
    if (value) setOpenDays(new Set([value]));
  }

  const filtersActive = search !== "" || dateFilter !== "" || typeFilter !== "all";

  function clearFilters() {
    setSearch("");
    setDateFilter("");
    setTypeFilter("all");
    setOpenDays(null); // back to "newest day open"
  }

  if (!MONTHS[monthNum - 1] || Number.isNaN(yearNum)) {
    return (
      <div className="mx-auto max-w-6xl p-gutter">
        <p className="text-body-md text-on-surface-variant">That month doesn't exist.</p>
        <button onClick={() => navigate("/archive")} className="mt-2 font-semibold text-secondary hover:underline">
          Back to Archive
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-gutter">
      <nav className="flex items-center gap-2 text-body-sm text-on-surface-variant">
        <button onClick={() => navigate("/archive")} className="font-semibold text-secondary hover:underline">
          Archive
        </button>
        <span>›</span>
        <span>{monthLabel} {year}</span>
      </nav>

      <h1 className="mt-2 text-headline-lg text-text-primary">
        {monthLabel} {year}
      </h1>
      <p className="mt-1 text-body-md text-on-surface-variant">
        {inMonth.length} approved document{inMonth.length === 1 ? "" : "s"}, grouped by
        approval date.
      </p>

      <div className="mt-8 rounded-lg border border-border-base bg-surface-white shadow-sm">
        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 border-b border-border-base px-5 py-3">
          <label className="flex-1 min-w-[200px]">
            <span className="text-label-sm uppercase text-on-surface-variant">Search</span>
            <div className="mt-1 flex h-9 items-center gap-2 rounded-lg border border-border-base px-2.5">
              <span className="material-symbols-outlined text-base text-on-surface-variant">search</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Doc name or Doc ID"
                aria-label="Search by document name or document ID"
                className="h-full w-full bg-transparent text-body-sm focus:outline-none"
              />
            </div>
          </label>

          <label>
            <span className="text-label-sm uppercase text-on-surface-variant">Approved on</span>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => onDateChange(e.target.value)}
              className="mt-1 h-9 rounded-lg border border-border-base px-2 text-body-sm focus:border-secondary focus:outline-none"
            />
          </label>

          <label>
            <span className="text-label-sm uppercase text-on-surface-variant">Type</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as DocType | "all")}
              className="mt-1 h-9 rounded-lg border border-border-base bg-surface-white px-2 text-body-sm focus:border-secondary focus:outline-none"
            >
              <option value="all">All</option>
              {TYPES.map((t) => <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>)}
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

        {/* Day groups */}
        {byDay.length === 0 ? (
          <div className="px-5 py-12 text-center text-body-md text-on-surface-variant">
            {inMonth.length === 0 ? (
              "No approved documents in this month yet."
            ) : (
              <>
                No documents match these filters.{" "}
                <button onClick={clearFilters} className="font-semibold text-secondary hover:underline">
                  Clear filters
                </button>
              </>
            )}
          </div>
        ) : (
          byDay.map(([day, docs]) => {
            const open = openSet.has(day);
            return (
              <section key={day} className="border-b border-border-base last:border-b-0">
                <button
                  onClick={() => toggleDay(day)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-surface-container/60"
                >
                  <span className="material-symbols-outlined text-lg text-on-surface-variant">
                    {open ? "expand_more" : "chevron_right"}
                  </span>
                  <span className="font-semibold text-text-primary">{formatDayHeading(day)}</span>
                  <span className="rounded-full bg-secondary-container px-2 py-0.5 text-label-sm font-semibold text-on-secondary-container">
                    {docs.length}
                  </span>
                </button>

                {open && (
                  <div className="overflow-x-auto border-t border-border-base">
                    <table className="w-full min-w-[640px] text-left">
                      <thead>
                        <tr className="text-label-sm uppercase text-on-surface-variant">
                          <th className="px-5 py-2.5">Doc ID</th>
                          <th className="px-5 py-2.5">Document Name</th>
                          <th className="px-5 py-2.5">Type</th>
                          <th className="px-5 py-2.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="text-body-md">
                        {docs.map((d, i) => (
                          <tr
                            key={d.id}
                            className={[
                              "transition-colors hover:bg-surface-container/60",
                              d.id === focusDoc ? "bg-secondary/10" : i % 2 ? "bg-surface-container-low/40" : "",
                            ].join(" ")}
                          >
                            <td className="px-5 py-3 font-semibold text-secondary mono">{docLabel(d)}</td>
                            <td className="max-w-[280px] truncate px-5 py-3 text-text-primary">{d.fileName}</td>
                            <td className="px-5 py-3 text-on-surface-variant">{DOC_TYPE_LABEL[d.docType]}</td>
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
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
