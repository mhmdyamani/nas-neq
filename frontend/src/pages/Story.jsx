import { Link } from "react-router-dom";
import { PageHead } from "@/pages/Menu";
import Reveal from "@/components/site/Reveal";
import ProductImage from "@/components/site/ProductImage";
import { useStore } from "@/context/StoreContext";

const PILLARS = [
  ["Espresso & iced coffee", "From an Iced Americano to an Iced Tiramisu Latte — and a Matcha Latte for the no-coffee crowd."],
  ["Snacks & meals", "Chicken wings with rice, poppers, chicken skin, and bilao bundles for sharing."],
  ["Sweets & bakes", "Waffles, halo-halo, and made-to-order cakes, cookies, bars and brownies."],
];

export default function Story() {
  const { menu } = useStore();
  const pick = ["Blueberry Cheesecake", "Iced Caramel Macchiato", "Bundle A Bilao 32 pcs"].map((n) => menu.products.find((p) => p.name === n)).filter(Boolean);
  return (
    <main data-testid="story-page">
      <PageHead eyebrow="Our Story" title="Coffee, bakes & good food — under one roof.">
        Nas&Neq is a bakery and café in Culiat, Quezon City, offering espresso, snacks, meals, pastries, beverages, and desserts.
      </PageHead>
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 py-20 grid md:grid-cols-3 gap-6">
        {PILLARS.map(([t, d], i) => (
          <Reveal key={t} delay={i * 0.1}>
            <div className="h-full rounded-3xl border border-[var(--beige)] p-8">
              <p className="font-display text-5xl text-[var(--sand)]">0{i + 1}</p>
              <h2 className="font-display text-2xl mt-6">{t}</h2>
              <p className="mt-3 text-[var(--espresso)]/80">{d}</p>
            </div>
          </Reveal>
        ))}
      </section>
      <section className="bg-[var(--cream)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 py-20 grid md:grid-cols-3 gap-5">
          {pick.map((p, i) => (
            <Reveal key={p.id} delay={i * 0.1}><div className="rounded-3xl bg-white p-3"><ProductImage product={p} className="rounded-2xl" /><p className="px-2 py-3 text-sm">{p.name}</p></div></Reveal>
          ))}
        </div>
        <div className="mx-auto max-w-3xl px-4 pb-20 text-center">
          <p className="text-[var(--espresso)]/80">Whether you're dining in, picking up, or ordering for the family, we'd love to serve you.</p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/menu" className="h-12 px-7 rounded-full bg-[var(--espresso)] text-[var(--cream)] inline-flex items-center justify-center">Explore Our Menu</Link>
            <Link to="/contact" className="h-12 px-7 rounded-full border border-[var(--sand)] inline-flex items-center justify-center">Visit us</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
