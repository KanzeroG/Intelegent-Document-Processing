// Routing + auth gate. Unauthenticated users land on /login; once a role is
// chosen they enter the app shell (sidebar + topbar) with the three screens.

import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./store";
import AppShell from "./components/AppShell";
import LoginPage from "./pages/LoginPage";
import UploadPage from "./pages/UploadPage";
import ReviewPage from "./pages/ReviewPage";
import DashboardPage from "./pages/DashboardPage";

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
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/review/:id" element={<ReviewPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/upload" replace />} />
    </Routes>
  );
}
