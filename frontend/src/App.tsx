// Routing + auth gate. Unauthenticated users land on /login; signed-in users
// enter the app shell with routes gated per role:
//   user  -> Upload (own docs), read-only /review/:id, Assistant
//   staff -> + Review Queue (edit/approve/reject), Dashboard metrics
//   admin -> + eval runs, bulk export, ROI (gated inside the pages)

import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./store";
import AppShell from "./components/AppShell";
import RequireRole from "./components/RequireRole";
import { roleHome } from "./lib/auth";
import LoginPage from "./pages/LoginPage";
import UploadPage from "./pages/UploadPage";
import ReviewPage from "./pages/ReviewPage";
import DashboardPage from "./pages/DashboardPage";
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
        <Route path="/upload" element={<UploadPage />} />
        {/* The queue is the staff/admin worklist; a specific document stays
            reachable for `user` so they can view their own results read-only. */}
        <Route
          path="/review"
          element={
            <RequireRole allow={["staff", "admin"]}>
              <ReviewPage />
            </RequireRole>
          }
        />
        <Route path="/review/:id" element={<ReviewPage />} />
        <Route
          path="/dashboard"
          element={
            <RequireRole allow={["staff", "admin"]}>
              <DashboardPage />
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
