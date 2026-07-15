// App-wide state: the auth session (backed by /auth/login + localStorage) and
// an API-backed store of extracted documents. Documents are persisted
// server-side (SQLite); this store loads them whenever the session changes and
// keeps a local copy in sync as records are added or edited, so a page refresh
// no longer loses work or re-runs the model.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  listDocuments,
  fileUrl,
  type DocumentRecord,
  type ExtractedDocument,
  type Role,
  type DocStatus,
  type DocType,
} from "./api";
import {
  clearAuth,
  loadAuth,
  saveAuth,
  UNAUTHORIZED_EVENT,
  type StoredAuth,
} from "./lib/auth";

export type { DocStatus } from "./api";
export type { StoredAuth } from "./lib/auth";

// ---- Auth ---------------------------------------------------------------------

interface AuthState {
  user: StoredAuth | null;
  role: Role | null;
  signIn: (user: StoredAuth) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// ---- Document store (API-backed) -------------------------------------------

// Client-side view of a persisted document. Field names match what the pages
// already use; `previewUrl` points at the backend's stored-file endpoint.
export interface DocRecord {
  id: string;
  doc_number: string | null;
  fileName: string;
  docType: DocType;
  uploadedAt: string;
  uploadedBy: string | null;
  status: DocStatus;
  data: ExtractedDocument;
  issues: DocumentRecord["issues"];
  previewUrl: string;
  confidence: number;
  processingTime: number | null;
  model: string | null; // which vision model extracted this
}

export function toRecord(r: DocumentRecord): DocRecord {
  return {
    id: r.id,
    doc_number: r.doc_number,
    fileName: r.filename ?? "document",
    docType: r.doc_type,
    uploadedAt: r.uploaded_at,
    uploadedBy: r.uploaded_by,
    status: r.status,
    data: r.data,
    issues: r.issues,
    previewUrl: fileUrl(r.id),
    confidence: r.confidence,
    processingTime: r.processing_time ?? null,
    model: r.model ?? null,
  };
}

interface DocStore {
  docs: DocRecord[];
  loading: boolean;
  loadError: string | null;
  dismissError: () => void;
  reload: () => Promise<void>;
  addRecord: (r: DocumentRecord) => void;
  replaceRecord: (r: DocumentRecord) => void;
  getDoc: (id: string) => DocRecord | undefined;
}

const DocContext = createContext<DocStore | null>(null);

export function useDocuments(): DocStore {
  const ctx = useContext(DocContext);
  if (!ctx) throw new Error("useDocuments must be used within DocumentsProvider");
  return ctx;
}

// Expected header fields per doc type (receipts have no buyer / tax line).
// Kept client-side to drive the "Missing" badges + confidence display.
const EXPECTED_FIELDS: Record<DocType, (keyof ExtractedDocument)[]> = {
  invoice: ["doc_number", "vendor", "buyer", "doc_date", "subtotal", "tax_amount", "total_amount"],
  purchase_order: ["doc_number", "vendor", "buyer", "doc_date", "subtotal", "tax_amount", "total_amount"],
  receipt: ["doc_number", "vendor", "doc_date", "subtotal", "total_amount"],
};

export function missingFields(data: ExtractedDocument, docType: DocType): (keyof ExtractedDocument)[] {
  return EXPECTED_FIELDS[docType].filter((f) => {
    const v = data[f];
    return v === null || v === undefined || v === "";
  });
}

export function AppProviders({ children }: { children: ReactNode }) {
  // Session survives refresh via localStorage.
  const [user, setUser] = useState<StoredAuth | null>(() => loadAuth());
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setDocs((await listDocuments()).map(toRecord));
      setLoadError(null);
    } catch (e) {
      // Surfaced as a dismissible banner in the app shell (previously this was
      // swallowed silently and the UI showed a misleading "no documents").
      setLoadError(e instanceof Error ? e.message : "Could not reach the backend.");
    } finally {
      setLoading(false);
    }
  }, []);

  const signIn = useCallback((u: StoredAuth) => {
    saveAuth(u);
    setUser(u);
  }, []);

  const signOut = useCallback(() => {
    clearAuth();
    setUser(null);
  }, []);

  // (Re)load documents whenever the session changes — the backend filters the
  // list per role, so a fresh login must refetch. Signed out -> empty store.
  useEffect(() => {
    if (!user) {
      setDocs([]);
      setLoadError(null);
      return;
    }
    void reload();
  }, [user, reload]);

  // The API client saw a 401 — the token is invalid/expired, so sign out.
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const auth = useMemo<AuthState>(
    () => ({ user, role: user?.role ?? null, signIn, signOut }),
    [user, signIn, signOut],
  );

  const store = useMemo<DocStore>(
    () => ({
      docs,
      loading,
      loadError,
      dismissError: () => setLoadError(null),
      reload,
      addRecord: (r) => setDocs((prev) => [toRecord(r), ...prev]),
      replaceRecord: (r) =>
        setDocs((prev) => prev.map((d) => (d.id === r.id ? toRecord(r) : d))),
      getDoc: (id) => docs.find((d) => d.id === id),
    }),
    [docs, loading, loadError, reload],
  );

  return (
    <AuthContext.Provider value={auth}>
      <DocContext.Provider value={store}>{children}</DocContext.Provider>
    </AuthContext.Provider>
  );
}
