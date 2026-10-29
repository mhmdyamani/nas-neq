import { motion, useReducedMotion } from "framer-motion";

export default function Reveal({ children, delay = 0, y = 28, className = "", as = "div" }) {
  const reduce = useReducedMotion();
  const M = motion[as];
  return (
    <M
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y, rotateX: 6 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: reduce ? 0.2 : 0.8, delay, ease: [0.2, 0.7, 0.2, 1] }}
      style={{ transformPerspective: 900 }}
    >
      {children}
    </M>
  );
}

export const StatusBadge = ({ p }) => {
  const map = {
    sold_out: ["Sold out", "bg-[var(--espresso)] text-[var(--cream)]"],
    low_stock: [p.stock_left ? `Only ${p.stock_left} left` : "Low stock", "bg-amber-100 text-amber-900"],
    unavailable: ["Unavailable", "bg-neutral-200 text-neutral-700"],
    inquiry: [p.preorder ? "Pre-order" : "Made to Order", "bg-[var(--beige)] text-[var(--espresso)]"],
  };
  const m = map[p.status] || (p.preorder ? ["Pre-order", "bg-[var(--beige)] text-[var(--espresso)]"] : null);
  if (!m) return null;
  return (
    <span data-testid={`status-badge-${p.id}`} className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium tracking-wide ${m[1]}`}>
      {m[0]}
    </span>
  );
};
