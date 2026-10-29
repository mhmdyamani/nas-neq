import { useEffect, useState } from "react";
import MenuCard from "@/components/site/MenuCard";
import { useStore } from "@/context/StoreContext";
import { Skeleton } from "@/components/ui/skeleton";

export const PageHead = ({ eyebrow, title, children }) => (
  <div className="bg-[var(--cream)] pt-32 pb-12 md:pt-40 md:pb-16">
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl mt-3 text-[var(--espresso)] leading-[1.02]">{title}</h1>
      {children && <div className="mt-5 max-w-2xl text-[var(--espresso)]/80">{children}</div>}
    </div>
  </div>
);

export default function Menu() {
  const { menu, menuLoading } = useStore();
  const [current, setCurrent] = useState("");

  useEffect(() => {
    const obs = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setCurrent(e.target.id)), { rootMargin: "-40% 0px -55% 0px" });
    menu.categories.forEach((c) => { const el = document.getElementById(c.slug); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [menu.categories]);

  return (
    <main data-testid="menu-page">
      <PageHead eyebrow="Menu & prices" title="Our Menu">
        All prices in Philippine pesos. Tap any item for details. Photos are illustrative.
      </PageHead>
      <nav className="sticky top-[72px] z-30 bg-white/90 backdrop-blur-xl border-b border-[var(--beige)]" aria-label="Menu categories">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 flex gap-2 overflow-x-auto no-scrollbar py-3">
          {menu.categories.map((c) => (
            <a key={c.slug} href={`#${c.slug}`} data-testid={`category-pill-${c.slug}`}
              className={`whitespace-nowrap rounded-full px-4 h-10 inline-flex items-center text-sm border transition-colors ${current === c.slug ? "bg-[var(--espresso)] text-[var(--cream)] border-[var(--espresso)]" : "border-[var(--beige)] hover:border-[var(--sand)]"}`}>
              {c.name}
            </a>
          ))}
        </div>
      </nav>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 pb-24">
        {menuLoading && <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-12">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-[4/5] rounded-3xl" />)}</div>}
        {menu.categories.map((c) => {
          const items = menu.products.filter((p) => p.category === c.slug);
          const food = items.filter((p) => !p.is_packaging);
          const pack = items.filter((p) => p.is_packaging);
          return (
            <section key={c.slug} id={c.slug} className="scroll-mt-40 pt-14" data-testid={`menu-category-${c.slug}`}>
              <div className="flex items-baseline gap-3 flex-wrap mb-6">
                <h2 className="font-display text-3xl sm:text-4xl text-[var(--espresso)]">{c.name}</h2>
                {c.note && <span className="text-sm text-[var(--taupe)]">({c.note})</span>}
                <span className="text-sm text-[var(--taupe)]">· {food.length} items</span>
              </div>
              {c.slug === "made-to-order" && <p className="mb-6 text-sm text-[var(--espresso)]/80">Made to Order — prices to be confirmed. Send an inquiry from the item or the Made-to-Order page.</p>}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
                {food.map((p) => <MenuCard key={p.id} p={p} />)}
              </div>
              {pack.length > 0 && (
                <div className="mt-5">
                  <p className="eyebrow mb-3">Packaging add-ons</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">{pack.map((p) => <MenuCard key={p.id} p={p} />)}</div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
