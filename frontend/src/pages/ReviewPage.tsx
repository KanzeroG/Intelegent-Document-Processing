// Review screen (human-in-the-loop): document preview on the left, editable
// extracted fields + line items + validation rules on the right. Header fields
// AND line items are correctable; validation hints re-run live as you type,
// mirroring the backend rules that run again on save. Staff/admin can save,
// approve, and reject; the `user` role gets a read-only view of their result.

import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth, useDocuments, missingFields, type DocRecord } from "../store";
import {
  patchDocument,
  mockIngest,
  exportJsonUrl,
  exportCsvUrl,
  downloadFile,
  type ExtractedDocument,
  type LineItem,
} from "../api";
import { formatNumber, formatDateTime, DOC_TYPE_LABEL, docLabel } from "../lib/format";
import { validateLive } from "../lib/liveValidation";

const FIELD_LABEL: Record<string, string> = {
  doc_number: "Document Number",
  vendor: "Vendor Name",
  buyer: "Buyer",
  doc_date: "Date",
  currency: "Currency",
  subtotal: "Subtotal",
  tax_amount: "Tax (PPN)",
  total_amount: "Total Amount",
  line_items: "Line Items",
};

// Friendly category title for a validation issue (matches the Stitch
// "Calculation Mismatch" / "Required Field" phrasing).
function ruleTitle(field: string, severity: string): string {
  const base = field.split("[")[0];
  if (base === "total_amount" && severity === "error") return "Calculation Mismatch";
  if (base === "line_items") return severity === "error" ? "Calculation Mismatch" : "Line Items Check";
  if (severity === "error") return `Required Field — ${FIELD_LABEL[base] ?? base}`;
  return `${FIELD_LABEL[base] ?? base} Check`;
}

const newRowKey = () => Math.random().toString(36).slice(2, 10);

// Empty strings become null before saving so the backend treats a cleared
// field as missing (same as extraction would) instead of format-warning on "".
// Rows the reviewer added but left fully empty are dropped.
function normalizedForm(f: ExtractedDocument): ExtractedDocument {
  const clean = (s: string | null) => (s !== null && s.trim() === "" ? null : s);
  return {
    ...f,
    doc_number: clean(f.doc_number),
    vendor: clean(f.vendor),
    buyer: clean(f.buyer),
    doc_date: clean(f.doc_date),
    line_items: f.line_items.filter(
      (li) =>
        li.description.trim() !== "" ||
        li.qty !== null ||
        li.unit_price !== null ||
        li.line_total !== null,
    ),
  };
}

export default function ReviewPage() {
  const { id } = useParams();
  const { role } = useAuth();
  const { docs, loading, getDoc } = useDocuments();

  const requestedId = id ? decodeURIComponent(id) : null;
  const requested = requestedId ? getDoc(requestedId) : undefined;
  // Without an explicit id: first doc needing review, else the first doc. An
  // explicit id that isn't visible must NOT silently fall back to another doc.
  const rec =
    requested ??
    (requestedId
      ? undefined
      : (docs.find((d) => d.status === "flagged" || d.status === "in_review") ?? docs[0]));

  const canEdit = role === "staff" || role === "admin";

  if (!rec) {
    if (loading) {
      return (
        <div className="mx-auto max-w-3xl rounded-lg border border-border-base bg-surface-white p-12 text-center">
          <div
            className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-secondary border-t-transparent"
            aria-hidden="true"
          />
          <p className="mt-3 text-body-md text-on-surface-variant">Loading documents…</p>
        </div>
      );
    }
    if (requestedId) {
      return (
        <div className="mx-auto max-w-3xl rounded-lg border border-border-base bg-surface-white p-12 text-center">
          <span className="material-symbols-outlined text-5xl text-outline-variant">search_off</span>
          <h2 className="mt-3 text-headline-md text-text-primary">Document not found</h2>
          <p className="mt-1 text-body-md text-on-surface-variant">
            It may have been uploaded by someone else, or the link is stale.
          </p>
          <Link to="/upload" className="mt-4 inline-block font-semibold text-secondary hover:underline">
            Back to My Documents →
          </Link>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-border-base bg-surface-white p-12 text-center">
        <span className="material-symbols-outlined text-5xl text-outline-variant">fact_check</span>
        <h2 className="mt-3 text-headline-md text-text-primary">Nothing to review yet</h2>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Upload and extract a document first.
        </p>
        <Link to="/upload" className="mt-4 inline-block font-semibold text-secondary hover:underline">
          Go to Upload →
        </Link>
      </div>
    );
  }

  // Keying the editor by document id remounts it (fresh form state) whenever
  // the reviewed document changes — no stale-form bugs when navigating between
  // records. Store updates to the SAME id (e.g. after Save) keep local edits.
  return <ReviewEditor key={rec.id} rec={rec} canEdit={canEdit} />;
}

function ReviewEditor({ rec, canEdit }: { rec: DocRecord; canEdit: boolean }) {
  const navigate = useNavigate();
  const { replaceRecord } = useDocuments();

  const [form, setForm] = useState<ExtractedDocument>(rec.data);
  const [rowKeys, setRowKeys] = useState<string[]>(() => rec.data.line_items.map(newRowKey));
  const [busy, setBusy] = useState(false);

  // Live validation: the same rules the backend re-runs on save, so hints
  // appear/clear as the reviewer types.
  const liveIssues = useMemo(() => validateLive(form), [form]);

  // Header fields the validation flagged (for inline highlighting).
  const flagged = useMemo(() => {
    const map: Record<string, "error" | "warning"> = {};
    for (const iss of liveIssues) {
      const key = iss.field.split("[")[0];
      if (map[key] !== "error") map[key] = iss.severity;
    }
    return map;
  }, [liveIssues]);

  // Per-row line-item flags, e.g. qty × unit_price ≠ line_total.
  const lineFlags = useMemo(() => {
    const map: Record<number, "error" | "warning"> = {};
    for (const iss of liveIssues) {
      const m = /^line_items\[(\d+)\]/.exec(iss.field);
      if (m) map[Number(m[1])] = iss.severity;
    }
    return map;
  }, [liveIssues]);

  const set = (k: keyof ExtractedDocument, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const updateItem = (i: number, patch: Partial<LineItem>) =>
    setForm((f) => ({
      ...f,
      line_items: f.line_items.map((li, idx) => (idx === i ? { ...li, ...patch } : li)),
    }));

  const addItem = () => {
    setForm((f) => ({
      ...f,
      line_items: [...f.line_items, { description: "", qty: null, unit_price: null, line_total: null }],
    }));
    setRowKeys((k) => [...k, newRowKey()]);
  };

  const removeItem = (i: number) => {
    setForm((f) => ({ ...f, line_items: f.line_items.filter((_, idx) => idx !== i) }));
    setRowKeys((k) => k.filter((_, idx) => idx !== i));
  };

  const fieldClass = (key: string) =>
    [
      "mt-1.5 h-10 w-full rounded-lg border px-3 text-body-md focus:outline-none disabled:bg-surface-container-low disabled:text-on-surface-variant",
      flagged[key] === "error"
        ? "border-status-error"
        : flagged[key] === "warning"
          ? "border-status-warning"
          : "border-border-base focus:border-secondary",
    ].join(" ");

  // Expected fields (for this doc type) that are currently empty.
  const missingSet = new Set<string>(missingFields(form, rec.docType) as string[]);
  const confCls =
    rec.confidence >= 90 ? "text-status-success" : rec.confidence >= 75 ? "text-status-warning" : "text-status-error";

  // Validation Rules panel = live rule issues + a "Missing Information" warning
  // per empty expected field (deduped against rule issues on the same field).
  const liveFieldSet = new Set(liveIssues.map((i) => i.field.split("[")[0]));
  const missingIssues = [...missingSet]
    .filter((f) => !liveFieldSet.has(f))
    .map((f) => ({
      severity: "warning" as const,
      title: "Missing Information",
      message: `${FIELD_LABEL[f] ?? f} is missing from extraction — manual entry required.`,
    }));
  const shownIssues = [
    ...liveIssues.map((i) => ({ severity: i.severity, title: ruleTitle(i.field, i.severity), message: i.message })),
    ...missingIssues,
  ];

  // Live footer hint: do the line totals add up to the subtotal?
  const lineSum = form.line_items.reduce((a, li) => a + (li.line_total ?? 0), 0);
  const sumOk = form.subtotal === null || Math.abs(lineSum - form.subtotal) <= 1;

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      replaceRecord(await patchDocument(rec.id, { data: normalizedForm(form) }));
      toast.success("Corrections saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await patchDocument(rec.id, { data: normalizedForm(form), status: "approved" });
      replaceRecord(updated);
      // Hand the approved data to the mock downstream API…
      const ack = await mockIngest(updated);
      // …and download the JSON export for the user (authenticated, so the
      // export lands in the audit trail under the reviewer's name).
      await downloadFile(exportJsonUrl(updated.id), `${docLabel(updated)}.json`);
      toast.success(ack.message || "Approved & exported");
      navigate("/upload");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  }

  // Authenticated per-doc export (shows up in the audit trail as this user).
  async function exportDoc(kind: "json" | "csv") {
    try {
      await downloadFile(
        kind === "json" ? exportJsonUrl(rec.id) : exportCsvUrl(rec.id),
        `${docLabel(rec)}.${kind}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  }

  async function reject() {
    if (busy) return;
    setBusy(true);
    try {
      replaceRecord(await patchDocument(rec.id, { status: "rejected" }));
      toast("Document rejected", { icon: "🚫" });
      navigate("/upload");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center gap-2 text-body-sm text-on-surface-variant">
        {canEdit ? (
          <Link to="/review" className="hover:underline">Review Queue</Link>
        ) : (
          <Link to="/upload" className="hover:underline">My Documents</Link>
        )}
        <span>›</span>
        <span className="font-semibold text-text-primary">{docLabel(rec)}</span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-gutter lg:grid-cols-2">
        {/* Document preview */}
        <div className="overflow-hidden rounded-lg border border-border-base bg-inverse-surface">
          <div className="flex items-center justify-between px-4 py-2 text-body-sm text-inverse-on-surface">
            <span className="truncate">{rec.fileName}</span>
            <span className="mono shrink-0">{DOC_TYPE_LABEL[rec.docType]}</span>
          </div>
          {rec.previewUrl &&
            (rec.fileName.toLowerCase().endsWith(".pdf") ? (
              <iframe
                title="preview"
                src={`${rec.previewUrl}#view=FitH&toolbar=0&navpanes=0`}
                className="h-[480px] w-full bg-white lg:h-[720px]"
              />
            ) : (
              <img alt="preview" src={rec.previewUrl} className="max-h-[720px] w-full bg-white object-contain" />
            ))}
        </div>

        {/* Extraction panel */}
        <div className="space-y-gutter">
          <div className="rounded-lg border border-border-base bg-surface-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="min-w-0 text-headline-md text-text-primary">
                {docLabel(rec)}
                <span className="ml-2 rounded bg-secondary/10 px-2 py-0.5 text-label-sm text-secondary">
                  {DOC_TYPE_LABEL[rec.docType].toUpperCase()}
                </span>
              </h2>
              <span className={`flex items-center gap-1 text-body-sm font-semibold ${confCls}`}>
                <span className="material-symbols-outlined text-base">verified</span>
                {rec.confidence}% Confidence
              </span>
            </div>

            <p className="mt-1 text-body-sm text-on-surface-variant">
              Uploaded {formatDateTime(rec.uploadedAt)} by {rec.uploadedBy ?? "—"}
            </p>

            {!canEdit && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-surface-container-low px-3 py-2.5 text-body-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-base">visibility</span>
                Read-only view — a staff member reviews and approves this document.
              </div>
            )}

            <div className="mt-4 text-label-sm uppercase text-on-surface-variant">Extracted Header Fields</div>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Doc Number" k="doc_number" value={form.doc_number ?? ""} onChange={set} cls={fieldClass} missing={missingSet.has("doc_number")} disabled={!canEdit} />
              <Field label="Vendor Name" k="vendor" value={form.vendor ?? ""} onChange={set} cls={fieldClass} missing={missingSet.has("vendor")} disabled={!canEdit} />
              <Field label="Buyer" k="buyer" value={form.buyer ?? ""} onChange={set} cls={fieldClass} missing={missingSet.has("buyer")} disabled={!canEdit} />
              <Field label="Date" k="doc_date" value={form.doc_date ?? ""} onChange={set} cls={fieldClass} missing={missingSet.has("doc_date")} disabled={!canEdit} />
              <Field label="Currency" k="currency" value={form.currency ?? ""} onChange={set} cls={fieldClass} missing={missingSet.has("currency")} disabled={!canEdit} />
              <NumField label="Subtotal" k="subtotal" value={form.subtotal} onChange={set} cls={fieldClass} missing={missingSet.has("subtotal")} disabled={!canEdit} />
              <NumField label="Tax (PPN)" k="tax_amount" value={form.tax_amount} onChange={set} cls={fieldClass} missing={missingSet.has("tax_amount")} disabled={!canEdit} />
              <NumField label="Total Amount" k="total_amount" value={form.total_amount} onChange={set} cls={fieldClass} missing={missingSet.has("total_amount")} disabled={!canEdit} />
            </div>
          </div>

          {/* Line items — editable (the core of the human-in-the-loop step) */}
          <div className="rounded-lg border border-border-base bg-surface-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-label-sm uppercase text-on-surface-variant">
                Line Items ({form.line_items.length})
              </div>
              {canEdit && (
                <button
                  onClick={addItem}
                  className="flex items-center gap-1 text-body-sm font-semibold text-secondary hover:underline"
                >
                  <span className="material-symbols-outlined text-base">add</span>
                  Add line item
                </button>
              )}
            </div>

            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-body-sm">
                <thead>
                  <tr className="text-label-sm uppercase text-on-surface-variant">
                    <th className="py-1.5 pr-2">Description</th>
                    <th className="w-20 py-1.5 pr-2 text-right">Qty</th>
                    <th className="w-32 py-1.5 pr-2 text-right">Unit Price</th>
                    <th className="w-32 py-1.5 text-right">Line Total</th>
                    {canEdit && <th className="w-10 py-1.5" aria-label="Row actions" />}
                  </tr>
                </thead>
                <tbody>
                  {form.line_items.map((li, i) => (
                    <tr key={rowKeys[i] ?? i} className="border-t border-border-base">
                      <td className="py-1.5 pr-2">
                        <input
                          value={li.description}
                          disabled={!canEdit}
                          aria-label={`Line ${i + 1} description`}
                          onChange={(e) => updateItem(i, { description: e.target.value })}
                          className="h-9 w-full rounded-lg border border-border-base px-2 text-body-sm focus:border-secondary focus:outline-none disabled:border-transparent disabled:bg-transparent"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <QtyCell
                          value={li.qty}
                          disabled={!canEdit}
                          label={`Line ${i + 1} quantity`}
                          onChange={(v) => updateItem(i, { qty: v })}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <NumCell
                          value={li.unit_price}
                          disabled={!canEdit}
                          label={`Line ${i + 1} unit price`}
                          onChange={(v) => updateItem(i, { unit_price: v })}
                        />
                      </td>
                      <td className="py-1.5">
                        <NumCell
                          value={li.line_total}
                          disabled={!canEdit}
                          label={`Line ${i + 1} line total`}
                          flag={lineFlags[i]}
                          onChange={(v) => updateItem(i, { line_total: v })}
                        />
                      </td>
                      {canEdit && (
                        <td className="py-1.5 text-center">
                          <button
                            onClick={() => removeItem(i)}
                            aria-label={`Remove line item ${i + 1}`}
                            className="grid h-8 w-8 place-items-center rounded text-on-surface-variant hover:bg-status-error/10 hover:text-status-error"
                          >
                            <span className="material-symbols-outlined text-base">delete</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {form.line_items.length === 0 && (
                    <tr className="border-t border-border-base">
                      <td colSpan={canEdit ? 5 : 4} className="py-4 text-center text-on-surface-variant">
                        No line items{canEdit ? " — add one if the document has an itemized table." : "."}
                      </td>
                    </tr>
                  )}
                </tbody>
                {form.line_items.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-border-base">
                      <td colSpan={3} className="py-2 pr-2 text-right font-semibold text-on-surface-variant">
                        Line items total
                      </td>
                      <td className={`mono py-2 text-right font-semibold ${sumOk ? "text-status-success" : "text-status-warning"}`}>
                        {formatNumber(lineSum)}
                      </td>
                      {canEdit && <td />}
                    </tr>
                    {!sumOk && form.subtotal !== null && (
                      <tr>
                        <td colSpan={canEdit ? 5 : 4} className="pb-1 text-right text-status-warning">
                          Doesn't match subtotal {formatNumber(form.subtotal)} — difference{" "}
                          {formatNumber(Math.abs(lineSum - form.subtotal))}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Validation rules (live) */}
          <div className="rounded-lg border border-border-base bg-surface-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-label-sm uppercase text-on-surface-variant">Validation Rules</div>
              <span className="text-body-sm text-on-surface-variant">re-checked as you edit</span>
            </div>
            <div className="mt-3 space-y-2">
              {shownIssues.length === 0 && (
                <Rule severity="success" title="All Checks Passed" detail="No validation issues found." />
              )}
              {shownIssues.map((iss, i) => (
                <Rule key={i} severity={iss.severity} title={iss.title} detail={iss.message} />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <>
                  <button
                    onClick={() => void exportDoc("json")}
                    className="flex items-center gap-1 rounded-lg border border-border-base px-3 py-2.5 text-body-sm font-semibold text-text-primary"
                  >
                    <span className="material-symbols-outlined text-base">download</span> JSON
                  </button>
                  <button
                    onClick={() => void exportDoc("csv")}
                    className="flex items-center gap-1 rounded-lg border border-border-base px-3 py-2.5 text-body-sm font-semibold text-text-primary"
                  >
                    <span className="material-symbols-outlined text-base">download</span> CSV
                  </button>
                </>
              )}
              <button
                onClick={() => navigate(`/chat?doc=${encodeURIComponent(rec.id)}`)}
                className="flex items-center gap-1 rounded-lg border border-border-base px-3 py-2.5 text-body-sm font-semibold text-text-primary"
              >
                <span className="material-symbols-outlined text-base">forum</span> Ask about this document
              </button>
            </div>
            {canEdit && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={reject}
                  disabled={busy}
                  className="flex items-center gap-1 rounded-lg border border-status-error px-4 py-2.5 font-semibold text-status-error disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-base">cancel</span> Reject
                </button>
                <button
                  onClick={save}
                  disabled={busy}
                  className="rounded-lg border border-border-base px-4 py-2.5 font-semibold text-text-primary disabled:opacity-50"
                >
                  Save Corrections
                </button>
                <button
                  onClick={approve}
                  disabled={busy}
                  className="rounded-lg bg-primary px-4 py-2.5 font-semibold text-white hover:bg-primary-container disabled:opacity-50"
                >
                  {busy ? "Working…" : "Approve & Export"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MissingTag() {
  return (
    <span className="ml-2 inline-flex items-center gap-0.5 rounded bg-status-warning/10 px-1.5 py-0.5 text-label-sm text-status-warning">
      <span className="material-symbols-outlined text-[13px]">warning</span> Missing
    </span>
  );
}

function Field({ label, k, value, onChange, cls, missing, disabled }: {
  label: string; k: keyof ExtractedDocument; value: string;
  onChange: (k: keyof ExtractedDocument, v: unknown) => void; cls: (key: string) => string;
  missing?: boolean; disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-label-md text-on-surface-variant">{label}{missing && <MissingTag />}</span>
      <input
        value={value}
        disabled={disabled}
        placeholder={missing ? "Missing — enter manually" : ""}
        onChange={(e) => onChange(k, e.target.value)}
        className={`${cls(k as string)} ${missing ? "border-status-warning placeholder:text-status-warning/70" : ""}`}
      />
    </label>
  );
}

function NumField({ label, k, value, onChange, cls, missing, disabled }: {
  label: string; k: keyof ExtractedDocument; value: number | null;
  onChange: (k: keyof ExtractedDocument, v: unknown) => void; cls: (key: string) => string;
  missing?: boolean; disabled?: boolean;
}) {
  // Text input (not type=number) so we can show Rupiah grouping: 1.812.630.
  // On edit we strip the separators and parse the digits back to an integer.
  const display = value === null || value === undefined ? "" : value.toLocaleString("id-ID");
  return (
    <label className="block">
      <span className="text-label-md text-on-surface-variant">{label}{missing && <MissingTag />}</span>
      <input
        type="text"
        inputMode="numeric"
        value={display}
        disabled={disabled}
        placeholder={missing ? "Missing" : ""}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          onChange(k, digits === "" ? null : Number(digits));
        }}
        className={`${cls(k as string)} mono ${missing ? "border-status-warning" : ""}`}
      />
    </label>
  );
}

// Whole-Rupiah table cell with id-ID digit grouping (same approach as NumField).
function NumCell({ value, onChange, disabled, label, flag }: {
  value: number | null; onChange: (v: number | null) => void;
  disabled?: boolean; label: string; flag?: "error" | "warning";
}) {
  const display = value === null ? "" : value.toLocaleString("id-ID");
  const border =
    flag === "error" ? "border-status-error" : flag === "warning" ? "border-status-warning" : "border-border-base focus:border-secondary";
  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "");
        onChange(digits === "" ? null : Number(digits));
      }}
      className={`mono h-9 w-full rounded-lg border px-2 text-right text-body-sm focus:outline-none disabled:border-transparent disabled:bg-transparent ${border}`}
    />
  );
}

// Quantity cell: decimals allowed (backend qty is float). Local text state so
// intermediate values like "2." survive typing; row keys keep it per-row.
function QtyCell({ value, onChange, disabled, label }: {
  value: number | null; onChange: (v: number | null) => void; disabled?: boolean; label: string;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => {
        const cleaned = e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".");
        setText(cleaned);
        const n = parseFloat(cleaned);
        onChange(Number.isFinite(n) ? n : null);
      }}
      className="mono h-9 w-full rounded-lg border border-border-base px-2 text-right text-body-sm focus:border-secondary focus:outline-none disabled:border-transparent disabled:bg-transparent"
    />
  );
}

function Rule({ severity, title, detail }: { severity: "error" | "warning" | "success"; title: string; detail: string }) {
  const cfg = {
    error: { icon: "error", cls: "bg-status-error/5 text-status-error", border: "border-status-error/30" },
    warning: { icon: "warning", cls: "bg-status-warning/5 text-status-warning", border: "border-status-warning/30" },
    success: { icon: "check_circle", cls: "bg-status-success/5 text-status-success", border: "border-status-success/30" },
  }[severity];
  return (
    <div className={`flex gap-2 rounded-lg border ${cfg.border} ${cfg.cls} p-3`}>
      <span className="material-symbols-outlined text-base">{cfg.icon}</span>
      <div>
        <div className="text-body-sm font-semibold capitalize">{title}</div>
        <div className="text-body-sm opacity-90">{detail}</div>
      </div>
    </div>
  );
}
