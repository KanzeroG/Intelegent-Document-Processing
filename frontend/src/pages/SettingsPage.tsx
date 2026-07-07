// Admin-only settings: tune the validation thresholds used during extraction /
// re-validation, and manage the user accounts that can sign in. Both sections
// talk to the /admin/* endpoints, which are admin-gated server-side too — this
// page is a convenience surface, not the security boundary.

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import toast from "react-hot-toast";
import {
  createUser,
  deleteUser,
  getSettings,
  listUsers,
  updateSettings,
  type AppSettings,
  type Role,
  type UserAccount,
} from "../api";
import { useAuth } from "../store";

const ROLES: Role[] = ["user", "staff", "admin"];

// Shared input styling (matches UploadPage's controls). `mt-1.5` assumes the
// control sits under a <Field> label span.
const INPUT =
  "mt-1.5 h-10 w-full rounded-lg border border-border-base bg-surface-white px-3 text-body-md focus:border-secondary focus:outline-none";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-label-md text-on-surface-variant">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-body-sm text-on-surface-variant">{hint}</span>}
    </label>
  );
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-headline-lg text-text-primary">Settings</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Tune validation rules and manage who can sign in. Admin only.
        </p>
      </div>
      <ValidationRulesCard />
      <UserManagementCard />
    </div>
  );
}

// --- Validation rules --------------------------------------------------------

function ValidationRulesCard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Held as strings so the inputs stay freely editable; parsed on save. PPN is
  // shown as a percentage (11) but stored as a fraction (0.11).
  const [ppnPct, setPpnPct] = useState("");
  const [tolerance, setTolerance] = useState("");
  const [lowConf, setLowConf] = useState("");

  const apply = useCallback((s: AppSettings) => {
    setPpnPct(String(+(s.ppn_rate * 100).toFixed(2)));
    setTolerance(String(s.reconcile_tolerance));
    setLowConf(String(s.low_confidence_threshold));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      apply(await getSettings());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load settings.");
    } finally {
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const ppn = Number(ppnPct);
    const tol = Number(tolerance);
    const low = Number(lowConf);
    if (!Number.isFinite(ppn) || ppn < 0 || ppn > 100) {
      toast.error("PPN rate must be between 0 and 100%.");
      return;
    }
    if (!Number.isInteger(tol) || tol < 0) {
      toast.error("Reconcile tolerance must be a whole number ≥ 0.");
      return;
    }
    if (!Number.isFinite(low) || low < 0 || low > 1) {
      toast.error("Low-confidence threshold must be between 0 and 1.");
      return;
    }
    setSaving(true);
    try {
      apply(
        await updateSettings({
          ppn_rate: ppn / 100,
          reconcile_tolerance: tol,
          low_confidence_threshold: low,
        }),
      );
      toast.success("Settings saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-border-base bg-surface-white p-6 shadow-sm">
      <h2 className="text-headline-md text-text-primary">Validation Rules</h2>
      <p className="mt-1 text-body-sm text-on-surface-variant">
        Applied whenever a document is extracted or re-validated.
      </p>

      {loading ? (
        <div className="mt-6 space-y-3" aria-label="Loading settings">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-container" />
          ))}
        </div>
      ) : error ? (
        <div className="mt-6 text-body-md">
          <p className="text-status-error">{error}</p>
          <button
            onClick={() => void load()}
            className="mt-2 font-semibold text-secondary hover:underline"
          >
            Try again
          </button>
        </div>
      ) : (
        <form onSubmit={onSave} className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="PPN rate (%)" hint="Expected tax rate">
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={ppnPct}
                onChange={(e) => setPpnPct(e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label="Reconcile tolerance (Rp)" hint="Rounding slack for sums">
              <input
                type="number"
                step="1"
                min="0"
                value={tolerance}
                onChange={(e) => setTolerance(e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label="Low-confidence threshold" hint="0–1; flags soft fields">
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={lowConf}
                onChange={(e) => setLowConf(e.target.value)}
                className={INPUT}
              />
            </Field>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-container disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      )}
    </section>
  );
}

// --- User management ---------------------------------------------------------

function UserManagementCard() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setUsers(await listUsers());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load users.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Email and password are required.");
      return;
    }
    setCreating(true);
    try {
      await createUser({
        email: email.trim(),
        name: name.trim() || email.trim(),
        role,
        password,
      });
      toast.success(`Added ${email.trim().toLowerCase()}.`);
      setEmail("");
      setName("");
      setRole("user");
      setPassword("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add user.");
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(target: string) {
    setBusyEmail(target);
    try {
      await deleteUser(target);
      toast.success(`Deleted ${target}.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete user.");
    } finally {
      setBusyEmail(null);
    }
  }

  return (
    <section className="rounded-lg border border-border-base bg-surface-white p-6 shadow-sm">
      <h2 className="text-headline-md text-text-primary">User Management</h2>
      <p className="mt-1 text-body-sm text-on-surface-variant">
        Accounts that can sign in. Passwords are stored hashed.
      </p>

      <div className="mt-5 overflow-x-auto rounded-lg border border-border-base">
        <table className="w-full min-w-[520px] text-left text-body-sm">
          <thead>
            <tr className="border-b border-border-base text-label-sm uppercase text-on-surface-variant">
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users === null && !error ? (
              <tr>
                <td colSpan={4} className="px-4 py-6">
                  <div className="h-6 animate-pulse rounded bg-surface-container" />
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-status-error">
                  {error}
                </td>
              </tr>
            ) : users && users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-on-surface-variant">
                  No users yet.
                </td>
              </tr>
            ) : (
              (users ?? []).map((u, i) => {
                const isSelf = user?.email === u.email;
                return (
                  <tr key={u.email} className={i % 2 ? "bg-surface-container-low/40" : ""}>
                    <td className="px-4 py-2.5 text-text-primary">
                      {u.email}
                      {isSelf && (
                        <span className="ml-1.5 text-label-sm text-on-surface-variant">(you)</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-on-surface-variant">{u.name}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex rounded-full bg-status-neutral/10 px-2.5 py-0.5 text-label-sm uppercase text-status-neutral">
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => void onDelete(u.email)}
                        disabled={isSelf || busyEmail === u.email}
                        title={isSelf ? "You cannot delete your own account" : "Delete user"}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-body-sm font-semibold text-status-error hover:bg-status-error/10 disabled:cursor-not-allowed disabled:text-outline-variant disabled:hover:bg-transparent"
                      >
                        <span className="material-symbols-outlined text-base">delete</span>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <form onSubmit={onAdd} className="mt-6">
        <h3 className="text-body-lg font-semibold text-text-primary">Add user</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT}
              placeholder="name@company"
            />
          </Field>
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT}
              placeholder="Full name"
            />
          </Field>
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={INPUT}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT}
              placeholder="Initial password"
            />
          </Field>
        </div>
        <button
          type="submit"
          disabled={creating}
          className="mt-4 inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 font-semibold text-white hover:bg-primary-container disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-base">person_add</span>
          {creating ? "Adding…" : "Add user"}
        </button>
      </form>
    </section>
  );
}
