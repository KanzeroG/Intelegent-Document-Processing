// Thin client for the FastAPI backend. The frontend is presentation only —
// it never talks to the model directly, only to this backend over HTTP.

import { clearAuth, emitUnauthorized, loadAuth } from "./lib/auth";

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
  uploaded_by: string | null;
  processing_time?: number | null;
}

// URL to the stored original file (for preview) — served by the backend.
export function fileUrl(id: string): string {
  return `${API_BASE_URL}/documents/${encodeURIComponent(id)}/file`;
}

// Session headers for every request: the Bearer token is what the backend
// trusts; X-Role is kept for back-compat with the pre-auth stub.
function authHeaders(): Record<string, string> {
  const auth = loadAuth();
  if (!auth) return {};
  return { Authorization: `Bearer ${auth.token}`, "X-Role": auth.role };
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // A 401 while holding a session means the token is invalid/expired —
    // drop it and let the store bounce to /login. (Failed /auth/login calls
    // happen without a stored session, so they don't trip this.)
    if (res.status === 401 && loadAuth()) {
      clearAuth();
      emitUnauthorized();
    }
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

// ---- Auth -------------------------------------------------------------------

export interface LoginResponse {
  token: string;
  role: Role;
  name: string;
  email: string;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return unwrap(await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }));
}

// Validates a persisted session against the backend (e.g. after a refresh).
export async function getMe(): Promise<{ email: string; role: Role; name: string }> {
  return unwrap(await fetch(`${API_BASE_URL}/auth/me`, { headers: authHeaders() }));
}

// ---- Documents ----------------------------------------------------------------

// POST a document to /extract — extracts, validates, persists, returns the record.
export async function extractDocument(file: File, docType: DocType): Promise<DocumentRecord> {
  const form = new FormData();
  form.append("file", file);
  form.append("doc_type", docType);
  const res = await fetch(`${API_BASE_URL}/extract`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  return unwrap<DocumentRecord>(res);
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  return unwrap<DocumentRecord[]>(
    await fetch(`${API_BASE_URL}/documents`, { headers: authHeaders() }),
  );
}

export async function getDocument(id: string): Promise<DocumentRecord> {
  return unwrap<DocumentRecord>(
    await fetch(`${API_BASE_URL}/documents/${encodeURIComponent(id)}`, { headers: authHeaders() }),
  );
}

// ---- Accuracy evaluation (admin) -------------------------------------------

export interface EvalSummary {
  ran_at: string;
  n: number;
  fields: Record<string, { correct: number; total: number; accuracy: number | null }>;
  by_type: Record<string, { correct: number; total: number; docs: number; accuracy: number }>;
  overall: number;
  docs_fully_correct: number;
}

export interface EvalStatus {
  running: boolean;
  done: number;
  total: number;
  error: string | null;
  summary: EvalSummary | null;
}

export async function runEval(limit?: number): Promise<{ started: boolean }> {
  const q = limit ? `?limit=${limit}` : "";
  return unwrap(await fetch(`${API_BASE_URL}/eval/run${q}`, {
    method: "POST",
    headers: authHeaders(),
  }));
}

export async function getEvalStatus(): Promise<EvalStatus> {
  return unwrap(await fetch(`${API_BASE_URL}/eval/status`, { headers: authHeaders() }));
}

// Downloadable export URLs (attachment) served by the backend.
export function exportJsonUrl(id: string): string {
  return `${API_BASE_URL}/documents/${encodeURIComponent(id)}/export.json`;
}
export function exportCsvUrl(id: string): string {
  return `${API_BASE_URL}/documents/${encodeURIComponent(id)}/export.csv`;
}
// Bulk CSV of all documents with a given status (default approved).
export function exportAllUrl(status: "approved" | "all" = "approved"): string {
  return `${API_BASE_URL}/exports/documents.csv?status=${status}`;
}

// Export a hand-picked set of documents (row selection in My Documents) to
// CSV. POST so the id list isn't URL-length-bound; saved via the shared
// blob-download path so it's attributed in the audit trail like other exports.
export async function downloadSelectedCsv(ids: string[], filename: string): Promise<void> {
  return downloadFile(`${API_BASE_URL}/exports/selected.csv`, filename, {
    method: "POST",
    body: JSON.stringify({ ids }),
    headers: { "Content-Type": "application/json" },
  });
}

// Authenticated download: plain <a href> can't carry the session token, so
// exports would show as "anonymous" in the audit trail. This fetches with the
// token, then hands the bytes to the browser as a normal file download.
export async function downloadFile(
  url: string,
  filename: string,
  init?: { method?: string; body?: string; headers?: Record<string, string> },
): Promise<void> {
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
    body: init?.body,
  });
  if (!res.ok) {
    if (res.status === 401 && loadAuth()) {
      clearAuth();
      emitUnauthorized();
    }
    let detail = `Download failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* keep generic message */
    }
    throw new Error(detail);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

// Hand an approved document to the mock downstream API (stands in for an ERP).
export async function mockIngest(rec: DocumentRecord): Promise<{ received: boolean; message: string }> {
  const payload = { ...rec.data, doc_id: rec.id };
  return unwrap(await fetch(`${API_BASE_URL}/mock-api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  }));
}

// Save corrected data and/or a new status; backend re-validates edited data.
export async function patchDocument(
  id: string,
  patch: { data?: ExtractedDocument; status?: DocStatus },
): Promise<DocumentRecord> {
  const res = await fetch(`${API_BASE_URL}/documents/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(patch),
  });
  return unwrap<DocumentRecord>(res);
}

// ---- Audit trail (admin) -----------------------------------------------------

export interface AuditEntry {
  id: number;
  ts: string;
  actor: string | null;
  role: Role | null;
  action: "login" | "login_failed" | "upload" | "update" | "approve" | "reject" | "status_change" | "eval_run" | "export";
  doc_id: string | null;
  detail: string;
}

export async function listAudit(limit = 200): Promise<AuditEntry[]> {
  return unwrap(await fetch(`${API_BASE_URL}/audit?limit=${limit}`, { headers: authHeaders() }));
}

// ---- RAG assistant (bonus) ---------------------------------------------------

export interface ChatCitation {
  doc_id: string;
  doc_number: string | null;
}

export interface ChatResponse {
  answer: string;
  citations: ChatCitation[];
}

// Ask a question about the extracted documents; scope to one doc via docId.
export async function chat(question: string, docId?: string): Promise<ChatResponse> {
  return unwrap(await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ question, doc_id: docId ?? null }),
  }));
}
