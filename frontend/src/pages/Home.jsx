import { useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import HeroVideo from "@/components/site/HeroVideo";
import MenuCard from "@/components/site/MenuCard";
import Reveal from "@/components/site/Reveal";
import ProductImage from "@/components/site/ProductImage";
import ServicesHours from "@/components/site/ServicesHours";
import { useStore } from "@/context/StoreContext";

const FEATURED = ["Iced Spanish Latte", "3 pcs with rice (Flavored)", "Matcha Frappe", "Overload (16 oz)", "Chocolate", "Regular Poppers (Flavored)", "Strawberry Fizz", "Java Chips Frappe"];

function Featured() {
  const { menu } = useStore();
  const items = FEATURED.map((n) => menu.products.find((p) => p.name === n)).filter(Boolean);
  return (
    <section id="featured" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 py-20 md:py-28" data-testid="featured-section">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <Reveal>
          <p className="eyebrow">From the menu</p>
          <h2 className="font-display text-4xl sm:text-5xl mt-3 text-[var(--espresso)] max-w-xl leading-[1.05]">A little of everything we pour, fry & bake.</h2>
        </Reveal>
        <Link to="/menu" className="inline-flex items-center gap-2 text-[var(--espresso)] font-medium hover:gap-3 transition-[gap]" data-testid="featured-full-menu-link">See the full menu <ArrowRight size={18} /></Link>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        {items.map((p, i) => <Reveal key={p.id} delay={(i % 4) * 0.08}><MenuCard p={p} /></Reveal>)}
      </div>
    </section>
  );
}

function Intro() {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const { menu } = useStore();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y1 = useTransform(scrollYProgress, [0, 1], [60, -60]);
  const y2 = useTransform(scrollYProgress, [0, 1], [-30, 50]);
  const a = menu.products.find((p) => p.name === "Iced Cafe Latte");
  const b = menu.products.find((p) => p.name === "Classic");
  return (
    <section ref={ref} className="bg-[var(--cream)] overflow-hidden" data-testid="brand-intro-section">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 py-24 md:py-32 grid lg:grid-cols-12 gap-14 items-center">
        <div className="lg:col-span-6 relative h-[340px] sm:h-[460px]">
          {a && <motion.div style={reduce ? undefined : { y: y1 }} className="absolute left-0 top-0 w-[62%] rounded-[2rem] bg-white p-3 shadow-[0_40px_80px_-40px_rgba(74,53,40,.4)]"><ProductImage product={a} className="rounded-[1.5rem]" /></motion.div>}
          {b && <motion.div style={reduce ? undefined : { y: y2 }} className="absolute right-0 bottom-0 w-[52%] rounded-[2rem] bg-white p-3 shadow-[0_40px_80px_-40px_rgba(74,53,40,.4)] rotate-[3deg]"><ProductImage product={b} className="rounded-[1.5rem]" /></motion.div>}
        </div>
        <Reveal className="lg:col-span-6">
          <p className="eyebrow">Nas&Neq</p>
          <h2 className="font-display text-4xl sm:text-5xl mt-4 leading-[1.05] text-[var(--espresso)]">A bakery & café in Culiat.</h2>
          <p className="mt-6 text-[var(--espresso)]/80 leading-relaxed max-w-lg">
            Nas&Neq is a bakery and café serving espresso and iced coffee, blended drinks, chicken wings and poppers, waffles, halo-halo and made-to-order bakes. Drop by for a coffee, stay for a meal, or take something sweet home.
          </p>
          <Link to="/our-story" className="mt-8 inline-flex items-center gap-2 font-medium" data-testid="intro-story-link">More about Nas&Neq <ArrowRight size={18} /></Link>
        </Reveal>
      </div>
    </section>
  );
}

function MtoPreview() {
  const { menu } = useStore();
  const items = menu.products.filter((p) => p.category === "made-to-order");
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 py-24 md:py-32" data-testid="mto-preview-section">
      <div className="grid lg:grid-cols-12 gap-10">
        <Reveal className="lg:col-span-4 lg:sticky lg:top-28 self-start">
          <p className="eyebrow">Made to Order</p>
          <h2 className="font-display text-4xl sm:text-5xl mt-4 leading-[1.05] text-[var(--espresso)]">Bakes, made when you ask.</h2>
          <p className="mt-5 text-[var(--espresso)]/80">These nine bakes are marked “Made to Order”. Send us an inquiry and Nas&Neq will confirm price, quantity and timing with you.</p>
          <Link to="/made-to-order" className="mt-8 inline-flex h-12 px-7 rounded-full bg-[var(--espresso)] text-[var(--cream)] items-center font-medium" data-testid="mto-preview-cta">View Made-to-Order Bakes</Link>
        </Reveal>
        <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-5">
          {items.map((p, i) => <Reveal key={p.id} delay={(i % 3) * 0.08}><MenuCard p={p} /></Reveal>)}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <main data-testid="home-page">
      <HeroVideo />
      <Featured />
      <Intro />
      <MtoPreview />
      <ServicesHours />
    </main>
  );
}
