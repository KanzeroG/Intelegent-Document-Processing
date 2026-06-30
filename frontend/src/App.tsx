import { useState } from "react";
import { Toaster } from "react-hot-toast";
import "./App.css";
import UploadPage from "./pages/UploadPage";
import ReviewPage from "./pages/ReviewPage";
import DashboardPage from "./pages/DashboardPage";
import type { Role } from "./api";

const ROLES: Role[] = ["user", "staff", "admin"];

export default function App() {
  const [role, setRole] = useState<Role>("user");
  const [activeTab, setActiveTab] = useState<"upload" | "review" | "dashboard">("upload");

  // Determine which tab to show based on Role restrictions (if any).
  // For simplicity, we just allow navigation and conditionally show content.

  return (
    <div className="app">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Xquisite IDP</h1>
        </div>
        
        <nav className="sidebar-nav">
          <div 
            className={`nav-item ${activeTab === "upload" ? "active" : ""}`}
            onClick={() => setActiveTab("upload")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            Upload Document
          </div>

          <div 
            className={`nav-item ${activeTab === "review" ? "active" : ""}`}
            onClick={() => setActiveTab("review")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            Review Queue
          </div>

          <div 
            className={`nav-item ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="3" y1="9" x2="21" y2="9"></line>
              <line x1="9" y1="21" x2="9" y2="9"></line>
            </svg>
            Admin Dashboard
          </div>
        </nav>
      </aside>

      {/* Main Area */}
      <div className="main-wrapper">
        <header className="top-header">
          <label className="role-switcher">
            View as Role:
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </header>

        <main>
          {activeTab === "upload" && <UploadPage role={role} />}
          
          {activeTab === "review" && <ReviewPage />}

          {activeTab === "dashboard" && <DashboardPage />}
        </main>
      </div>
      <Toaster 
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
          }
        }}
      />
    </div>
  );
}

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="placeholder">
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ width: 64, height: 64, marginBottom: '1rem' }}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
      </svg>
      <h2>{title}</h2>
      <p className="muted">{note}</p>
    </div>
  );
}
