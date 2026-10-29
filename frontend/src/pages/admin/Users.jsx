import { toast } from "sonner";
import { useAdmin, useLoad, H, Card } from "@/pages/admin/AdminPage";
import { errMsg } from "@/lib/api";

export default function Users() {
  const api = useAdmin();
  const { data, reload } = useLoad(() => api("get", "/users"), []);
  const change = async (u, role) => {
    if (!window.confirm(`Change ${u.email || u.user_id} to ${role}?`)) return;
    try { await api("patch", `/users/${u.user_id}/role`, { role }); toast.success("Role updated"); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <section data-testid="admin-users">
      <H sub="New sign-ups are always customers. Only admins can open this dashboard.">Users</H>
      {!data ? <p>Loading…</p> : (
        <div className="space-y-2">{data.users.map((u) => (
          <Card key={u.user_id} className="p-3 flex items-center gap-3 text-sm" data-testid={`user-row-${u.user_id}`}>
            <div className="flex-1 min-w-0"><p className="truncate font-medium">{u.email || u.user_id}</p><p className="text-xs text-[var(--taupe)]">{u.name}</p></div>
            <select aria-label="Role" value={u.role} onChange={(e) => change(u, e.target.value)} className="h-9 rounded-full border border-[var(--sand)] px-3" data-testid={`user-role-${u.user_id}`}>
              {data.roles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Card>))}</div>
      )}
    </section>
  );
}
