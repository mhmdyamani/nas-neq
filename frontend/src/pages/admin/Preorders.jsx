import { useState } from "react";
import { useAdmin, useLoad, H, Card } from "@/pages/admin/AdminPage";
import { Input } from "@/components/ui/input";
import { manilaToday, addDays } from "@/lib/api";

export default function Preorders() {
  const api = useAdmin();
  const [from, setFrom] = useState(manilaToday());
  const [to, setTo] = useState(addDays(manilaToday(), 30));
  const { data } = useLoad(() => api("get", `/admin/preorders?from=${from}&to=${to}`), [from, to]);
  const days = {};
  (data || []).forEach((r) => (days[r.date] = days[r.date] || []).push(r));
  return (
    <section data-testid="admin-preorders">
      <H sub="Open pre-orders grouped by requested date, with daily capacity per product. Accept, reject or reschedule them from Orders.">Pre-orders</H>
      <div className="flex gap-2 mb-5"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" aria-label="From" /><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" aria-label="To" /></div>
      {!data ? <p>Loading…</p> : !data.length ? <Card className="p-10 text-center text-[var(--taupe)]" data-testid="preorders-empty">No pre-orders in this period. Pre-orders are off until you enable them on a made-to-order item (Menu → edit → Accept pre-orders).</Card> : (
        <div className="space-y-4">{Object.entries(days).map(([d, rows]) => (
          <Card key={d} className="p-4"><p className="font-display text-xl mb-2">{d}</p>
            {rows.map((r) => <div key={r.product_id} className="flex flex-wrap justify-between text-sm py-1 border-t border-[var(--cream)]"><span>{r.name}</span><span className={r.capacity && r.qty >= r.capacity ? "text-red-700 font-medium" : ""}>{r.qty}{r.capacity ? ` / ${r.capacity} capacity` : ""} · {r.orders.join(", ")}</span></div>)}
          </Card>))}</div>
      )}
    </section>
  );
}
