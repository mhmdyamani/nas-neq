import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { SignIn, SignUp } from "@clerk/react";
import { Toaster } from "@/components/ui/sonner";
import ClerkAuthProvider from "@/components/auth/ClerkAuthProvider";
import { StoreProvider } from "@/context/StoreContext";
import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";
import CartSheet from "@/components/site/CartSheet";
import ProductDialog from "@/components/site/ProductDialog";
import Home from "@/pages/Home";
import Menu from "@/pages/Menu";
import MadeToOrder from "@/pages/MadeToOrder";
import Story from "@/pages/Story";
import Contact from "@/pages/Contact";
import Checkout from "@/pages/Checkout";
import Track from "@/pages/Track";
import Favorites from "@/pages/Favorites";
import Account from "@/pages/Account";
import AdminPage from "@/pages/admin/AdminPage";

const TITLES = {
  "/": "Nas&Neq — Bakery & Café in Culiat, Quezon City",
  "/menu": "Menu & Prices — Nas&Neq",
  "/made-to-order": "Made to Order — Nas&Neq",
  "/our-story": "Our Story — Nas&Neq",
  "/contact": "Contact, Hours & Services — Nas&Neq",
  "/checkout": "Checkout — Nas&Neq",
  "/favorites": "Your Favorites — Nas&Neq",
  "/account": "Your Account — Nas&Neq",
  "/admin": "Owner Dashboard — Nas&Neq",
};

function RouteEffects() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    document.title = TITLES[pathname] || "Nas&Neq";
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

const AuthPage = ({ children }) => (
  <main className="min-h-[80vh] flex items-center justify-center bg-[var(--cream)] px-4 pt-28 pb-16">{children}</main>
);

function Shell() {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith("/admin");
  return (
    <>
      <RouteEffects />
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/made-to-order" element={<MadeToOrder />} />
        <Route path="/our-story" element={<Story />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/track/:token" element={<Track />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/account" element={<Account />} />
        <Route path="/admin/*" element={<AdminPage />} />
        <Route path="/sign-in/*" element={<AuthPage><SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" withSignUp /></AuthPage>} />
        <Route path="/sign-up/*" element={<AuthPage><SignUp routing="path" path="/sign-up" signInUrl="/sign-in" /></AuthPage>} />
        <Route path="*" element={<AuthPage><p className="font-display text-3xl">Page not found</p></AuthPage>} />
      </Routes>
      {!isAdmin && <Footer />}
      <CartSheet />
      <ProductDialog />
      <Toaster position="top-center" richColors />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ClerkAuthProvider>
        <StoreProvider>
          <Shell />
        </StoreProvider>
      </ClerkAuthProvider>
    </BrowserRouter>
  );
}
