import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PageHead } from "@/pages/Menu";
import { Field } from "@/pages/MadeToOrder";
import { useStore, rememberOrder } from "@/context/StoreContext";
import { useCartCheck } from "@/components/site/CartSheet";
import { http, errMsg, peso, SERVICE_LABELS, manilaToday, addDays } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export default function Checkout() {
  const { cart, byId, settings, me, authHeaders, clearCart, loadMenu } = useStore();
  const check = useCartCheck();
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", phone: "", email: "", address: "", note: "", fulfillment: "", preorder_date: "", payment_method: "" });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const idem = useRef(newKey());
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => {
    if (me) setF((x) => ({ ...x, name: x.name || me.name || "", phone: x.phone || me.phone || "", email: x.email || me.email || "" }));
  }, [me]);

  const services = settings?.services || {};
  const enabled = Object.keys(SERVICE_LABELS).filter((k) => services[k]?.enabled);
  const isDelivery = ["delivery", "contactless"].includes(f.fulfillment);
  const deliveryFee = isDelivery ? Number(services.delivery?.fee || 0) : 0;
  const isPre = check?.order_type === "preorder";
  const minDate = useMemo(() => {
    const lead = Math.max(0, ...cart.map((c) => byId[c.product_id]?.preorder?.lead_days || 0));
    return addDays(manilaToday(), lead);
  }, [cart, byId]);
  const payments = Object.entries(settings?.payments || {});

  const validate = () => {
    const er = {};
    if (f.name.trim().length < 2) er.name = "Please enter your name";
    if (!/^[0-9+()\-\s]{7,20}$/.test(f.phone.trim())) er.phone = "Please enter a valid contact number";
    if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) er.email = "Please enter a valid email";
    if (!f.fulfillment) er.fulfillment = "Choose how you'd like to receive your order";
    if (isDelivery && f.address.trim().length < 8) er.address = "Please enter a complete delivery address";
    if (isPre && (!f.preorder_date || f.preorder_date < minDate)) er.preorder_date = `Choose a date on or after ${minDate}`;
    setErrs(er);
    return !Object.keys(er).length;
  };

  const submit = async () => {
    setBusy(true);
    try {
      const body = {
        idempotency_key: idem.current, items: cart, fulfillment: f.fulfillment,
        customer: { name: f.name, phone: f.phone, email: f.email || null },
        address: isDelivery ? f.address : null, note: f.note, preorder_date: isPre ? f.preorder_date : null,
        payment_method: f.payment_method || null,
      };
      const { data } = await http.post("/orders", body, { headers: await authHeaders() });
      rememberOrder(data.ref, data.track_token);
      clearCart();
      idem.current = newKey();
      loadMenu();
      nav(`/track/${data.track_token}?new=1`);
    } catch (e) {
      toast.error(errMsg(e));
      setReview(false);
      loadMenu();
    } finally {
      setBusy(false);
    }
  };

  if (!cart.length)
    return (
      <main><PageHead eyebrow="Checkout" title="Your cart is empty"><Link to="/menu" className="underline">Browse the menu</Link></PageHead></main>
    );

  const total = (check?.subtotal || 0) + deliveryFee;
  return (
    <main data-testid="checkout-page">
      <PageHead eyebrow="Checkout" title={isPre ? "Pre-order request" : "Order request"}>
        Your order is sent to Nas&Neq for review. It is not confirmed until Nas&Neq accepts it — you can follow its status on the tracking page.
      </PageHead>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 py-14 grid lg:grid-cols-5 gap-10">
        <form className="lg:col-span-3 space-y-8" noValidate onSubmit={(e) => { e.preventDefault(); if (validate()) setReview(true); }} data-testid="checkout-form">
          <section className="space-y-4">
            <h2 className="font-display text-2xl">Your details</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field id="co-name" label="Name" required error={errs.name}><Input id="co-name" value={f.name} onChange={set("name")} autoComplete="name" data-testid="checkout-name-input" /></Field>
              <Field id="co-phone" label="Contact number" required error={errs.phone}><Input id="co-phone" type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" data-testid="checkout-phone-input" /></Field>
            </div>
            <Field id="co-email" label="Email (optional — for status updates)" error={errs.email}><Input id="co-email" type="email" value={f.email} onChange={set("email")} data-testid="checkout-email-input" /></Field>
          </section>
          <section className="space-y-3">
            <h2 className="font-display text-2xl">How would you like it?</h2>
            <div className="grid sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Service method">
              {Object.entries(SERVICE_LABELS).map(([k, label]) => {
                const on = enabled.includes(k);
                return (
                  <label key={k} className={`rounded-xl border px-4 py-3 flex gap-3 items-start ${on ? "cursor-pointer border-[var(--beige)] has-[:checked]:border-[var(--espresso)] has-[:checked]:bg-[var(--cream)]" : "opacity-55 border-dashed"}`}>
                    <input type="radio" name="fulfillment" value={k} disabled={!on} checked={f.fulfillment === k} onChange={set("fulfillment")} className="mt-1 accent-[var(--espresso)]" data-testid={`fulfillment-${k}`} />
                    <span><span className="block text-sm font-medium">{label}</span>
                      {!on && <span className="block text-xs text-[var(--taupe)]">Not yet available online — call us to arrange</span>}
                      {on && (k === "delivery" || k === "contactless") && <span className="block text-xs text-[var(--taupe)]">Fee {peso(services.delivery?.fee)}{services.delivery?.coverage ? ` · ${services.delivery.coverage}` : ""}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
            {errs.fulfillment && <p className="text-xs text-red-700" role="alert">{errs.fulfillment}</p>}
            {f.fulfillment === "contactless" && services.contactless?.instructions && <p className="text-sm bg-[var(--cream)] rounded-xl p-3">{services.contactless.instructions}</p>}
            {isDelivery && <Field id="co-address" label="Delivery address" required error={errs.address}><Textarea id="co-address" value={f.address} onChange={set("address")} rows={2} data-testid="checkout-address-input" /></Field>}
          </section>
          {isPre && (
            <section className="space-y-3">
              <h2 className="font-display text-2xl">Pre-order date</h2>
              <Field id="co-date" label={`Requested date (earliest ${minDate})`} required error={errs.preorder_date}>
                <Input id="co-date" type="date" min={minDate} value={f.preorder_date} onChange={set("preorder_date")} data-testid="checkout-preorder-date" />
              </Field>
            </section>
          )}
          <section className="space-y-3">
            <h2 className="font-display text-2xl">Payment</h2>
            {payments.length ? (
              <div className="space-y-2">
                {payments.map(([k, v]) => (
                  <label key={k} className="flex items-center gap-3 text-sm"><input type="radio" name="pay" value={k} checked={f.payment_method === k} onChange={set("payment_method")} className="accent-[var(--espresso)]" data-testid={`payment-${k}`} />{v.label}</label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--espresso)]/80 bg-[var(--cream)] rounded-xl p-4" data-testid="payment-arranged-note">No online payment is taken. Payment is arranged with Nas&Neq after your order is reviewed.</p>
            )}
          </section>
          <Field id="co-note" label="Order note (optional)"><Textarea id="co-note" value={f.note} onChange={set("note")} rows={2} placeholder="Requests are passed on to Nas&Neq but can't be guaranteed." data-testid="checkout-note-input" /></Field>
          {!review && (
            <button disabled={!check || check.problems.length > 0} className="h-12 px-8 rounded-full bg-[var(--espresso)] text-[var(--cream)] font-medium disabled:opacity-50" data-testid="checkout-review-btn">Review order</button>
          )}
        </form>
        <aside className="lg:col-span-2 lg:sticky lg:top-28 self-start rounded-3xl bg-[var(--cream)] p-6 space-y-4" data-testid="checkout-summary">
          <h2 className="font-display text-2xl">Summary</h2>
          <ul className="space-y-2 text-sm">
            {check?.lines.map((l) => (
              <li key={l.product_id} className="flex justify-between gap-3"><span>{l.qty} × {l.name}{l.is_packaging ? " (packaging)" : ""}</span><span className="tabular">{peso(l.line_total)}</span></li>
            ))}
          </ul>
          {check?.problems.map((p) => <p key={p.message} className="text-sm text-red-700" role="alert">{p.message}</p>)}
          <div className="border-t border-[var(--beige)] pt-3 space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span className="tabular">{peso(check?.subtotal || 0)}</span></div>
            {isDelivery && <div className="flex justify-between"><span>Delivery fee</span><span className="tabular">{peso(deliveryFee)}</span></div>}
            <div className="flex justify-between text-lg font-medium pt-2"><span>Total due</span><span className="tabular" data-testid="checkout-total">{peso(total)}</span></div>
          </div>
          {review && (
            <div className="border-t border-[var(--beige)] pt-4 space-y-3 text-sm" data-testid="checkout-review-panel">
              <p><strong>{f.name}</strong> · {f.phone}{f.email ? ` · ${f.email}` : ""}</p>
              <p>{SERVICE_LABELS[f.fulfillment]}{isPre ? ` · ${f.preorder_date}` : ""}{isDelivery ? ` · ${f.address}` : ""}</p>
              <button onClick={submit} disabled={busy} className="w-full h-12 rounded-full bg-[var(--espresso)] text-[var(--cream)] font-medium disabled:opacity-60" data-testid="checkout-submit-btn">
                {busy ? "Sending…" : "Place order request"}
              </button>
              <button onClick={() => setReview(false)} className="w-full text-sm underline">Edit details</button>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
