import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Show, UserButton } from "@clerk/react";
import { Heart, ShoppingBag, Menu as MenuIcon, X, User, LayoutDashboard } from "lucide-react";
import { useStore } from "@/context/StoreContext";

const NAV = [
  ["/", "Home"],
  ["/menu", "Menu"],
  ["/made-to-order", "Made to Order"],
  ["/our-story", "Our Story"],
  ["/contact", "Contact"],
  ["/contact#services", "Services & Ordering"],
];

export const Logo = ({ className = "h-10" }) => (
  <img src="/media/logo-mark.png" alt="Nas&Neq logo" className={`${className} w-auto select-none`} draggable="false" />
);

const IconBtn = ({ children, ...p }) => (
  <button className="relative grid place-items-center h-11 w-11 rounded-full hover:bg-[var(--cream)] transition-colors" {...p}>
    {children}
  </button>
);

export default function Header() {
  const { cartCount, setCartOpen, favs, me } = useStore();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header
      data-testid="site-header"
      className={`fixed top-0 inset-x-0 z-50 transition-[background-color,box-shadow] duration-500 ${
        scrolled || open ? "bg-white/85 backdrop-blur-xl shadow-[0_1px_0_rgba(74,53,40,.08)]" : "bg-white/40 backdrop-blur-md"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 h-[72px] flex items-center gap-4">
        <Link to="/" data-testid="header-logo-link" aria-label="Nas&Neq home" className="shrink-0">
          <Logo className="h-11" />
        </Link>
        <nav className="hidden lg:flex items-center gap-1 ml-6" aria-label="Main">
          {NAV.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end
              data-testid={`nav-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              className={({ isActive }) =>
                `px-3 py-2 rounded-full text-[0.92rem] transition-colors ${isActive && !to.includes("#") ? "bg-[var(--cream)] text-[var(--espresso)]" : "text-[var(--espresso)]/75 hover:text-[var(--espresso)]"}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          {me?.role === "admin" && (
            <Link to="/admin" data-testid="header-admin-link" className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm hover:bg-[var(--cream)]">
              <LayoutDashboard size={16} /> Dashboard
            </Link>
          )}
          <Link to="/favorites" aria-label="Favorites" data-testid="header-favorites-link" className="relative grid place-items-center h-11 w-11 rounded-full hover:bg-[var(--cream)]">
            <Heart size={20} />
            {favs.length > 0 && <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-[var(--espresso)]" />}
          </Link>
          <IconBtn aria-label={`Open cart, ${cartCount} items`} data-testid="header-cart-button" onClick={() => setCartOpen(true)}>
            <ShoppingBag size={20} />
            {cartCount > 0 && (
              <span data-testid="cart-count" className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-[var(--espresso)] text-[var(--cream)] text-[11px] grid place-items-center tabular">
                {cartCount}
              </span>
            )}
          </IconBtn>
          <Show when="signed-in">
            <Link to="/account" className="hidden sm:grid place-items-center h-11 px-3 text-sm rounded-full hover:bg-[var(--cream)]" data-testid="header-account-link">Account</Link>
            <div className="ml-1"><UserButton /></div>
          </Show>
          <Show when="signed-out">
            <Link to="/sign-in" aria-label="Sign in" data-testid="header-signin-link" className="grid place-items-center h-11 w-11 rounded-full hover:bg-[var(--cream)]">
              <User size={20} />
            </Link>
          </Show>
          <Link
            to="/menu"
            data-testid="header-explore-menu-btn"
            className="hidden md:inline-flex ml-2 items-center rounded-full bg-[var(--espresso)] text-[var(--cream)] px-5 h-11 text-sm font-medium hover:bg-[#3a281e] transition-colors"
          >
            Explore Our Menu
          </Link>
          <button aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} data-testid="mobile-menu-toggle" onClick={() => setOpen((o) => !o)}
            className="lg:hidden grid place-items-center h-11 w-11 rounded-full hover:bg-[var(--cream)]">
            {open ? <X size={22} /> : <MenuIcon size={22} />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="lg:hidden border-t border-[var(--beige)] bg-white px-4 pb-6 pt-2" aria-label="Mobile" data-testid="mobile-nav">
          {NAV.map(([to, label]) => (
            <Link key={to} to={to} className="block py-3.5 text-lg font-display border-b border-[var(--cream)]" data-testid={`mobile-nav-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
              {label}
            </Link>
          ))}
          <Link to="/account" className="block py-3.5 text-lg font-display border-b border-[var(--cream)]">My account & orders</Link>
          {me?.role === "admin" && <Link to="/admin" className="block py-3.5 text-lg font-display">Owner dashboard</Link>}
          <Link to="/menu" className="mt-4 flex justify-center rounded-full bg-[var(--espresso)] text-[var(--cream)] h-12 items-center">Explore Our Menu</Link>
        </nav>
      )}
    </header>
  );
}
