// App shell: a header with a role switcher (exercises the stubbed auth) and the
// active view. For this slice everyone lands on the Upload page; the staff
// review screen and admin dashboard are placeholders for the next session.

import { useState } from "react";
import "./App.css";
import UploadPage from "./pages/UploadPage";
import type { Role } from "./api";

const ROLES: Role[] = ["user", "staff", "admin"];

export default function App() {
  const [role, setRole] = useState<Role>("user");

  return (
    <div className="app">
      <header className="app-header">
        <h1>Intelligent Document Processing</h1>
        <label className="role-switcher">
          Role:&nbsp;
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </header>

      <main>
        {role === "user" && <UploadPage role={role} />}
        {role === "staff" && (
          <Placeholder
            title="Review queue"
            note="Staff review/correct/approve screen — coming in the next session. Upload still works via the user role."
          />
        )}
        {role === "admin" && (
          <Placeholder
            title="Admin dashboard"
            note="Monitoring, user management, and rule/schema config — coming in the next session."
          />
        )}
      </main>
    </div>
  );
}

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="placeholder">
      <h2>{title}</h2>
      <p className="muted">{note}</p>
    </div>
  );
}
