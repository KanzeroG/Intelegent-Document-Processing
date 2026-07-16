import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { extractDocument, listModels, type DocType, type ModelOption } from "../api";
import { useAuth, useDocuments } from "../store";
import StatusBadge from "../components/StatusBadge";
import { DOC_TYPE_LABEL, docLabel, formatDateTime } from "../lib/format";

const TYPES: DocType[] = ["invoice", "purchase_order", "receipt"];
const DEFAULT_DOC_TYPE: DocType = "invoice";

interface Staged {
  key: string;
  file: File;
  docType: DocType;
}
const newKey = () => (globalThis.crypto?.randomUUID?.() ?? String(Math.random())).slice(0, 12);

export default function UploadPage() {
  const { docs, addRecord, loading: docsLoading, loadError } = useDocuments();
  const navigate = useNavigate();

  const [staged, setStaged] = useState<Staged[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [models, setModels] = useState<ModelOption[]>([]);
  const [model, setModel] = useState("");

  useEffect(() => {
    listModels()
      .then((m) => {
        setModels(m);
        setModel((cur) => cur || m.find((x) => x.default_extract)?.key || m.find((x) => x.configured)?.key || "");
      })
      .catch(() => setModels([]));
  }, []);

  const activeModel = models.find((m) => m.key === model);
  const loading = progress !== null;

  const recentDocs = [...docs].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)).slice(0, 5);

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
        <div className="lg:col-span-2 space-y-gutter">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
          />

          <div
            onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => { e.preventDefault(); setDragActive(false); addFiles(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            className={["flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-surface-white p-8 text-center transition-colors", dragActive ? "border-secondary bg-secondary/5" : "border-outline-variant"].join(" ")}
          >
            <span className="material-symbols-outlined text-5xl text-secondary">cloud_upload</span>
            <p className="mt-3 text-headline-md text-text-primary">Drag invoices, purchase orders, or receipts here</p>
            <p className="mt-1 text-body-sm text-on-surface-variant">Multiple files supported · PDF, PNG, or JPG</p>
            <span className="mt-4 rounded-lg bg-primary px-4 py-2 text-body-md font-semibold text-white">Browse files</span>
          </div>

          {staged.length > 0 && (
            <div className="rounded-lg border border-border-base bg-surface-white shadow-sm">
              <div className="flex items-center justify-between border-b border-border-base px-5 py-3">
                <span className="text-body-md font-semibold text-text-primary">{staged.length} file{staged.length > 1 ? "s" : ""} ready</span>
                <button onClick={() => setStaged([])} disabled={loading} className="text-body-sm text-on-surface-variant hover:text-status-error disabled:opacity-50">Clear all</button>
              </div>

              <ul className="divide-y divide-border-base">
                {staged.map((s) => (
                  <li key={s.key} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="material-symbols-outlined text-secondary">description</span>
                    <span className="flex-1 truncate text-body-md text-text-primary">{s.file.name}</span>
                    <select
                      value={s.docType}
                      disabled={loading}
                      onChange={(e) => setStaged((prev) => prev.map((x) => (x.key === s.key ? { ...x, docType: e.target.value as DocType } : x)))}
                      className="rounded-lg border border-border-base bg-surface-white px-2 py-1 text-body-sm"
                    >
                      {TYPES.map((t) => <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>)}
                    </select>
                    <button onClick={() => setStaged((prev) => prev.filter((x) => x.key !== s.key))} disabled={loading} className="text-on-surface-variant hover:text-status-error disabled:opacity-50" aria-label="Remove">
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
                      <div className="h-2 rounded-full bg-secondary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                    </div>
                  </div>
                ) : (
                  <button onClick={runBatch} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary font-semibold text-white hover:bg-primary-container">
                    <span className="material-symbols-outlined text-base">auto_awesome</span>
                    Extract {staged.length} document{staged.length > 1 ? "s" : ""}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border-base bg-surface-white p-5 shadow-sm">
          <h3 className="text-headline-md text-text-primary">Processing Settings</h3>
          {models.length > 0 && (
            <label className="mt-4 block">
              <span className="text-label-md text-on-surface-variant">Extraction Model</span>
              <select value={model} disabled={loading} onChange={(e) => setModel(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-border-base bg-surface-white px-3 text-body-md text-text-primary focus:border-secondary focus:outline-none disabled:opacity-50">
                {models.map((m) => <option key={m.key} value={m.key} disabled={!m.configured}>{m.label}{!m.configured ? " — API key needed" : ""}</option>)}
              </select>
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

      <div className="mt-8 rounded-lg border border-border-base bg-surface-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-base px-5 py-4">
          <h3 className="text-headline-md text-text-primary">Recently Uploaded</h3>
          <span className="text-body-sm text-on-surface-variant">{recentDocs.length} most recent</span>
        </div>

        {docsLoading && recentDocs.length === 0 ? (
          <div className="space-y-3 px-5 py-6">
            {[0, 1, 2].map((i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-surface-container" />)}
          </div>
        ) : recentDocs.length === 0 ? (
          <div className="px-5 py-12 text-center text-body-md text-on-surface-variant">
            {loadError ? "Couldn't load documents." : "No documents yet."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-label-sm uppercase text-on-surface-variant">
                  <th className="px-5 py-3">Doc ID</th>
                  <th className="px-5 py-3">File Name</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="text-body-md">
                {recentDocs.map((d, i) => (
                  <tr key={d.id} className={i % 2 ? "bg-surface-container-low/40" : ""}>
                    <td className="px-5 py-3 font-semibold text-secondary mono">{docLabel(d)}</td>
                    <td className="max-w-[260px] truncate px-5 py-3 text-text-primary">{d.fileName}</td>
                    <td className="px-5 py-3 text-on-surface-variant">{DOC_TYPE_LABEL[d.docType]}</td>
                    <td className="px-5 py-3"><StatusBadge status={d.status} /></td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => navigate(`/review/${encodeURIComponent(d.id)}`)} className="font-semibold text-secondary hover:underline">View</button>
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
