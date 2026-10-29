import { useRef } from "react";
import { Heart, Plus } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { useStore } from "@/context/StoreContext";
import { peso } from "@/lib/api";
import ProductImage from "@/components/site/ProductImage";
import { StatusBadge } from "@/components/site/Reveal";
import { toast } from "sonner";

export const canAddDirect = (p) => p.kind === "regular" && p.status !== "sold_out" && p.status !== "unavailable" && p.price != null;

export default function MenuCard({ p }) {
  const { setActive, toggleFav, favs, addToCart } = useStore();
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const fav = favs.includes(p.id);

  const onMove = (e) => {
    if (reduce || e.pointerType !== "mouse") return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    ref.current.style.transform = `perspective(900px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg) translateZ(0)`;
  };
  const onLeave = () => { if (ref.current) ref.current.style.transform = ""; };

  return (
    <article
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      data-testid={`menu-card-${p.id}`}
      className="tilt-card group relative rounded-[1.4rem] bg-white border border-[var(--beige)]/80 overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setActive(p)}
        className="block w-full text-left focus-visible:outline-offset-[-4px]"
        aria-label={`View details for ${p.name}`}
        data-testid={`menu-card-open-${p.id}`}
      >
        <ProductImage product={p} className="m-2 rounded-[1.1rem]" imgClass="tilt-img" />
        <div className="px-4 pb-4 pt-1 pr-14">
          <h3 className="text-[0.98rem] leading-snug font-medium text-[var(--espresso)]">{p.name}</h3>
          <p className={`mt-1 tabular ${p.price == null ? "text-xs text-[var(--taupe)] italic" : "text-[0.95rem] text-[var(--espresso)]/85"}`}>
            {peso(p.price)}{p.is_packaging && <span className="ml-1 text-xs text-[var(--taupe)]">· packaging add-on</span>}
          </p>
        </div>
      </button>
      <div className="absolute top-4 left-4"><StatusBadge p={p} /></div>
      <button
        type="button"
        onClick={() => toggleFav(p.id)}
        aria-pressed={fav}
        aria-label={fav ? `Remove ${p.name} from favorites` : `Save ${p.name} to favorites`}
        data-testid={`fav-toggle-${p.id}`}
        className="absolute top-4 right-4 grid place-items-center h-10 w-10 rounded-full bg-white/90 backdrop-blur border border-[var(--beige)] hover:scale-105 transition-transform"
      >
        <Heart size={17} className={fav ? "fill-[var(--espresso)] text-[var(--espresso)]" : "text-[var(--espresso)]"} />
      </button>
      {canAddDirect(p) && (
        <button
          type="button"
          onClick={() => { addToCart(p.id, 1); toast.success(`${p.name} added to cart`); }}
          aria-label={`Add ${p.name} to cart`}
          data-testid={`quick-add-${p.id}`}
          className="absolute bottom-4 right-4 grid place-items-center h-10 w-10 rounded-full bg-[var(--espresso)] text-[var(--cream)] hover:scale-105 active:scale-95 transition-transform"
        >
          <Plus size={18} />
        </button>
      )}
    </article>
  );
}
