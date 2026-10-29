import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Heart, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useStore } from "@/context/StoreContext";
import { peso } from "@/lib/api";
import ProductImage from "@/components/site/ProductImage";
import { StatusBadge } from "@/components/site/Reveal";

export const Stepper = ({ value, onChange, max, testid }) => (
  <div className="inline-flex items-center rounded-full border border-[var(--sand)]" data-testid={testid}>
    <button type="button" aria-label="Decrease quantity" className="h-11 w-11 grid place-items-center" onClick={() => onChange(Math.max(1, value - 1))}><Minus size={16} /></button>
    <span className="w-8 text-center tabular" aria-live="polite">{value}</span>
    <button type="button" aria-label="Increase quantity" className="h-11 w-11 grid place-items-center disabled:opacity-30" disabled={max != null && value >= max} onClick={() => onChange(value + 1)}><Plus size={16} /></button>
  </div>
);

export default function ProductDialog() {
  const { active: p, setActive, menu, addToCart, toggleFav, favs, setCartOpen } = useStore();
  const [qty, setQty] = useState(1);
  useEffect(() => setQty(1), [p?.id]);
  if (!p) return null;
  const cat = menu.categories.find((c) => c.slug === p.category);
  const fav = favs.includes(p.id);
  const orderable = p.status !== "sold_out" && p.status !== "unavailable" && p.price != null && (p.kind === "regular" || p.preorder);
  const max = p.status === "low_stock" ? p.stock_left : p.preorder?.max_qty || undefined;

  return (
    <Dialog open={!!p} onOpenChange={(o) => !o && setActive(null)}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden rounded-[1.6rem] max-h-[92vh] overflow-y-auto" data-testid="product-dialog">
        <div className="grid md:grid-cols-2">
          <div className="bg-white p-4 md:p-6">
            <ProductImage product={p} size="main" eager className="rounded-[1.2rem]" />
            <p className="mt-2 text-[11px] text-[var(--taupe)] text-center">Illustrative image — actual item may differ.</p>
          </div>
          <div className="p-6 md:p-8 bg-[var(--cream)] flex flex-col gap-4">
            <p className="eyebrow">{cat?.name}{cat?.note ? ` (${cat.note})` : ""}</p>
            <DialogTitle className="font-display text-3xl leading-tight text-[var(--espresso)]">{p.name}</DialogTitle>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xl tabular" data-testid="product-dialog-price">{peso(p.price)}</span>
              <StatusBadge p={p} />
            </div>
            <DialogDescription className="text-sm text-[var(--espresso)]/80 leading-relaxed">
              {p.description || (p.kind === "inquiry" && !p.preorder ? "Made to order. Price and details are confirmed directly with Nas&Neq." : "")}
            </DialogDescription>
            {p.notes && <p className="text-sm"><span className="font-medium">Note:</span> {p.notes}</p>}
            {p.options?.length > 0 && <p className="text-sm"><span className="font-medium">Options:</span> {p.options.join(" · ")}</p>}
            {p.preorder && <p className="text-sm">Pre-order with at least {p.preorder.lead_days} day(s) notice{p.preorder.max_qty ? ` · max ${p.preorder.max_qty} per order` : ""}.</p>}
            <div className="mt-auto pt-4 flex flex-wrap items-center gap-3">
              {orderable && <Stepper value={qty} onChange={setQty} max={max} testid="product-dialog-qty" />}
              {orderable ? (
                <button
                  data-testid="product-dialog-add-btn"
                  className="flex-1 min-w-[10rem] h-12 rounded-full bg-[var(--espresso)] text-[var(--cream)] font-medium hover:bg-[#3a281e] transition-colors"
                  onClick={() => { addToCart(p.id, qty); toast.success(`${p.name} added to cart`); setActive(null); setCartOpen(true); }}
                >
                  {p.preorder ? "Add pre-order to cart" : "Add to cart"}
                </button>
              ) : p.kind === "inquiry" ? (
                <Link to={`/made-to-order?product=${encodeURIComponent(p.name)}#inquiry`} onClick={() => setActive(null)} data-testid="product-dialog-inquire-btn"
                  className="flex-1 h-12 rounded-full bg-[var(--espresso)] text-[var(--cream)] grid place-items-center font-medium">Send an inquiry</Link>
              ) : (
                <p className="text-sm text-[var(--taupe)]">This item can't be ordered online right now.</p>
              )}
              <button onClick={() => toggleFav(p.id)} aria-pressed={fav} data-testid="product-dialog-fav-btn"
                className="h-12 w-12 rounded-full border border-[var(--sand)] grid place-items-center" aria-label={fav ? "Remove from favorites" : "Save to favorites"}>
                <Heart size={18} className={fav ? "fill-[var(--espresso)]" : ""} />
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
