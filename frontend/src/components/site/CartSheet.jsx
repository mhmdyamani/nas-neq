import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trash2, ShoppingBag } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useStore } from "@/context/StoreContext";
import { http, peso } from "@/lib/api";
import { Stepper } from "@/components/site/ProductDialog";
import ProductImage from "@/components/site/ProductImage";

export function useCartCheck() {
  const { cart } = useStore();
  const [check, setCheck] = useState(null);
  useEffect(() => {
    if (!cart.length) return setCheck({ lines: [], problems: [], subtotal: 0 });
    let stop = false;
    http.post("/cart/validate", { items: cart }).then((r) => !stop && setCheck(r.data)).catch(() => !stop && setCheck(null));
    return () => { stop = true; };
  }, [cart]);
  return check;
}

export default function CartSheet() {
  const { cartOpen, setCartOpen, cart, byId, setQty } = useStore();
  const check = useCartCheck();
  const problemFor = (pid) => check?.problems.find((x) => x.product_id === pid);
  const general = check?.problems.filter((x) => !x.product_id) || [];

  return (
    <Sheet open={cartOpen} onOpenChange={setCartOpen}>
      <SheetContent className="w-full sm:max-w-md flex flex-col bg-white" data-testid="cart-sheet">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl">Your cart</SheetTitle>
          <SheetDescription>Prices and availability are re-checked when you place your order.</SheetDescription>
        </SheetHeader>
        {!cart.length ? (
          <div className="flex-1 grid place-items-center text-center gap-3" data-testid="cart-empty">
            <div><ShoppingBag className="mx-auto text-[var(--sand)]" size={42} /><p className="mt-3">Your cart is empty.</p>
              <Link to="/menu" onClick={() => setCartOpen(false)} className="mt-4 inline-block underline">Browse the menu</Link></div>
          </div>
        ) : (
          <>
            <ul className="flex-1 overflow-y-auto divide-y divide-[var(--cream)] -mx-2 px-2">
              {cart.map((c) => {
                const p = byId[c.product_id];
                const prob = problemFor(c.product_id);
                return (
                  <li key={c.product_id} className="py-4 flex gap-3" data-testid={`cart-line-${c.product_id}`}>
                    {p && <ProductImage product={p} className="w-20 h-20 shrink-0 rounded-xl border border-[var(--cream)]" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium leading-snug">{p?.name || "Unavailable item"}</p>
                      <p className="text-sm text-[var(--taupe)] tabular">{p ? peso(p.price) : ""} each{p?.is_packaging ? " · packaging" : ""}{p?.preorder ? " · pre-order" : ""}</p>
                      {prob && <p className="text-xs text-red-700 mt-1" role="alert" data-testid={`cart-problem-${c.product_id}`}>{prob.message}</p>}
                      <div className="mt-2 flex items-center justify-between">
                        <Stepper value={c.qty} onChange={(q) => setQty(c.product_id, q)} max={prob?.max_qty} testid={`cart-qty-${c.product_id}`} />
                        <button aria-label="Remove item" data-testid={`cart-remove-${c.product_id}`} onClick={() => setQty(c.product_id, 0)} className="h-10 w-10 grid place-items-center rounded-full hover:bg-[var(--cream)]"><Trash2 size={16} /></button>
                      </div>
                    </div>
                    <p className="tabular text-sm">{p?.price != null ? peso(p.price * c.qty) : ""}</p>
                  </li>
                );
              })}
            </ul>
            {general.map((g) => <p key={g.message} className="text-sm text-red-700" role="alert">{g.message}</p>)}
            <div className="border-t border-[var(--beige)] pt-4 space-y-3">
              <div className="flex justify-between text-lg"><span>Subtotal</span><span className="tabular" data-testid="cart-subtotal">{check ? peso(check.subtotal) : "…"}</span></div>
              <p className="text-xs text-[var(--taupe)]">No taxes or fees are added beyond the menu prices and any delivery fee set by Nas&Neq.</p>
              <Link
                to="/checkout"
                onClick={() => setCartOpen(false)}
                data-testid="cart-checkout-btn"
                aria-disabled={!check || check.problems.length > 0}
                className={`flex h-12 items-center justify-center rounded-full font-medium ${check && !check.problems.length ? "bg-[var(--espresso)] text-[var(--cream)]" : "bg-[var(--beige)] text-[var(--taupe)] pointer-events-none"}`}
              >
                Continue to checkout
              </Link>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
