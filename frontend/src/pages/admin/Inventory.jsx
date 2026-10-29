import { useState } from "react";
import { toast } from "sonner";
import { useAdmin, useLoad, H, Btn, Card } from "@/pages/admin/AdminPage";
import { Pill } from "@/pages/admin/Orders";
import { Input } from "@/components/ui/input";
import { useStore } from "@/context/StoreContext";
import { errMsg, fmtDate } from "@/lib/api";

function Row({ p, onDone, bulk, setBulk }) {
  const api = useAdmin();
  const [val, setVal] = useState("");
  const [reason, setReason] = useState("");
  const apply = async (mode) => {
    if (val === "" || !reason.trim()) return toast.error("Enter a quantity and a reason");
    try { await api("post", `/admin/products/${p.id}/stock`, { mode, value: Number(val), reason }); toast.success("Stock updated"); setVal(""); setReason(""); onDone(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Card className="p-3 grid gap-2 md:grid-cols-12 items-center" data-testid={`inventory-row-${p.id}`}>
      <div className="md:col-span-3"><p className="font-medium">{p.name}</p><div className="flex gap-1 mt-1">{p.track_stock ? <Pill dark>{p.stock} in stock</Pill> : <Pill>Not tracked</Pill>}{p.status === "low_stock" && <Pill>Low</Pill>}{p.status === "sold_out" && <Pill>Sold out</Pill>}</div></div>
      <Input className="md:col-span-2" type="number" placeholder="Qty" value={val} onChange={(e) => setVal(e.target.value)} data-testid={`stock-qty-${p.id}`} />
      <Input className="md:col-span-3" placeholder="Reason (e.g. restock)" value={reason} onChange={(e) => setReason(e.target.value)} data-testid={`stock-reason-${p.id}`} />
      <div className="md:col-span-3 flex gap-2"><Btn variant="light" onClick={() => apply("set")} data-testid={`stock-set-${p.id}`}>Set to</Btn><Btn variant="light" onClick={() => apply("adjust")} data-testid={`stock-adjust-${p.id}`}>Add / remove</Btn></div>
      <label className="md:col-span-1 text-xs flex items-center gap-1"><input type="checkbox" checked={bulk[p.id] !== undefined} onChange={(e) => setBulk((b) => { const n = { ...b }; if (e.target.checked) n[p.id] = p.stock || 0; else delete n[p.id]; return n; })} />Bulk</label>
    </Card>
  );
}

export default function Inventory() {
  const api = useAdmin();
  const { loadMenu } = useStore();
  const prods = useLoad(() => api("get", "/admin/products"), []);
  const moves = useLoad(() => api("get", "/admin/stock-moves"), []);
  const [bulk, setBulk] = useState({});
  const [reason, setReason] = useState("");
  const done = () => { prods.reload(); moves.reload(); loadMenu(); };
  const list = (prods.data || []).filter((p) => p.kind === "regular");
  const applyBulk = async () => {
    const items = Object.entries(bulk).map(([id, stock]) => ({ id, stock: Number(stock) }));
    if (!items.length || !reason.trim()) return toast.error("Select items and enter a reason");
    if (!window.confirm(`Set stock for ${items.length} item(s)?`)) return;
    try { await api("post", "/admin/stock/bulk", { items, reason }); toast.success("Bulk stock saved"); setBulk({}); done(); } catch (e) { toast.error(errMsg(e)); }
  };
  const warnings = list.filter((p) => ["low_stock", "sold_out"].includes(p.status));
  return (
    <section data-testid="admin-inventory">
      <H sub="Stock is reserved when an order is placed and restored once if it is rejected or cancelled. Items without tracking are treated as made fresh (unlimited).">Inventory</H>
      {warnings.length > 0 && <Card className="p-4 mb-5 bg-amber-50 border-amber-200" data-testid="low-stock-warning">{warnings.map((p) => <p key={p.id} className="text-sm">⚠ {p.name}: {p.status === "sold_out" ? "sold out" : `${p.stock} left`}</p>)}</Card>}
      {Object.keys(bulk).length > 0 && (
        <Card className="p-4 mb-5 space-y-2" data-testid="bulk-panel"><p className="font-medium">Bulk set stock</p>
          {Object.entries(bulk).map(([id, v]) => <div key={id} className="flex gap-2 items-center text-sm"><span className="flex-1">{list.find((p) => p.id === id)?.name}</span><Input type="number" min="0" value={v} className="w-28" onChange={(e) => setBulk({ ...bulk, [id]: e.target.value })} /></div>)}
          <div className="flex gap-2"><Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} /><Btn onClick={applyBulk} data-testid="bulk-apply-btn">Apply</Btn></div></Card>
      )}
      <div className="space-y-2">{list.map((p) => <Row key={p.id} p={p} onDone={done} bulk={bulk} setBulk={setBulk} />)}</div>
      <h2 className="font-display text-2xl mt-10 mb-3">Stock movement history</h2>
      <Card className="divide-y divide-[var(--cream)]" data-testid="stock-moves-list">
        {(moves.data || []).length === 0 ? <p className="p-4 text-sm text-[var(--taupe)]">No stock movements yet.</p> : moves.data.map((m) => (
          <div key={m.id} className="p-3 text-sm flex flex-wrap gap-x-4"><span className="text-[var(--taupe)] w-40">{fmtDate(m.at)}</span><span className="font-medium">{m.product_name}</span><span className={m.delta < 0 ? "text-red-700" : "text-green-800"}>{m.delta > 0 ? "+" : ""}{m.delta}</span><span>{m.reason}</span><span className="text-[var(--taupe)]">by {m.by}</span></div>
        ))}
      </Card>
    </section>
  );
}
