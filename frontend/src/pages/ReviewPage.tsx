import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import "./ReviewPage.css";

// Mock data for the review queue
const MOCK_QUEUE = [
  {
    id: "DOC-2023-0891",
    type: "invoice",
    vendor: "PT Sumber Makmur",
    date: "2023-10-15",
    total: 12450000,
    status: "needs_review",
    confidence: 85,
    issues: ["Total amount mismatch with line items sum", "Low confidence on Invoice Date"],
  },
  {
    id: "DOC-2023-0892",
    type: "purchase_order",
    vendor: "CV Mitra Teknik",
    date: "2023-10-16",
    total: 3900000,
    status: "pending",
    confidence: 98,
    issues: [],
  }
];

export default function ReviewPage() {
  const [selectedDoc, setSelectedDoc] = useState(MOCK_QUEUE[0]);
  const [formData, setFormData] = useState({
    vendor: selectedDoc.vendor,
    date: selectedDoc.date,
    total: selectedDoc.total,
  });

  const handleApprove = () => {
    toast.success("Document approved and data exported successfully!");
    // In a real app, this would call an API and then load the next document.
  };

  useEffect(() => {
    if (selectedDoc.issues.length > 0) {
      toast("This document has issues that need review", { icon: '⚠️', id: `issue-${selectedDoc.id}` });
    }
  }, [selectedDoc]);

  return (
    <div className="review-page">
      <div className="page-header">
        <h2>Human-in-the-Loop Review</h2>
        <p className="muted">Review extracted data, correct errors, and approve for export.</p>
      </div>

      <div className="review-layout">
        {/* Left Sidebar: Queue */}
        <div className="queue-panel card">
          <div className="card-header">
            <div className="card-title">Review Queue</div>
          </div>
          <div className="queue-list">
            {MOCK_QUEUE.map(doc => (
              <div 
                key={doc.id} 
                className={`queue-item ${selectedDoc.id === doc.id ? "active" : ""}`}
                onClick={() => {
                  setSelectedDoc(doc);
                  setFormData({ vendor: doc.vendor, date: doc.date, total: doc.total });
                }}
              >
                <div className="queue-item-header">
                  <span className="doc-id">{doc.id}</span>
                  <span className={`badge ${doc.issues.length > 0 ? 'badge-warning' : 'badge-success'}`}>
                    {doc.issues.length > 0 ? 'Issues' : 'Clean'}
                  </span>
                </div>
                <div className="queue-item-details">
                  <span className="vendor-name">{doc.vendor}</span>
                  <span className="confidence">Acc: {doc.confidence}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Center: Document Preview */}
        <div className="preview-panel card">
          <div className="card-header">
            <div className="card-title">Document: {selectedDoc.id}</div>
          </div>
          <div className="preview-placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="3" x2="9" y2="21"></line>
            </svg>
            <p>Document preview will appear here.</p>
            <p className="muted" style={{ fontSize: '0.75rem' }}>Dummy data mode</p>
          </div>
        </div>

        {/* Right: Data Form */}
        <div className="form-panel card">
          <div className="card-header">
            <div className="card-title">Extracted Data</div>
          </div>
          
          <div className="form-fields">
            <div className="input-group">
              <label className="input-label">Vendor Name <span className="req">*</span></label>
              <input 
                type="text" 
                className="input-field" 
                value={formData.vendor}
                onChange={e => setFormData({...formData, vendor: e.target.value})}
              />
            </div>
            <div className={`input-group ${selectedDoc.issues.some(i => i.includes('Date')) ? 'has-warning' : ''}`}>
              <label className="input-label">Invoice Date</label>
              <input 
                type="date" 
                className="input-field" 
                value={formData.date}
                onChange={e => setFormData({...formData, date: e.target.value})}
              />
              {selectedDoc.issues.some(i => i.includes('Date')) && (
                <span className="field-warning">Low confidence</span>
              )}
            </div>
            <div className={`input-group ${selectedDoc.issues.some(i => i.includes('Total')) ? 'has-error' : ''}`}>
              <label className="input-label">Total Amount</label>
              <input 
                type="number" 
                className="input-field" 
                value={formData.total}
                onChange={e => setFormData({...formData, total: Number(e.target.value)})}
              />
              {selectedDoc.issues.some(i => i.includes('Total')) && (
                <span className="field-error">Mismatch with line items</span>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-secondary w-full">Flag for Manual Entry</button>
            <button className="btn btn-primary w-full" onClick={handleApprove}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width: 16, height: 16}}>
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              Approve & Export
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
