import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { PageHead } from "@/pages/Menu";
import { Field } from "@/pages/MadeToOrder";
import { useStore, recentOrders } from "@/context/StoreContext";
import { http, errMsg, peso, fmtDate, STATUS_LABELS, PAY_LABELS } from "@/lib/api";
import { Input } from "@/components/ui/input";

function Profile() {
  const { me, authHeaders } = useStore();
  const [f, setF] = useState({ name: "", phone: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (me) setF({ name: me.name || "", phone: me.phone || "" }); }, [me]);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await http.put("/me", f, { headers: await authHeaders() });
      toast.success("Profile saved");
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="rounded-3xl border border-[var(--beige)] p-6 space-y-4" data-testid="profile-form">
      <h2 className="font-display text-2xl">Profile</h2>
      <p className="text-sm text-[var(--taupe)]">{me?.email}</p>
      <Field id="pf-name" label="Name"><Input id="pf-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="profile-name-input" /></Field>
      <Field id="pf-phone" label="Phone"><Input id="pf-phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} data-testid="profile-phone-input" /></Field>
      <button disabled={busy} className="h-11 px-6 rounded-full bg-[var(--espresso)] text-[var(--cream)]" data-testid="profile-save-btn">{busy ? "Saving…" : "Save"}</button>
    </form>
  );
}

const OrderRow = ({ o }) => (
  <li className="rounded-2xl border border-[var(--beige)] p-4 flex flex-wrap gap-3 items-center justify-between">
    <div><p className="font-medium">{o.ref}</p><p className="text-xs text-[var(--taupe)]">{fmtDate(o.created_at)} · {o.items.length} item(s) · {peso(o.total)}</p></div>
    <div className="flex items-center gap-2 text-xs"><span className="rounded-full bg-[var(--espresso)] text-[var(--cream)] px-3 py-1">{STATUS_LABELS[o.status]}</span><span className="rounded-full bg-[var(--beige)] px-3 py-1">{PAY_LABELS[o.payment_status]}</span>
      <Link className="underline ml-2" to={`/track/${o.track_token}`}>Track</Link></div>
  </li>
);

export default function Account() {
  const { isSignedIn, authHeaders } = useStore();
  const [orders, setOrders] = useState(null);
  const recent = recentOrders();
  useEffect(() => {
    if (!isSignedIn) return;
    (async () => {
      try { setOrders((await http.get("/me/orders", { headers: await authHeaders() })).data); } catch (e) { toast.error(errMsg(e)); }
    })();
  }, [isSignedIn, authHeaders]);

  return (
    <main data-testid="account-page">
      <PageHead eyebrow="Account" title={isSignedIn ? "Your account" : "Your orders"} />
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-10 py-12 grid lg:grid-cols-5 gap-8">
        <div className="lg:col-span-2">
          {isSignedIn ? <Profile /> : (
            <div className="rounded-3xl bg-[var(--cream)] p-6 space-y-3">
              <p>Sign in to see your order history and sync favorites across devices.</p>
              <Link to="/sign-in" className="inline-flex h-11 px-6 rounded-full bg-[var(--espresso)] text-[var(--cream)] items-center" data-testid="account-signin-btn">Sign in or create account</Link>
            </div>
          )}
        </div>
        <div className="lg:col-span-3 space-y-6">
          {isSignedIn && (
            <section><h2 className="font-display text-2xl mb-3">Order history</h2>
              {orders === null ? <p>Loading…</p> : orders.length ? <ul className="space-y-3" data-testid="my-orders-list">{orders.map((o) => <OrderRow key={o.ref} o={o} />)}</ul> : <p className="text-sm text-[var(--taupe)]">No orders yet.</p>}
            </section>
          )}
          {recent.length > 0 && (
            <section><h2 className="font-display text-2xl mb-3">Orders placed on this device</h2>
              <ul className="space-y-2" data-testid="recent-orders-list">{recent.map((r) => <li key={r.token} className="flex justify-between text-sm border-b border-[var(--cream)] py-2"><span>{r.ref} · {fmtDate(r.at)}</span><Link className="underline" to={`/track/${r.token}`}>Track</Link></li>)}</ul>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
