import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAdmin, useLoad, H, Btn, Card } from "@/pages/admin/AdminPage";
import Orders from "@/pages/admin/Orders";
import { peso, fmtDate, manilaToday, addDays, errMsg, SERVICE_LABELS, PAY_LABELS } from "@/lib/api";

const ranges = () => {
  const t = manilaToday();
  const [y, m] = t.split("-").map(Number);
  const first = `${t.slice(0, 8)}01`;
  const pm = new Date(y, m - 2, 1), pmEnd = new Date(y, m - 1, 0);
  const f = (d) => d.toLocaleDateString("en-CA");
  return { Today: [t, t], "Last 7 Days": [addDays(t, -6), t], "Last 30 Days": [addDays(t, -29), t], "This Month": [first, t], "Previous Month": [f(pm), f(pmEnd)] };
};

const Metric = ({ label, value, hint, onClick, testid }) => (
  <button onClick={onClick} className="text-left" data-testid={testid} disabled={!onClick}>
    <Card className="p-4 h-full hover:border-[var(--sand)]"><p className="text-xs text-[var(--taupe)]">{label}</p><p className="font-display text-2xl mt-1 tabular">{value}</p>{hint && <p className="text-[11px] text-[var(--taupe)] mt-1">{hint}</p>}</Card>
  </button>
);

export default function Sales() {
  const api = useAdmin();
  const R = useMemo(ranges, []);
  const [range, setRange] = useState(R["Last 30 Days"]);
  const [preset, setPreset] = useState("Last 30 Days");
  const [drill, setDrill] = useState(null);
  const [from, to] = range;
  const { data: a, error } = useLoad(() => api("get", `/admin/analytics?from=${from}&to=${to}`), [from, to]);
  const pick = (k) => { setPreset(k); setRange(R[k]); };
  const exportCsv = async () => {
    try {
      const blob = await api("get", `/admin/analytics/export.csv?from=${from}&to=${to}`, undefined, { responseType: "blob" });
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement("a"), { href: url, download: `nasneq-orders-${from}-${to}.csv` }).click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(errMsg(e)); }
  };
  const open = (title, filters) => setDrill({ title, filters: { from, to, ...filters } });

  return (
    <section data-testid="admin-sales">
      <H sub="Built only from real orders saved on this website. Payments are as recorded by you. Profit is not shown (no cost data).">Sales & Analytics</H>
      <div className="flex flex-wrap gap-2 mb-6 items-center">
        {Object.keys(R).map((k) => <Btn key={k} variant={preset === k ? "dark" : "light"} onClick={() => pick(k)} data-testid={`range-${k.toLowerCase().replace(/ /g, "-")}`}>{k}</Btn>)}
        <Input type="date" value={from} onChange={(e) => { setPreset("Custom"); setRange([e.target.value, to]); }} className="w-auto rounded-full" aria-label="From" data-testid="sales-from-date" />
        <Input type="date" value={to} onChange={(e) => { setPreset("Custom"); setRange([from, e.target.value]); }} className="w-auto rounded-full" aria-label="To" data-testid="sales-to-date" />
        <Btn variant="light" onClick={exportCsv} data-testid="sales-export-csv-btn"><Download size={14} className="inline mr-1" />Export CSV</Btn>
      </div>
      {error && <p className="text-red-700">{String(error)}</p>}
      {!a ? <p>Loading…</p> : (
        <div className="space-y-8">
          <p className="text-xs text-[var(--taupe)]">Period {from} → {to} · {a.period.timezone} · updated {fmtDate(a.generated_at)}</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Metric label="Gross order value" value={peso(a.gross_order_value)} hint="All orders placed, any status" onClick={() => open("All orders", {})} testid="metric-gross" />
            <Metric label="Net sales" value={peso(a.net_sales)} hint="Completed, not refunded" onClick={() => open("Completed orders", { status: "completed" })} testid="metric-net-sales" />
            <Metric label="Payments received" value={peso(a.payments_received)} hint="Recorded as paid" onClick={() => open("Paid orders", { payment: "paid" })} testid="metric-paid" />
            <Metric label="Outstanding" value={peso(a.outstanding)} hint="Open orders, unpaid/failed" onClick={() => open("Unpaid open orders", { payment: "pending,failed", status: "pending,accepted,preparing,ready,out_for_delivery" })} testid="metric-outstanding" />
            <Metric label="Average order value" value={peso(a.aov)} hint="Net sales ÷ completed orders" testid="metric-aov" />
            <Metric label="Refunds" value={peso(a.refunds)} onClick={() => open("Refunded orders", { payment: "refunded" })} testid="metric-refunds" />
            <Metric label="Orders received" value={a.counts.received} hint={`${a.counts.accepted + a.counts.preparing + a.counts.ready + a.counts.out_for_delivery} in progress · ${a.counts.completed} completed`} onClick={() => open("All orders", {})} testid="metric-orders" />
            <Metric label="Cancelled / rejected" value={`${a.counts.cancelled} / ${a.counts.rejected}`} onClick={() => open("Cancelled or rejected", { status: "cancelled,rejected" })} testid="metric-cancelled" />
            <Metric label="Pre-order requests" value={`${a.preorders.requests} (${a.preorders.accepted} accepted)`} hint={`Paid ${peso(a.preorders.payments)}`} onClick={() => open("Pre-orders", { type: "preorder" })} testid="metric-preorders" />
            <Metric label="Low stock / sold out" value={`${a.inventory.low_stock} / ${a.inventory.sold_out}`} hint="Operational, not sales" testid="metric-inventory" />
          </div>
          <Card className="p-4"><p className="font-medium mb-3">Sales over time</p>
            {a.by_day.length ? <div className="h-64"><ResponsiveContainer><BarChart data={a.by_day}><CartesianGrid strokeDasharray="3 3" stroke="#eee" /><XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} /><Tooltip formatter={(v) => peso(v)} /><Bar dataKey="gross" name="Gross order value" fill="#D8C5AD" radius={[6, 6, 0, 0]} /><Bar dataKey="recognized" name="Net sales" fill="#4A3528" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
              : <p className="text-sm text-[var(--taupe)] py-10 text-center" data-testid="sales-empty">No orders in this period yet.</p>}</Card>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="p-4"><p className="font-medium mb-3">Products (completed orders)</p>
              <div className="max-h-96 overflow-y-auto divide-y divide-[var(--cream)]">{a.top_products.map((p, i) => (
                <button key={p.product_id} onClick={() => open(`Orders with ${p.name}`, { product_id: p.product_id })} className="w-full flex justify-between text-sm py-2 hover:bg-[var(--cream)] px-2 rounded" data-testid={`top-product-${p.product_id}`}>
                  <span>{i + 1}. {p.name}</span><span className="tabular">{p.qty} sold · {peso(p.revenue)}</span></button>))}</div></Card>
            <div className="space-y-4">
              <Card className="p-4"><p className="font-medium mb-3">Categories</p>{a.categories.map((c) => <button key={c.category} onClick={() => open(`Orders in ${c.name}`, { category: c.category })} className="w-full flex justify-between text-sm py-1.5 hover:bg-[var(--cream)] px-2 rounded"><span>{c.name}</span><span className="tabular">{c.qty} · {peso(c.revenue)}</span></button>)}</Card>
              <Card className="p-4 text-sm grid grid-cols-2 gap-4"><div><p className="font-medium mb-2">By service</p>{Object.entries(a.by_fulfillment).map(([k, v]) => <p key={k}>{SERVICE_LABELS[k]}: {v}</p>)}{!Object.keys(a.by_fulfillment).length && <p className="text-[var(--taupe)]">—</p>}</div>
                <div><p className="font-medium mb-2">By payment</p>{Object.entries(a.by_payment).map(([k, v]) => <p key={k}>{PAY_LABELS[k]}: {v}</p>)}{!Object.keys(a.by_payment).length && <p className="text-[var(--taupe)]">—</p>}</div></Card>
            </div>
          </div>
          <Card className="p-4 text-xs space-y-1" data-testid="metric-definitions"><p className="font-medium text-sm mb-2">How figures are calculated</p>{Object.entries(a.definitions).map(([k, v]) => <p key={k}><strong>{k.replace(/_/g, " ")}:</strong> {v}</p>)}</Card>
        </div>
      )}
      {drill && (
        <Dialog open onOpenChange={(v) => !v && setDrill(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="sales-drilldown">
            <DialogTitle className="font-display text-2xl">{drill.title}</DialogTitle><DialogDescription>{from} → {to}</DialogDescription>
            <Orders preset={{ ...drill.filters, embedded: "1" }} />
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
