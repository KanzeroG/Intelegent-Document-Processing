import { useEffect, useMemo, useState, useRef } from "react";
import toast from "react-hot-toast";
import {
  extractDocument,
  type DocType,
  type ExtractResponse,
  type Role,
} from "../api";
import "./UploadPage.css";

function formatAmount(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("id-ID");
}

export default function UploadPage({ role }: { role: Role }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractResponse | null>(null);
  const [dragActive, setDragActive] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const isPdf = file?.type === "application/pdf" || file?.name.toLowerCase().endsWith(".pdf");

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelection = (selectedFile: File) => {
    setFile(selectedFile);
    setResult(null);
  };

  async function handleExtract() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const extractPromise = extractDocument(file, role);
      toast.promise(extractPromise, {
        loading: 'Extracting document data with AI...',
        success: 'Extraction complete!',
        error: (err) => err instanceof Error ? err.message : "Extraction failed."
      });
      const res = await extractPromise;
      setResult(res);
      
      if (res.issues && res.issues.length > 0) {
        res.issues.forEach(iss => {
           if (iss.severity === 'error') {
             toast.error(`[${iss.field}] ${iss.message}`);
           } else {
             // Treat warnings as generic notifications or use an icon
             toast(`[${iss.field}] ${iss.message}`, { icon: '⚠️' });
           }
        });
      }
    } catch (e) {
      // Error handled by toast.promise
    } finally {
      setLoading(false);
    }
  }

  const doc = result?.data;

  return (
    <div className="upload-page">
      <div className="page-header">
        <h2>Process New Document</h2>
        <p className="muted">Upload an invoice, purchase order, or receipt for AI extraction.</p>
      </div>

      <div className="upload-workspace">
        {/* Left Side: Upload Controls & Document Preview */}
        <div className="workspace-panel left-panel card">
          <div className="card-header">
            <div className="card-title">Document Source</div>
          </div>
          
          <div className="upload-controls">
            {!file ? (
              <div 
                className={`drag-drop-zone ${dragActive ? "drag-active" : ""}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleFileSelection(e.target.files[0]);
                  }}
                />
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <p className="upload-title">Drag & drop your document here</p>
                <p className="upload-subtitle">or click to browse (PDF, PNG, JPG)</p>
              </div>
            ) : (
              <div className="file-selected">
                <div className="file-info">
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                  </svg>
                  <span className="file-name">{file.name}</span>
                  <button className="btn-icon" onClick={() => setFile(null)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
                <button 
                  className="btn btn-primary w-full" 
                  onClick={handleExtract} 
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner"></span> Extracting Data...
                    </>
                  ) : (
                    "Extract with AI"
                  )}
                </button>
              </div>
            )}
          </div>

          {previewUrl && (
            <div className="preview-container">
              {isPdf ? (
                <iframe title="document preview" src={previewUrl} className="preview-frame" />
              ) : (
                <img alt="document preview" src={previewUrl} className="preview-image" />
              )}
            </div>
          )}
        </div>

        {/* Right Side: Extraction Results */}
        <div className="workspace-panel right-panel card">
          <div className="card-header">
            <div className="card-title">Extracted Data</div>
          </div>
          
          {!doc && !loading && (
            <div className="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--border-color)" strokeWidth="1">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="9" y1="3" x2="9" y2="21"></line>
              </svg>
              <p>Run extraction to see structured data here.</p>
            </div>
          )}

          {doc && (
            <div className="results-container">
              <div className="data-grid">
                <div className="data-item">
                  <span className="data-label">Vendor</span>
                  <span className="data-value">{doc.vendor ?? "—"}</span>
                </div>
                <div className="data-item">
                  <span className="data-label">Invoice Date</span>
                  <span className="data-value">{doc.invoice_date ?? "—"}</span>
                </div>
                <div className="data-item">
                  <span className="data-label">Due Date</span>
                  <span className="data-value">{doc.due_date ?? "—"}</span>
                </div>
                <div className="data-item">
                  <span className="data-label">Currency</span>
                  <span className="data-value badge badge-low">{doc.currency}</span>
                </div>
                <div className="data-item">
                  <span className="data-label">Tax Amount</span>
                  <span className="data-value">{formatAmount(doc.tax_amount)}</span>
                </div>
                <div className="data-item total-item">
                  <span className="data-label">Total Amount</span>
                  <span className="data-value highlight">{formatAmount(doc.total_amount)}</span>
                </div>
              </div>

              {doc.line_items.length > 0 && (
                <div className="line-items-section">
                  <h3 className="section-title">Line Items</h3>
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Description</th>
                          <th>Qty</th>
                          <th>Unit Price</th>
                          <th>Line Total</th>
                        </tr>
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
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
