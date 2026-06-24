// Upload page: the whole vertical slice from the user's side.
// Pick a document + type, send it to the backend, and show the extracted
// fields (and any validation flags) right next to a preview of the document.

import { useEffect, useMemo, useState } from "react";
import {
  extractDocument,
  type DocType,
  type ExtractResponse,
  type Role,
} from "../api";

const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: "invoice", label: "Invoice" },
  { value: "purchase_order", label: "Purchase Order" },
  { value: "receipt", label: "Receipt" },
];

function formatAmount(value: number | null): string {
  if (value === null || value === undefined) return "—";
  // Indonesian-style grouping for display (dots as thousands separators).
  return value.toLocaleString("id-ID");
}

export default function UploadPage({ role }: { role: Role }) {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<DocType>("invoice");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Build (and clean up) an object URL so we can preview the chosen document.
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const isPdf = file?.type === "application/pdf" || file?.name.toLowerCase().endsWith(".pdf");

  async function handleExtract() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await extractDocument(file, docType, role));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed.");
    } finally {
      setLoading(false);
    }
  }

  const doc = result?.data;

  return (
    <div className="upload-page">
      <div className="controls">
        <input
          type="file"
          accept="application/pdf,image/*"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            setError(null);
          }}
        />
        <select value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>
          {DOC_TYPES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <button onClick={handleExtract} disabled={!file || loading}>
          {loading ? "Extracting…" : "Extract"}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="split">
        {/* Left: the source document */}
        <section className="panel">
          <h2>Document</h2>
          {!previewUrl && <p className="muted">No document selected.</p>}
          {previewUrl && isPdf && (
            <iframe title="document preview" src={previewUrl} className="preview" />
          )}
          {previewUrl && !isPdf && (
            <img alt="document preview" src={previewUrl} className="preview" />
          )}
        </section>

        {/* Right: the extracted, structured fields */}
        <section className="panel">
          <h2>Extracted fields</h2>
          {!doc && <p className="muted">Run an extraction to see results.</p>}
          {doc && (
            <>
              {result!.issues.length > 0 && (
                <ul className="issues">
                  {result!.issues.map((iss, i) => (
                    <li key={i} className={`issue ${iss.severity}`}>
                      <strong>{iss.severity}</strong> [{iss.field}] {iss.message}
                    </li>
                  ))}
                </ul>
              )}
              <table className="fields">
                <tbody>
                  <tr><td>Vendor</td><td>{doc.vendor ?? "—"}</td></tr>
                  <tr><td>Invoice date</td><td>{doc.invoice_date ?? "—"}</td></tr>
                  <tr><td>Due date</td><td>{doc.due_date ?? "—"}</td></tr>
                  <tr><td>Currency</td><td>{doc.currency}</td></tr>
                  <tr><td>Tax</td><td>{formatAmount(doc.tax_amount)}</td></tr>
                  <tr><td>Total</td><td><strong>{formatAmount(doc.total_amount)}</strong></td></tr>
                </tbody>
              </table>

              <h3>Line items</h3>
              {doc.line_items.length === 0 && <p className="muted">None extracted.</p>}
              {doc.line_items.length > 0 && (
                <table className="fields">
                  <thead>
                    <tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr>
                  </thead>
                  <tbody>
                    {doc.line_items.map((li, i) => (
                      <tr key={i}>
                        <td>{li.description}</td>
                        <td>{li.quantity ?? "—"}</td>
                        <td>{formatAmount(li.unit_price)}</td>
                        <td>{formatAmount(li.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
