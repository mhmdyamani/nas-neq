import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAdmin, useLoad, H, Btn, Card } from "@/pages/admin/AdminPage";
import { errMsg, peso, fmtDate, STATUS_LABELS, PAY_LABELS, SERVICE_LABELS } from "@/lib/api";

const Sel = ({ value, onChange, options, label, testid }) => (
  <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testid} className="h-10 rounded-full border border-[var(--sand)] bg-white px-3 text-sm">
    <option value="">{label}: all</option>
    {Object.entries(options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
  </select>
);

export const Pill = ({ children, dark }) => <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs whitespace-nowrap ${dark ? "bg-[var(--espresso)] text-[var(--cream)]" : "bg-[var(--beige)]"}`}>{children}</span>;

function OrderDetail({ id, onClose, onChanged }) {
  const api = useAdmin();
  const { data: o, reload } = useLoad(() => api("get", `/admin/orders/${id}`), [id]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState("");
  const act = async (url, body, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    try { await api("post", url, body); toast.success("Saved"); setNote(""); await reload(); onChanged(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="order-detail-dialog">
        <DialogTitle className="font-display text-2xl">{o ? `Order ${o.ref}` : "Loading…"}</DialogTitle>
        <DialogDescription>{o && `${fmtDate(o.created_at)} · ${o.type === "preorder" ? `Pre-order for ${o.preorder_date}` : "Regular order"}`}</DialogDescription>
        {o && (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap gap-2"><Pill dark>{STATUS_LABELS[o.status]}</Pill><Pill>{PAY_LABELS[o.payment_status]}</Pill><Pill>{SERVICE_LABELS[o.fulfillment]}</Pill>{o.stock_reserved && <Pill>Stock reserved</Pill>}</div>
            <div><p className="font-medium">{o.customer.name}</p><a className="underline" href={`tel:${o.customer.phone}`}>{o.customer.phone}</a>{o.customer.email && <p>{o.customer.email}</p>}{o.address && <p className="mt-1">Address: {o.address}</p>}{o.note && <p className="mt-1 italic">Note: {o.note}</p>}</div>
            <ul className="border-y border-[var(--cream)] py-3 space-y-1">{o.items.map((i) => <li key={i.product_id} className="flex justify-between"><span>{i.qty} × {i.name} @ {peso(i.unit_price)}{i.track_stock ? " · stock-tracked" : ""}</span><span>{peso(i.line_total)}</span></li>)}
              {o.delivery_fee > 0 && <li className="flex justify-between"><span>Delivery fee</span><span>{peso(o.delivery_fee)}</span></li>}
              <li className="flex justify-between font-medium pt-1"><span>Total</span><span>{peso(o.total)}</span></li></ul>
            <Input placeholder="Note / reason (recorded in history)" value={note} onChange={(e) => setNote(e.target.value)} data-testid="order-note-input" />
            <div><p className="eyebrow mb-2">Order status</p><div className="flex flex-wrap gap-2">
              {o.allowed_next.length ? o.allowed_next.map((s) => (
                <Btn key={s} disabled={busy} variant={["rejected", "cancelled"].includes(s) ? "danger" : "dark"} data-testid={`order-status-${s}-btn`}
                  onClick={() => act(`/admin/orders/${o.id}/status`, { status: s, note }, ["rejected", "cancelled"].includes(s) ? `Mark order ${o.ref} as ${s}? Reserved stock will be restored.` : null)}>{STATUS_LABELS[s]}</Btn>
              )) : <p className="text-[var(--taupe)]">Final state — no further changes.</p>}</div></div>
            <div><p className="eyebrow mb-2">Payment (recorded manually)</p><div className="flex flex-wrap gap-2">
              {o.allowed_payment.map((s) => <Btn key={s} variant="light" disabled={busy} data-testid={`order-payment-${s}-btn`} onClick={() => act(`/admin/orders/${o.id}/payment`, { payment_status: s, note }, s === "refunded" ? "Record this payment as refunded?" : null)}>Mark {PAY_LABELS[s].toLowerCase()}</Btn>)}</div></div>
            {o.type === "preorder" && !["completed", "rejected", "cancelled"].includes(o.status) && (
              <div className="flex gap-2 items-center"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="max-w-[12rem]" data-testid="order-reschedule-date" /><Btn variant="light" disabled={!date || busy} onClick={() => act(`/admin/orders/${o.id}/reschedule`, { date, note })} data-testid="order-reschedule-btn">Reschedule</Btn></div>
            )}
            <div><p className="eyebrow mb-2">History</p><ul className="space-y-1">{o.history.map((h, i) => <li key={i} className="text-xs"><span className="text-[var(--taupe)]">{fmtDate(h.at)}</span> · {h.kind}: {h.from ? `${h.from} → ` : ""}{h.to} · by {h.by}{h.note ? ` — ${h.note}` : ""}</li>)}</ul></div>
            <div><p className="eyebrow mb-2">Notifications</p>{o.notifications?.length ? <ul className="space-y-1 text-xs">{o.notifications.map((n, i) => <li key={i}>{n.to} email{n.status ? ` (${n.status})` : ""}: {n.status === "sent" ? "sent" : `failed ${n.error || ""}`} · {n.at && fmtDate(n.at)}</li>)}</ul> : <p className="text-xs text-[var(--taupe)]">No emails sent for this order.</p>}</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Orders({ preset = {} }) {
  const api = useAdmin();
  const [f, setF] = useState({ q: "", status: "", fulfillment: "", payment: "", type: "", from: "", to: "", ...preset });
  const [open, setOpen] = useState(null);
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const { data, error, reload } = useLoad(() => api("get", `/admin/orders?${qs}`), [qs]);
  const set = (k) => (v) => setF({ ...f, [k]: v });
  return (
    <section data-testid="admin-orders">
      {!preset.embedded && <H sub="Newest first. Times in Manila (UTC+8). Online orders are requests until you accept them.">Orders</H>}
      <div className="flex flex-wrap gap-2 mb-5">
        <Input placeholder="Search ref, name, phone" value={f.q} onChange={(e) => set("q")(e.target.value)} className="max-w-xs rounded-full" data-testid="orders-search-input" />
        <Sel label="Status" value={f.status} onChange={set("status")} options={STATUS_LABELS} testid="orders-status-filter" />
        <Sel label="Service" value={f.fulfillment} onChange={set("fulfillment")} options={SERVICE_LABELS} testid="orders-service-filter" />
        <Sel label="Payment" value={f.payment} onChange={set("payment")} options={PAY_LABELS} testid="orders-payment-filter" />
        <Sel label="Type" value={f.type} onChange={set("type")} options={{ regular: "Regular", preorder: "Pre-order" }} testid="orders-type-filter" />
        <Input type="date" aria-label="From date" value={f.from} onChange={(e) => set("from")(e.target.value)} className="w-auto rounded-full" data-testid="orders-from-date" />
        <Input type="date" aria-label="To date" value={f.to} onChange={(e) => set("to")(e.target.value)} className="w-auto rounded-full" data-testid="orders-to-date" />
        <Btn variant="light" onClick={reload} data-testid="orders-refresh-btn">Refresh</Btn>
      </div>
      {error && <p className="text-red-700" role="alert">{String(error)}</p>}
      {!data ? <p>Loading…</p> : !data.length ? <Card className="p-10 text-center text-[var(--taupe)]" data-testid="orders-empty">No orders match these filters yet.</Card> : (
        <div className="space-y-2" data-testid="orders-list">
          {data.map((o) => (
            <button key={o.id} onClick={() => setOpen(o.id)} className="w-full text-left" data-testid={`order-row-${o.ref}`}>
              <Card className="p-4 grid gap-2 sm:grid-cols-12 items-center hover:border-[var(--sand)]">
                <div className="sm:col-span-3"><p className="font-medium">{o.ref}</p><p className="text-xs text-[var(--taupe)]">{fmtDate(o.created_at)}</p></div>
                <div className="sm:col-span-3 text-sm"><p>{o.customer.name}</p><p className="text-xs text-[var(--taupe)]">{o.customer.phone}</p></div>
                <div className="sm:col-span-2 text-sm">{o.items.reduce((s, i) => s + i.qty, 0)} items · <span className="font-medium">{peso(o.total)}</span></div>
                <div className="sm:col-span-4 flex flex-wrap gap-1 sm:justify-end"><Pill dark>{STATUS_LABELS[o.status]}</Pill><Pill>{PAY_LABELS[o.payment_status]}</Pill><Pill>{SERVICE_LABELS[o.fulfillment]}</Pill>{o.type === "preorder" && <Pill>Pre-order {o.preorder_date}</Pill>}</div>
              </Card>
            </button>
          ))}
        </div>
      )}
      {open && <OrderDetail id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </section>
  );
}
