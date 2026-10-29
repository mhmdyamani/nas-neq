import { toast } from "sonner";
import { useAdmin, useLoad, H, Card } from "@/pages/admin/AdminPage";
import { Pill } from "@/pages/admin/Orders";
import { errMsg, fmtDate, SERVICE_LABELS } from "@/lib/api";

export default function Inquiries() {
  const api = useAdmin();
  const { data, reload } = useLoad(() => api("get", "/admin/inquiries"), []);
  const setStatus = async (id, status) => {
    try { await api("post", `/admin/inquiries/${id}/status`, { status }); toast.success("Updated"); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <section data-testid="admin-inquiries">
      <H sub="Made-to-order inquiries from the website. Contact the customer to confirm price and timing.">Inquiries</H>
      {!data ? <p>Loading…</p> : !data.length ? <Card className="p-10 text-center text-[var(--taupe)]" data-testid="inquiries-empty">No inquiries yet.</Card> : (
        <div className="space-y-3">{data.map((q) => (
          <Card key={q.id} className="p-4 text-sm space-y-1" data-testid={`inquiry-row-${q.ref}`}>
            <div className="flex flex-wrap gap-2 items-center"><span className="font-medium">{q.ref}</span><Pill dark>{q.status}</Pill><span className="text-[var(--taupe)]">{fmtDate(q.created_at)}</span>
              <select aria-label="Inquiry status" value={q.status} onChange={(e) => setStatus(q.id, e.target.value)} className="ml-auto h-9 rounded-full border border-[var(--sand)] px-3" data-testid={`inquiry-status-${q.ref}`}><option value="new">New</option><option value="contacted">Contacted</option><option value="closed">Closed</option></select></div>
            <p>{q.name} · <a className="underline" href={`tel:${q.phone}`}>{q.phone}</a>{q.email ? ` · ${q.email}` : ""}</p>
            <p><strong>Products:</strong> {q.products.join(", ")}</p>
            <p>Qty: {q.quantity || "—"} · Date: {q.preferred_date || "—"} · Service: {SERVICE_LABELS[q.service] || "—"}</p>
            {q.notes && <p className="italic">{q.notes}</p>}
            <p className="text-xs text-[var(--taupe)]">Owner email alert: {q.notifications?.[0]?.status || "not sent"}</p>
          </Card>))}</div>
      )}
    </section>
  );
}
