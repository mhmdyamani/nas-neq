import { useState } from "react";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, Pencil, Trash2, Plus } from "lucide-react";
import { useAdmin, useLoad, H, Btn, Card } from "@/pages/admin/AdminPage";
import { Pill } from "@/pages/admin/Orders";
import ProductEditor from "@/pages/admin/ProductEditor";
import ProductImage from "@/components/site/ProductImage";
import { useStore } from "@/context/StoreContext";
import { errMsg, peso } from "@/lib/api";

const STATUS = { available: "Available", low_stock: "Low stock", sold_out: "Sold out", unavailable: "Unavailable", inquiry: "Inquiry only" };

export default function MenuManager() {
  const api = useAdmin();
  const { menu, loadMenu } = useStore();
  const { data, reload, setData } = useLoad(() => api("get", "/admin/products"), []);
  const [edit, setEdit] = useState(undefined);

  const refresh = async () => { await reload(); loadMenu(); };
  const move = async (cat, idx, dir) => {
    const ids = data.map((p) => p.id);
    const inCat = data.filter((p) => p.category === cat);
    const a = inCat[idx], b = inCat[idx + dir];
    if (!b) return;
    const ia = ids.indexOf(a.id), ib = ids.indexOf(b.id);
    [ids[ia], ids[ib]] = [ids[ib], ids[ia]];
    setData(ids.map((id) => data.find((p) => p.id === id)));
    try { await api("post", "/admin/products/reorder", { ids }); loadMenu(); } catch (e) { toast.error(errMsg(e)); reload(); }
  };
  const del = async (p) => {
    if (!window.confirm(`Delete "${p.name}" permanently? Past orders keep their record.`)) return;
    try { await api("delete", `/admin/products/${p.id}`); toast.success("Item deleted"); refresh(); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <section data-testid="admin-menu">
      <div className="flex justify-between items-start gap-3"><H sub="Edit names, prices, notes, images and availability. Use the arrows to reorder.">Menu</H>
        <Btn onClick={() => setEdit(null)} data-testid="menu-add-item-btn"><Plus size={14} className="inline mr-1" />Add item</Btn></div>
      {!data ? <p>Loading…</p> : menu.categories.map((c) => {
        const items = data.filter((p) => p.category === c.slug);
        return (
          <div key={c.slug} className="mb-8">
            <h2 className="font-display text-xl mb-3">{c.name} <span className="text-sm text-[var(--taupe)]">({items.length})</span></h2>
            <div className="space-y-2">
              {items.map((p, i) => (
                <Card key={p.id} className="p-2 pr-3 flex items-center gap-3" data-testid={`admin-product-row-${p.id}`}>
                  <ProductImage product={p} className="w-14 h-14 rounded-lg shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{p.name}{p.hidden && <span className="text-xs text-[var(--taupe)]"> · hidden</span>}</p>
                    <div className="flex flex-wrap gap-1 mt-1 items-center text-xs"><span className="tabular">{peso(p.price)}</span><Pill>{STATUS[p.status]}</Pill>{p.is_packaging && <Pill>Packaging</Pill>}{p.preorder?.enabled && <Pill>Pre-order</Pill>}{p.track_stock && <Pill>Stock {p.stock}</Pill>}</div>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button aria-label="Move up" onClick={() => move(c.slug, i, -1)} disabled={i === 0} className="h-9 w-9 grid place-items-center rounded-full hover:bg-[var(--cream)] disabled:opacity-30" data-testid={`move-up-${p.id}`}><ArrowUp size={15} /></button>
                    <button aria-label="Move down" onClick={() => move(c.slug, i, 1)} disabled={i === items.length - 1} className="h-9 w-9 grid place-items-center rounded-full hover:bg-[var(--cream)] disabled:opacity-30" data-testid={`move-down-${p.id}`}><ArrowDown size={15} /></button>
                    <button aria-label={`Edit ${p.name}`} onClick={() => setEdit(p)} className="h-9 w-9 grid place-items-center rounded-full hover:bg-[var(--cream)]" data-testid={`edit-product-${p.id}`}><Pencil size={15} /></button>
                    <button aria-label={`Delete ${p.name}`} onClick={() => del(p)} className="h-9 w-9 grid place-items-center rounded-full hover:bg-red-50 text-red-700" data-testid={`delete-product-${p.id}`}><Trash2 size={15} /></button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
      {edit !== undefined && <ProductEditor product={edit} categories={menu.categories} onClose={() => setEdit(undefined)} onSaved={() => { setEdit(undefined); refresh(); }} />}
    </section>
  );
}
