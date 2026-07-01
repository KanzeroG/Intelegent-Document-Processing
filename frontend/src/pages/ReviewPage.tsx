// Review screen (human-in-the-loop): document preview on the left, editable
// extracted fields + line items + validation rules on the right. Data and
// issues come from the real backend extraction stored on the Upload screen.

import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { useDocuments, missingFields } from "../store";
import { patchDocument, mockIngest, exportJsonUrl, type ExtractedDocument } from "../api";
import { formatNumber, DOC_TYPE_LABEL } from "../lib/format";

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

// Friendly category title for a backend validation issue (matches the Stitch
// "Calculation Mismatch" / "Required Field" phrasing).
function ruleTitle(field: string, severity: string): string {
  const base = field.split("[")[0];
  if (base === "total_amount" && severity === "error") return "Calculation Mismatch";
  if (base === "line_items") return severity === "error" ? "Calculation Mismatch" : "Line Items Check";
  if (severity === "error") return `Required Field — ${FIELD_LABEL[base] ?? base}`;
  return `${FIELD_LABEL[base] ?? base} Check`;
}

export default function ReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { docs, getDoc, replaceRecord } = useDocuments();

  // Pick the requested doc, else the first that needs review, else the first.
  const rec =
    (id && getDoc(decodeURIComponent(id))) ||
    docs.find((d) => d.status === "flagged" || d.status === "in_review") ||
    docs[0];

  const [form, setForm] = useState<ExtractedDocument | null>(rec ? rec.data : null);

  // Which fields the validation flagged (for inline highlighting).
  const flagged = useMemo(() => {
    const map: Record<string, "error" | "warning"> = {};
    rec?.issues.forEach((i) => {
      const key = i.field.split("[")[0];
      if (map[key] !== "error") map[key] = i.severity;
    });
    return map;
  }, [rec]);

  if (!rec || !form) {
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

  const set = (k: keyof ExtractedDocument, v: unknown) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const fieldClass = (key: string) =>
    [
      "mt-1.5 h-10 w-full rounded-lg border px-3 text-body-md focus:outline-none",
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

  // Validation Rules panel = backend issues + a "Missing Information" warning per
  // empty expected field (deduped against backend issues on the same field).
  const missingIssues = [...missingSet]
    .filter((f) => !rec.issues.some((i) => i.field.split("[")[0] === f))
    .map((f) => ({
      severity: "warning" as const,
      title: "Missing Information",
      message: `${FIELD_LABEL[f] ?? f} is missing from extraction — manual entry required.`,
    }));
  const shownIssues = [
    ...rec.issues.map((i) => ({ severity: i.severity, title: ruleTitle(i.field, i.severity), message: i.message })),
    ...missingIssues,
  ];

  async function save() {
    try {
      replaceRecord(await patchDocument(rec!.id, { data: form! }));
      toast.success("Corrections saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }
  async function approve() {
    try {
      const updated = await patchDocument(rec!.id, { data: form!, status: "approved" });
      replaceRecord(updated);
      // Hand the approved data to the mock downstream API…
      const ack = await mockIngest(updated);
      // …and download the JSON export for the user.
      const a = document.createElement("a");
      a.href = exportJsonUrl(updated.id);
      a.download = `${updated.doc_number ?? updated.id}.json`;
      a.click();
      toast.success(ack.message || "Approved & exported");
      navigate("/upload");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed");
    }
  }
  async function reject() {
    try {
      replaceRecord(await patchDocument(rec!.id, { status: "rejected" }));
      toast("Document rejected", { icon: "🚫" });
      navigate("/upload");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reject failed");
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center gap-2 text-body-sm text-on-surface-variant">
        <Link to="/review" className="hover:underline">Review Queue</Link>
        <span>›</span>
        <span className="font-semibold text-text-primary">{rec.id}</span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-gutter lg:grid-cols-2">
        {/* Document preview */}
        <div className="overflow-hidden rounded-lg border border-border-base bg-inverse-surface">
          <div className="flex items-center justify-between px-4 py-2 text-body-sm text-inverse-on-surface">
            <span>{rec.fileName}</span>
            <span className="mono">{DOC_TYPE_LABEL[rec.docType]}</span>
          </div>
          {rec.previewUrl &&
            (rec.fileName.toLowerCase().endsWith(".pdf") ? (
              <iframe
                title="preview"
                src={`${rec.previewUrl}#view=FitH&toolbar=0&navpanes=0`}
                className="h-[720px] w-full bg-white"
              />
            ) : (
              <img alt="preview" src={rec.previewUrl} className="max-h-[720px] w-full bg-white object-contain" />
            ))}
        </div>

        {/* Extraction panel */}
        <div className="space-y-gutter">
          <div className="rounded-lg border border-border-base bg-surface-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-headline-md text-text-primary">
                {rec.id}
                <span className="ml-2 rounded bg-secondary/10 px-2 py-0.5 text-label-sm text-secondary">
                  {DOC_TYPE_LABEL[rec.docType].toUpperCase()}
                </span>
              </h2>
              <span className={`flex items-center gap-1 text-body-sm font-semibold ${confCls}`}>
                <span className="material-symbols-outlined text-base">verified</span>
                {rec.confidence}% Confidence
              </span>
            </div>

            <div className="mt-4 text-label-sm uppercase text-on-surface-variant">Extracted Header Fields</div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Field label="Doc Number" k="doc_number" value={form.doc_number ?? ""} onChange={set} cls={fieldClass} missing={missingSet.has("doc_number")} />
              <Field label="Vendor Name" k="vendor" value={form.vendor ?? ""} onChange={set} cls={fieldClass} missing={missingSet.has("vendor")} />
              <Field label="Buyer" k="buyer" value={form.buyer ?? ""} onChange={set} cls={fieldClass} missing={missingSet.has("buyer")} />
              <Field label="Date" k="doc_date" value={form.doc_date ?? ""} onChange={set} cls={fieldClass} missing={missingSet.has("doc_date")} />
              <Field label="Currency" k="currency" value={form.currency ?? ""} onChange={set} cls={fieldClass} missing={missingSet.has("currency")} />
              <NumField label="Subtotal" k="subtotal" value={form.subtotal} onChange={set} cls={fieldClass} missing={missingSet.has("subtotal")} />
              <NumField label="Tax (PPN)" k="tax_amount" value={form.tax_amount} onChange={set} cls={fieldClass} missing={missingSet.has("tax_amount")} />
              <NumField label="Total Amount" k="total_amount" value={form.total_amount} onChange={set} cls={fieldClass} missing={missingSet.has("total_amount")} />
            </div>
          </div>

          {/* Line items */}
          <div className="rounded-lg border border-border-base bg-surface-white p-5 shadow-sm">
            <div className="text-label-sm uppercase text-on-surface-variant">
              Line Items ({form.line_items.length})
            </div>
            <table className="mt-2 w-full text-left text-body-sm">
              <thead>
                <tr className="text-label-sm uppercase text-on-surface-variant">
                  <th className="py-1.5">Description</th>
                  <th className="py-1.5 text-right">Qty</th>
                  <th className="py-1.5 text-right">Unit Price</th>
                  <th className="py-1.5 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="mono">
                {form.line_items.map((li, i) => (
                  <tr key={i} className="border-t border-border-base">
                    <td className="py-1.5 font-sans">{li.description}</td>
                    <td className="py-1.5 text-right">{li.qty ?? "—"}</td>
                    <td className="py-1.5 text-right">{formatNumber(li.unit_price)}</td>
                    <td className="py-1.5 text-right">{formatNumber(li.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Validation rules */}
          <div className="rounded-lg border border-border-base bg-surface-white p-5 shadow-sm">
            <div className="text-label-sm uppercase text-on-surface-variant">Validation Rules</div>
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
          <div className="flex items-center justify-end gap-3">
            <button onClick={reject} className="flex items-center gap-1 rounded-lg border border-status-error px-4 py-2.5 font-semibold text-status-error">
              <span className="material-symbols-outlined text-base">cancel</span> Reject
            </button>
            <button onClick={save} className="rounded-lg border border-border-base px-4 py-2.5 font-semibold text-text-primary">
              Save Corrections
            </button>
            <button onClick={approve} className="rounded-lg bg-primary px-4 py-2.5 font-semibold text-white hover:bg-primary-container">
              Approve &amp; Export
            </button>
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

function Field({ label, k, value, onChange, cls, missing }: {
  label: string; k: keyof ExtractedDocument; value: string;
  onChange: (k: keyof ExtractedDocument, v: unknown) => void; cls: (key: string) => string; missing?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-label-md text-on-surface-variant">{label}{missing && <MissingTag />}</span>
      <input
        value={value}
        placeholder={missing ? "Missing — enter manually" : ""}
        onChange={(e) => onChange(k, e.target.value)}
        className={`${cls(k as string)} ${missing ? "border-status-warning placeholder:text-status-warning/70" : ""}`}
      />
    </label>
  );
}

function NumField({ label, k, value, onChange, cls, missing }: {
  label: string; k: keyof ExtractedDocument; value: number | null;
  onChange: (k: keyof ExtractedDocument, v: unknown) => void; cls: (key: string) => string; missing?: boolean;
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
