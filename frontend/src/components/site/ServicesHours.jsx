import { MapPin, Phone, Clock, Facebook, Store, Utensils, ShoppingBag, Truck, HandHeart } from "lucide-react";
import { BUSINESS } from "@/lib/api";
import { useStore } from "@/context/StoreContext";
import Reveal from "@/components/site/Reveal";

const SERVICES = [
  ["pickup", "In-store pickup", Store],
  ["dine_in", "Dine-in", Utensils],
  ["takeout", "Takeout", ShoppingBag],
  ["delivery", "Delivery", Truck],
  ["contactless", "Contactless delivery", HandHeart],
];

export default function ServicesHours({ id = "services" }) {
  const { settings } = useStore();
  return (
    <section id={id} className="relative bg-[var(--beige)] grain overflow-hidden" data-testid="services-hours-section">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 py-20 md:py-28 grid gap-12 lg:grid-cols-12">
        <Reveal className="lg:col-span-5">
          <p className="eyebrow">Visit · Order · Enjoy</p>
          <h2 className="font-display text-4xl sm:text-5xl text-[var(--espresso)] mt-4 leading-[1.05]">Find us in Culiat.</h2>
          <div className="mt-8 space-y-4 text-[var(--espresso)]">
            <p className="flex gap-3"><MapPin className="shrink-0 mt-1" size={18} /><span data-testid="business-address">{BUSINESS.address}</span></p>
            <a className="flex gap-3 items-center hover:underline underline-offset-4" href={`tel:${BUSINESS.tel}`} data-testid="business-phone-link"><Phone size={18} />{BUSINESS.phone}</a>
            <p className="flex gap-3 items-center" data-testid="business-hours"><Clock size={18} />Open {settings?.hours_text || "9AM–12AM"}</p>
            <a className="flex gap-3 items-center hover:underline underline-offset-4" href={BUSINESS.facebook} target="_blank" rel="noopener noreferrer" data-testid="business-facebook-link"><Facebook size={18} />Message us on Facebook</a>
          </div>
        </Reveal>
        <div className="lg:col-span-7 grid sm:grid-cols-2 gap-3">
          {SERVICES.map(([k, label, Icon], i) => {
            const online = settings?.services?.[k]?.enabled;
            return (
              <Reveal key={k} delay={i * 0.06}>
                <div className="h-full rounded-2xl bg-white/80 backdrop-blur border border-white p-5 flex gap-4" data-testid={`service-card-${k}`}>
                  <span className="h-11 w-11 rounded-full bg-[var(--cream)] grid place-items-center shrink-0"><Icon size={19} /></span>
                  <div>
                    <p className="font-medium">{label}</p>
                    <p className="text-xs text-[var(--taupe)] mt-1">{online ? "Available for online orders" : "Offered by Nas&Neq — ask us for details"}</p>
                  </div>
                </div>
              </Reveal>
            );
          })}
          <Reveal delay={0.3}>
            <div className="h-full rounded-2xl border border-dashed border-[var(--espresso)]/25 p-5 text-sm text-[var(--espresso)]/80">
              Delivery areas, fees and timing are confirmed by Nas&Neq. Order online, or call us to arrange.
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
