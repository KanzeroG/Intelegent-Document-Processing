// Thin client for the FastAPI backend. The frontend is presentation only —
// it never talks to the model directly, only to this backend over HTTP.

// Base URL is env-driven so the SPA isn't hard-wired to localhost.
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export type DocType = "invoice" | "purchase_order" | "receipt";
export type Role = "user" | "staff" | "admin";
export type DocStatus = "extracted" | "in_review" | "approved" | "flagged" | "rejected";

export interface LineItem {
  description: string;
  qty: number | null;
  unit_price: number | null;
  line_total: number | null;
}

// Mirrors the backend Document schema (field names match ground_truth.csv).
export interface ExtractedDocument {
  doc_type: DocType;
  doc_number: string | null;
  vendor: string | null;
  buyer: string | null;
  doc_date: string | null;
  currency: string;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  line_items: LineItem[];
  line_item_count?: number;
}

export interface ValidationIssue {
  field: string;
  severity: "error" | "warning";
  message: string;
}

// A persisted document record returned by the backend (SQLite-backed).
export interface DocumentRecord {
  id: string;
  doc_number: string | null;
  doc_type: DocType;
  filename: string | null;
  mime: string | null;
  uploaded_at: string;
  status: DocStatus;
  confidence: number;
  data: ExtractedDocument;
  issues: ValidationIssue[];
}

// URL to the stored original file (for preview) — served by the backend.
export function fileUrl(id: string): string {
  return `${API_BASE_URL}/documents/${encodeURIComponent(id)}/file`;
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* keep generic message */
    }
    throw new Error(detail);
  }
  return res.json();
}

// POST a document to /extract — extracts, validates, persists, returns the record.
export async function extractDocument(
  file: File,
  docType: DocType,
  role: Role,
): Promise<DocumentRecord> {
  const form = new FormData();
  form.append("file", file);
  form.append("doc_type", docType);
  const res = await fetch(`${API_BASE_URL}/extract`, {
    method: "POST",
    headers: { "X-Role": role },
    body: form,
  });
  return unwrap<DocumentRecord>(res);
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  return unwrap<DocumentRecord[]>(await fetch(`${API_BASE_URL}/documents`));
}

export async function getDocument(id: string): Promise<DocumentRecord> {
  return unwrap<DocumentRecord>(await fetch(`${API_BASE_URL}/documents/${encodeURIComponent(id)}`));
}

// Save corrected data and/or a new status; backend re-validates edited data.
export async function patchDocument(
  id: string,
  patch: { data?: ExtractedDocument; status?: DocStatus },
): Promise<DocumentRecord> {
  const res = await fetch(`${API_BASE_URL}/documents/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return unwrap<DocumentRecord>(res);
}
