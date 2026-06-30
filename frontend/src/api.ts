// Thin client for the FastAPI backend. The frontend is presentation only —
// it never talks to the model directly, only to this backend over HTTP.

// Base URL is env-driven so the SPA isn't hard-wired to localhost (e.g. when
// hosted on Vercel pointing at a tunneled backend). Falls back to local dev.
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export type DocType = "invoice" | "purchase_order" | "receipt";
export type Role = "user" | "staff" | "admin";

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

export interface ExtractResponse {
  doc_type: DocType;
  data: ExtractedDocument;
  issues: ValidationIssue[];
}

// POST a document to /extract. Throws Error with the backend's detail message
// on failure so the UI can show why (e.g. LM Studio not running).
export async function extractDocument(
  file: File,
  docType: DocType,
  role: Role,
): Promise<ExtractResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("doc_type", docType);

  const res = await fetch(`${API_BASE_URL}/extract`, {
    method: "POST",
    headers: { "X-Role": role }, // stubbed auth
    body: form,
  });

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* non-JSON error body — keep the generic message */
    }
    throw new Error(detail);
  }

  return res.json();
}
