import { Link } from "react-router-dom";
import { Phone, MapPin, Clock, Facebook } from "lucide-react";
import { Logo } from "@/components/site/Header";
import { BUSINESS } from "@/lib/api";
import { useStore } from "@/context/StoreContext";

export default function Footer() {
  const { settings } = useStore();
  const year = new Date().getFullYear();
  return (
    <footer className="bg-[var(--cream)] border-t border-[var(--beige)]" data-testid="site-footer">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 py-16 grid gap-12 md:grid-cols-12">
        <div className="md:col-span-4 space-y-4">
          <Logo className="h-16" />
          <p className="text-sm text-[var(--taupe)] max-w-xs leading-relaxed">
            A bakery and café serving espresso, pastries, snacks, meals, beverages, and desserts in Culiat, Quezon City.
          </p>
        </div>
        <div className="md:col-span-2 space-y-3 text-sm">
          <p className="eyebrow">Explore</p>
          {[["/", "Home"], ["/menu", "Menu"], ["/made-to-order", "Made to Order"], ["/our-story", "Our Story"], ["/contact", "Contact"], ["/account", "Track an order"]].map(([to, l]) => (
            <Link key={to} to={to} className="block hover:underline underline-offset-4">{l}</Link>
          ))}
        </div>
        <div className="md:col-span-3 space-y-3 text-sm">
          <p className="eyebrow">Services</p>
          <p className="leading-relaxed">In-store pickup · Dine-in · Takeout · Delivery · Contactless delivery</p>
          <p className="text-xs text-[var(--taupe)]">Delivery details are confirmed by Nas&Neq per order.</p>
        </div>
        <div className="md:col-span-3 space-y-3 text-sm">
          <p className="eyebrow">Visit & contact</p>
          <p className="flex gap-2"><MapPin size={16} className="mt-0.5 shrink-0" />{BUSINESS.address}</p>
          <a href={`tel:${BUSINESS.tel}`} className="flex gap-2 hover:underline" data-testid="footer-phone-link"><Phone size={16} />{BUSINESS.phone}</a>
          <p className="flex gap-2"><Clock size={16} />{settings?.hours_text || "9AM–12AM"}</p>
          <a href={BUSINESS.facebook} target="_blank" rel="noopener noreferrer" className="flex gap-2 hover:underline" data-testid="footer-facebook-link"><Facebook size={16} />Nas&Neq on Facebook</a>
        </div>
      </div>
      <div className="border-t border-[var(--beige)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 py-6 flex flex-col sm:flex-row gap-2 justify-between text-xs text-[var(--taupe)]">
          <p>© {year} Nas&Neq. All rights reserved.</p>
          <p>Menu photos are illustrative and may differ from the actual items served.</p>
        </div>
      </div>
    </footer>
  );
}
