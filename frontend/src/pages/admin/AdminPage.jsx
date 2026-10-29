import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { Show } from "@clerk/react";
import { ExternalLink } from "lucide-react";
import { useStore } from "@/context/StoreContext";
import { http } from "@/lib/api";
import Orders from "@/pages/admin/Orders";
import MenuManager from "@/pages/admin/MenuManager";
import Inventory from "@/pages/admin/Inventory";
import Preorders from "@/pages/admin/Preorders";
import Inquiries from "@/pages/admin/Inquiries";
import Sales from "@/pages/admin/Sales";
import Flags from "@/pages/admin/Flags";
import SettingsPanel from "@/pages/admin/Settings";
import Users from "@/pages/admin/Users";

export function useAdmin() {
  const { authHeaders } = useStore();
  return useCallback(
    async (method, url, data, extra = {}) => {
      const headers = await authHeaders();
      return (await http.request({ method, url, data, headers, ...extra })).data;
    },
    [authHeaders],
  );
}

export function useLoad(fn, deps) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try { setData(await fn()); setError(""); } catch (e) { setError(e?.response?.data?.detail || "Could not load data"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, reload, setData };
}

const TABS = [
  ["orders", "Orders"], ["menu", "Menu"], ["inventory", "Inventory"], ["preorders", "Pre-orders"],
  ["inquiries", "Inquiries"], ["sales", "Sales & Analytics"], ["flags", "Flags"], ["settings", "Settings"], ["users", "Users"],
];

function Dashboard() {
  const { me } = useStore();
  if (!me) return <p className="pt-40 text-center">Loading…</p>;
  if (me.role !== "admin")
    return <div className="pt-40 text-center px-4" data-testid="admin-denied"><p className="font-display text-3xl">Owner access only</p><p className="mt-3 text-[var(--taupe)]">This account does not have admin access.</p><Link to="/" className="underline mt-4 inline-block">Back to website</Link></div>;
  return (
    <div className="min-h-screen bg-[#FBF8F3] pt-[72px]" data-testid="admin-dashboard">
      <div className="sticky top-[72px] z-30 bg-white border-b border-[var(--beige)]">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 flex items-center gap-1 overflow-x-auto no-scrollbar">
          {TABS.map(([k, l]) => (
            <NavLink key={k} to={`/admin/${k}`} data-testid={`admin-tab-${k}`}
              className={({ isActive }) => `whitespace-nowrap px-4 h-12 inline-flex items-center text-sm border-b-2 ${isActive ? "border-[var(--espresso)] font-medium" : "border-transparent text-[var(--taupe)]"}`}>{l}</NavLink>
          ))}
          <a href="/menu" target="_blank" rel="noreferrer" className="ml-auto whitespace-nowrap px-3 h-12 inline-flex items-center gap-1 text-sm" data-testid="admin-preview-site-link">Preview site <ExternalLink size={14} /></a>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-3 sm:px-6 py-8">
        <Routes>
          <Route index element={<Navigate to="orders" replace />} />
          <Route path="orders" element={<Orders />} />
          <Route path="menu" element={<MenuManager />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="preorders" element={<Preorders />} />
          <Route path="inquiries" element={<Inquiries />} />
          <Route path="sales" element={<Sales />} />
          <Route path="flags" element={<Flags />} />
          <Route path="settings" element={<SettingsPanel />} />
          <Route path="users" element={<Users />} />
        </Routes>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <>
      <Show when="signed-in"><Dashboard /></Show>
      <Show when="signed-out"><Navigate to="/sign-in" replace /></Show>
    </>
  );
}

export const H = ({ children, sub }) => (
  <div className="mb-6"><h1 className="font-display text-3xl text-[var(--espresso)]">{children}</h1>{sub && <p className="text-sm text-[var(--taupe)] mt-1">{sub}</p>}</div>
);
export const Btn = ({ variant = "dark", className = "", ...p }) => (
  <button {...p} className={`h-10 px-4 rounded-full text-sm font-medium disabled:opacity-50 transition-colors ${variant === "dark" ? "bg-[var(--espresso)] text-[var(--cream)] hover:bg-[#3a281e]" : variant === "danger" ? "bg-red-700 text-white" : "border border-[var(--sand)] bg-white hover:bg-[var(--cream)]"} ${className}`} />
);
export const Card = ({ className = "", ...p }) => <div {...p} className={`rounded-2xl bg-white border border-[var(--beige)] ${className}`} />;
