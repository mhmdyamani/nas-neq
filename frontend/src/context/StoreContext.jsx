import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { toast } from "sonner";
import { http, errMsg } from "@/lib/api";

const StoreCtx = createContext(null);
export const useStore = () => useContext(StoreCtx);

const readLS = (k, fb) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? fb;
  } catch {
    return fb;
  }
};

export function StoreProvider({ children }) {
  const { isSignedIn, getToken, isLoaded } = useAuth();
  const [menu, setMenu] = useState({ categories: [], products: [] });
  const [menuLoading, setMenuLoading] = useState(true);
  const [settings, setSettings] = useState(null);
  const [cart, setCart] = useState(() => readLS("nn_cart", []));
  const [favs, setFavs] = useState(() => readLS("nn_favs", []));
  const [me, setMe] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [active, setActive] = useState(null);
  const merged = useRef(false);

  const authHeaders = useCallback(async () => {
    if (!isSignedIn) return {};
    const t = await getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }, [isSignedIn, getToken]);

  const loadMenu = useCallback(async () => {
    try {
      const [m, s] = await Promise.all([http.get("/menu"), http.get("/settings/public")]);
      setMenu(m.data);
      setSettings(s.data);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setMenuLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  useEffect(() => {
    localStorage.setItem("nn_cart", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    if (!isSignedIn) localStorage.setItem("nn_favs", JSON.stringify(favs));
  }, [favs, isSignedIn]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setMe(null);
      merged.current = false;
      setFavs(readLS("nn_favs", []));
      return;
    }
    (async () => {
      try {
        const headers = await authHeaders();
        const { data } = await http.get("/me", { headers });
        const local = readLS("nn_favs", []);
        let server = data.favorites || [];
        if (!merged.current && local.some((x) => !server.includes(x))) {
          const r = await http.put("/me/favorites", { product_ids: [...server, ...local] }, { headers });
          server = r.data.favorites;
        }
        merged.current = true;
        setMe(data);
        setFavs(server);
      } catch (e) {
        setMe(null);
      }
    })();
  }, [isSignedIn, isLoaded, authHeaders]);

  const toggleFav = useCallback(
    async (pid) => {
      const next = favs.includes(pid) ? favs.filter((x) => x !== pid) : [...favs, pid];
      setFavs(next);
      if (isSignedIn) {
        try {
          await http.put("/me/favorites", { product_ids: next }, { headers: await authHeaders() });
        } catch (e) {
          setFavs(favs);
          toast.error(errMsg(e));
        }
      }
    },
    [favs, isSignedIn, authHeaders],
  );

  const addToCart = useCallback((pid, qty = 1) => {
    setCart((c) => {
      const ex = c.find((x) => x.product_id === pid);
      return ex ? c.map((x) => (x.product_id === pid ? { ...x, qty: x.qty + qty } : x)) : [...c, { product_id: pid, qty }];
    });
  }, []);
  const setQty = useCallback((pid, qty) => {
    setCart((c) => (qty <= 0 ? c.filter((x) => x.product_id !== pid) : c.map((x) => (x.product_id === pid ? { ...x, qty } : x))));
  }, []);
  const clearCart = useCallback(() => setCart([]), []);

  const byId = useMemo(() => Object.fromEntries(menu.products.map((p) => [p.id, p])), [menu.products]);
  const cartCount = cart.reduce((s, x) => s + x.qty, 0);

  const value = {
    menu, menuLoading, settings, loadMenu, byId, cart, cartCount, addToCart, setQty, clearCart,
    favs, toggleFav, me, isSignedIn, authHeaders, cartOpen, setCartOpen, active, setActive,
  };
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export const rememberOrder = (ref, token) => {
  const list = readLS("nn_recent", []).filter((x) => x.token !== token);
  localStorage.setItem("nn_recent", JSON.stringify([{ ref, token, at: new Date().toISOString() }, ...list].slice(0, 20)));
};
export const recentOrders = () => readLS("nn_recent", []);
