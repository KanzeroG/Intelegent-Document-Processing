import { useEffect } from "react";
import toast from "react-hot-toast";
import "./DashboardPage.css";

export default function DashboardPage() {
  useEffect(() => {
    toast("ROI Milestone Reached! The AI extraction pipeline has now paid for its implementation cost.", {
      icon: '🚀',
      id: 'roi-toast'
    });
  }, []);

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h2>Business Analytics & ROI</h2>
        <p className="muted">Monitor system performance, accuracy metrics, and automation ROI.</p>
      </div>

      {/* Top Metrics Cards */}
      <div className="metrics-grid">
        <div className="metric-card card">
          <div className="metric-icon bg-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <div className="metric-info">
            <span className="metric-label">Documents Processed</span>
            <span className="metric-value">12,450</span>
            <span className="metric-trend positive">↑ 14% this month</span>
          </div>
        </div>

        <div className="metric-card card">
          <div className="metric-icon bg-green">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <div className="metric-info">
            <span className="metric-label">Time Saved (Hours)</span>
            <span className="metric-value">3,112</span>
            <span className="metric-trend positive">↑ 22% this month</span>
          </div>
        </div>

        <div className="metric-card card">
          <div className="metric-icon bg-purple">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
            </svg>
          </div>
          <div className="metric-info">
            <span className="metric-label">Est. Cost Savings</span>
            <span className="metric-value">$62,240</span>
            <span className="metric-trend positive">↑ 18% this month</span>
          </div>
        </div>

        <div className="metric-card card">
          <div className="metric-icon bg-orange">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <div className="metric-info">
            <span className="metric-label">Extraction Accuracy</span>
            <span className="metric-value">97.4%</span>
            <span className="metric-trend neutral">- 0.2% this month</span>
          </div>
        </div>
      </div>

      {/* Main Dashboard Area */}
      <div className="dashboard-main">
        <div className="chart-panel card">
          <div className="card-header">
            <div className="card-title">Processing Volume vs. Manual Entry</div>
          </div>
          <div className="chart-placeholder">
            <div className="bar-chart-mock">
              <div className="chart-col">
                <div className="bar auto" style={{height: '60%'}}></div>
                <div className="bar manual" style={{height: '20%'}}></div>
                <span>Jan</span>
              </div>
              <div className="chart-col">
                <div className="bar auto" style={{height: '65%'}}></div>
                <div className="bar manual" style={{height: '18%'}}></div>
                <span>Feb</span>
              </div>
              <div className="chart-col">
                <div className="bar auto" style={{height: '75%'}}></div>
                <div className="bar manual" style={{height: '15%'}}></div>
                <span>Mar</span>
              </div>
              <div className="chart-col">
                <div className="bar auto" style={{height: '85%'}}></div>
                <div className="bar manual" style={{height: '10%'}}></div>
                <span>Apr</span>
              </div>
              <div className="chart-col">
                <div className="bar auto" style={{height: '92%'}}></div>
                <div className="bar manual" style={{height: '8%'}}></div>
                <span>May</span>
              </div>
            </div>
            <div className="chart-legend">
              <span className="legend-item"><span className="dot dot-auto"></span> AI Processed</span>
              <span className="legend-item"><span className="dot dot-manual"></span> Manual Correction</span>
            </div>
          </div>
        </div>

        <div className="side-panel card">
          <div className="card-header">
            <div className="card-title">Accuracy by Document Type</div>
          </div>
          <div className="progress-list">
            <div className="progress-item">
              <div className="progress-header">
                <span>Invoices</span>
                <span>98.5%</span>
              </div>
              <div className="progress-bar-bg">
                <div className="progress-bar-fill" style={{width: '98.5%', backgroundColor: 'var(--success)'}}></div>
              </div>
            </div>
            
            <div className="progress-item">
              <div className="progress-header">
                <span>Purchase Orders</span>
                <span>96.2%</span>
              </div>
              <div className="progress-bar-bg">
                <div className="progress-bar-fill" style={{width: '96.2%', backgroundColor: 'var(--success)'}}></div>
              </div>
            </div>

            <div className="progress-item">
              <div className="progress-header">
                <span>Receipts</span>
                <span>92.8%</span>
              </div>
              <div className="progress-bar-bg">
                <div className="progress-bar-fill" style={{width: '92.8%', backgroundColor: 'var(--warning)'}}></div>
              </div>
            </div>
            
            <div className="progress-item">
              <div className="progress-header">
                <span>Handwritten Forms</span>
                <span>84.1%</span>
              </div>
              <div className="progress-bar-bg">
                <div className="progress-bar-fill" style={{width: '84.1%', backgroundColor: 'var(--error)'}}></div>
              </div>
            </div>
          </div>

          <div className="business-case mt-4">
          </div>
        </div>
      </div>
    </div>
  );
}
