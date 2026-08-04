// Routing + auth gate. Unauthenticated users land on /login; signed-in users
// enter the app shell with routes gated per role:
//   staff   -> Upload (own docs), read-only /review/:id, Assistant
//   finance -> + Review Queue (edit/correct), Dashboard metrics
//   admin   -> + approve/reject, eval runs, ROI (gated inside the pages)

import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./store";
import AppShell from "./components/AppShell";
import RequireRole from "./components/RequireRole";
import { roleHome } from "./lib/auth";
import LoginPage from "./pages/LoginPage";
import UploadPage from "./pages/UploadPage";
import ReviewQueuePage from "./pages/ReviewQueuePage";
import ReviewPage from "./pages/ReviewPage";
import DashboardPage from "./pages/DashboardPage";
import ArchivePage, { ArchiveMonthPage } from "./pages/ArchivePage";
import ChatPage from "./pages/ChatPage";
import AuditPage from "./pages/AuditPage";
import PerformancePage from "./pages/PerformancePage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  const { role } = useAuth();

  if (!role) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* Uploading is the staff job. Finance reviews and admin decides, so
            neither needs to put documents in, and keeping them out preserves
            the separation: whoever entered a document is never the one who
            approves it. */}
        <Route
          path="/upload"
          element={
            <RequireRole allow={["staff"]}>
              <UploadPage />
            </RequireRole>
          }
        />
        {/* The queue is the finance/admin worklist; a specific document stays
            reachable for `staff` so they can view their own results read-only. */}
        <Route
          path="/review"
          element={
            <RequireRole allow={["finance", "admin"]}>
              <ReviewQueuePage />
            </RequireRole>
          }
        />
        <Route path="/review/:id" element={<ReviewPage />} />
        <Route
          path="/dashboard"
          element={
            <RequireRole allow={["finance", "admin"]}>
              <DashboardPage />
            </RequireRole>
          }
        />
        {/* Archive: approved documents by month/day. Reviewers only - a `user`
            sees their own results on Upload, not the sign-off record. */}
        <Route
          path="/archive"
          element={
            <RequireRole allow={["finance", "admin"]}>
              <ArchivePage />
            </RequireRole>
          }
        />
        <Route
          path="/archive/:year/:month"
          element={
            <RequireRole allow={["finance", "admin"]}>
              <ArchiveMonthPage />
            </RequireRole>
          }
        />
        <Route path="/chat" element={<ChatPage />} />
        <Route
          path="/audit"
          element={
            <RequireRole allow={["admin"]}>
              <AuditPage />
            </RequireRole>
          }
        />
        <Route
          path="/performance"
          element={
            <RequireRole allow={["admin"]}>
              <PerformancePage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <RequireRole allow={["admin"]}>
              <SettingsPage />
            </RequireRole>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to={roleHome(role)} replace />} />
    </Routes>
  );
}
