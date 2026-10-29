import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { RefreshCw, Check } from "lucide-react";
import { http, errMsg, peso, fmtDate, STATUS_LABELS, PAY_LABELS, SERVICE_LABELS } from "@/lib/api";
import { PageHead } from "@/pages/Menu";

const FLOW = ["pending", "accepted", "preparing", "ready", "completed"];

export default function Track() {
  const { token } = useParams();
  const [sp] = useSearchParams();
  const [o, setO] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await http.get(`/orders/track/${token}`);
      setO(data);
      setErr("");
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  if (err && !o) return <main><PageHead eyebrow="Order tracking" title="Order not found">{err}</PageHead></main>;
  if (!o) return <main className="min-h-[60vh] pt-40 text-center">Loading…</main>;
  const final = ["rejected", "cancelled"].includes(o.status);
  const flow = o.fulfillment === "delivery" || o.fulfillment === "contactless" ? ["pending", "accepted", "preparing", "out_for_delivery", "completed"] : FLOW;
  const idx = flow.indexOf(o.status === "ready" && !flow.includes("ready") ? "preparing" : o.status);

  return (
    <main data-testid="track-page">
      <PageHead eyebrow={`Order ${o.ref}`} title={o.status === "pending" ? "Order request received" : STATUS_LABELS[o.status]}>
        {sp.get("new") && <p className="mb-2" data-testid="order-created-msg">Thank you! Your {o.type === "preorder" ? "pre-order" : "order"} request was saved with reference <strong data-testid="order-ref">{o.ref}</strong>. Bookmark this page — it's your private tracking link.</p>}
        {o.status === "pending" && "Pending review — Nas&Neq has not accepted it yet."}
      </PageHead>
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-10 py-12 space-y-10">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full px-4 py-2 bg-[var(--espresso)] text-[var(--cream)] text-sm" data-testid="track-status">{STATUS_LABELS[o.status]}</span>
          <span className="rounded-full px-4 py-2 bg-[var(--beige)] text-sm" data-testid="track-payment-status">{PAY_LABELS[o.payment_status]}</span>
          <button onClick={load} className="ml-auto inline-flex items-center gap-2 text-sm underline" data-testid="track-refresh-btn"><RefreshCw size={14} className={loading ? "animate-spin" : ""} />Refresh</button>
        </div>
        <p className="text-sm text-[var(--taupe)]">Last updated {fmtDate(o.updated_at)} (Manila time). This page refreshes automatically; email updates are sent only if you gave an email.</p>
        {!final ? (
          <ol className="grid grid-cols-5 gap-2" aria-label="Order progress">
            {flow.map((s, i) => (
              <li key={s} className="text-center">
                <span className={`mx-auto h-9 w-9 rounded-full grid place-items-center border ${i <= idx ? "bg-[var(--espresso)] text-[var(--cream)] border-[var(--espresso)]" : "border-[var(--sand)]"}`}>{i <= idx ? <Check size={16} /> : i + 1}</span>
                <span className="block mt-2 text-[11px] sm:text-xs">{STATUS_LABELS[s]}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-2xl bg-red-50 text-red-900 p-4" role="status">This order was {o.status}. Any reserved items were released.</p>
        )}
        <section className="rounded-3xl border border-[var(--beige)] p-6">
          <p className="text-sm text-[var(--taupe)]">{SERVICE_LABELS[o.fulfillment]}{o.preorder_date ? ` · requested for ${o.preorder_date}` : ""} · placed {fmtDate(o.created_at)}</p>
          <ul className="mt-4 space-y-2">
            {o.items.map((i) => <li key={i.name} className="flex justify-between text-sm"><span>{i.qty} × {i.name}</span><span className="tabular">{peso(i.line_total)}</span></li>)}
          </ul>
          <div className="mt-4 border-t border-[var(--cream)] pt-3 text-sm space-y-1">
            {o.delivery_fee > 0 && <div className="flex justify-between"><span>Delivery fee</span><span>{peso(o.delivery_fee)}</span></div>}
            <div className="flex justify-between font-medium text-base"><span>Total</span><span className="tabular" data-testid="track-total">{peso(o.total)}</span></div>
          </div>
        </section>
        <section>
          <h2 className="font-display text-2xl mb-4">Updates</h2>
          <ul className="space-y-3">
            {[...o.history].reverse().map((h, i) => (
              <li key={i} className="flex gap-4 text-sm"><span className="text-[var(--taupe)] w-40 shrink-0">{fmtDate(h.at)}</span>
                <span>{h.kind === "payment" ? PAY_LABELS[h.to] : h.kind === "reschedule" ? `Date changed to ${h.to}` : STATUS_LABELS[h.to]}{h.note ? ` — ${h.note}` : ""}</span></li>
            ))}
          </ul>
        </section>
        <Link to="/menu" className="inline-block underline">Back to menu</Link>
      </div>
    </main>
  );
}
