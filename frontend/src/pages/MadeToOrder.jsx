import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { PageHead } from "@/pages/Menu";
import MenuCard from "@/components/site/MenuCard";
import Reveal from "@/components/site/Reveal";
import { useStore } from "@/context/StoreContext";
import { http, errMsg, BUSINESS } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export const Field = ({ id, label, required, error, children }) => (
  <div className="space-y-1.5">
    <Label htmlFor={id} className="text-sm">{label}{required && <span className="text-red-700"> *</span>}</Label>
    {children}
    {error && <p className="text-xs text-red-700" role="alert">{error}</p>}
  </div>
);

function InquiryForm({ items }) {
  const [params] = useSearchParams();
  const { authHeaders, me } = useStore();
  const [f, setF] = useState({ name: me?.name || "", phone: me?.phone || "", email: "", quantity: "", preferred_date: "", service: "", notes: "" });
  const [sel, setSel] = useState(() => (params.get("product") ? [params.get("product")] : []));
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (f.name.trim().length < 2) er.name = "Please enter your full name";
    if (!/^[0-9+()\-\s]{7,20}$/.test(f.phone.trim())) er.phone = "Please enter a valid phone number";
    if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) er.email = "Please enter a valid email";
    if (!sel.length) er.products = "Choose at least one product";
    setErrs(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      const body = { ...f, products: sel, email: f.email || null, service: f.service || null };
      const { data } = await http.post("/inquiries", body, { headers: await authHeaders() });
      setDone(data.ref);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <div className="rounded-3xl bg-white p-8 border border-[var(--beige)]" data-testid="inquiry-success" role="status">
        <CheckCircle2 size={36} />
        <h3 className="font-display text-3xl mt-4">Inquiry received</h3>
        <p className="mt-3 text-[var(--espresso)]/80">Your reference is <strong data-testid="inquiry-ref">{done}</strong>. This is an inquiry, not a confirmed order — Nas&Neq will contact you to confirm price, quantity and timing. You can also call <a className="underline" href={`tel:${BUSINESS.tel}`}>{BUSINESS.phone}</a>.</p>
      </div>
    );

  return (
    <form onSubmit={submit} noValidate className="rounded-3xl bg-white p-6 sm:p-8 border border-[var(--beige)] space-y-5" data-testid="inquiry-form">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field id="iq-name" label="Full Name" required error={errs.name}><Input id="iq-name" value={f.name} onChange={set("name")} autoComplete="name" data-testid="inquiry-name-input" /></Field>
        <Field id="iq-phone" label="Phone Number" required error={errs.phone}><Input id="iq-phone" type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" data-testid="inquiry-phone-input" /></Field>
      </div>
      <Field id="iq-email" label="Email Address (optional)" error={errs.email}><Input id="iq-email" type="email" value={f.email} onChange={set("email")} autoComplete="email" data-testid="inquiry-email-input" /></Field>
      <fieldset>
        <legend className="text-sm font-medium mb-2">Product(s) of Interest <span className="text-red-700">*</span></legend>
        <div className="grid sm:grid-cols-2 gap-2">
          {items.map((p) => (
            <label key={p.id} className="flex items-center gap-3 rounded-xl border border-[var(--beige)] px-3 py-2.5 cursor-pointer has-[:checked]:bg-[var(--cream)]">
              <Checkbox checked={sel.includes(p.name)} onCheckedChange={(v) => setSel(v ? [...sel, p.name] : sel.filter((x) => x !== p.name))} data-testid={`inquiry-product-${p.id}`} />
              <span className="text-sm">{p.name}</span>
            </label>
          ))}
        </div>
        {errs.products && <p className="text-xs text-red-700 mt-1" role="alert">{errs.products}</p>}
      </fieldset>
      <div className="grid sm:grid-cols-3 gap-4">
        <Field id="iq-qty" label="Requested Quantity"><Input id="iq-qty" value={f.quantity} onChange={set("quantity")} placeholder="e.g. 1 box" data-testid="inquiry-qty-input" /></Field>
        <Field id="iq-date" label="Preferred Date"><Input id="iq-date" type="date" value={f.preferred_date} onChange={set("preferred_date")} data-testid="inquiry-date-input" /></Field>
        <Field id="iq-service" label="Service Preference">
          <select id="iq-service" value={f.service} onChange={set("service")} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm" data-testid="inquiry-service-select">
            <option value="">No preference</option><option value="pickup">In-store pickup</option><option value="takeout">Takeout</option><option value="delivery">Delivery</option>
          </select>
        </Field>
      </div>
      <p className="text-xs text-[var(--taupe)] -mt-2">Dates and service availability are subject to confirmation by Nas&Neq.</p>
      <Field id="iq-notes" label="Additional Notes"><Textarea id="iq-notes" value={f.notes} onChange={set("notes")} rows={3} data-testid="inquiry-notes-input" /></Field>
      <button disabled={busy} className="w-full sm:w-auto h-12 px-8 rounded-full bg-[var(--espresso)] text-[var(--cream)] font-medium disabled:opacity-60" data-testid="inquiry-submit-btn">
        {busy ? "Sending…" : "Send inquiry"}
      </button>
    </form>
  );
}

export default function MadeToOrder() {
  const { menu } = useStore();
  const items = useMemo(() => menu.products.filter((p) => p.category === "made-to-order"), [menu.products]);
  return (
    <main data-testid="made-to-order-page">
      <PageHead eyebrow="Bakery" title="Made to Order">
        Cakes, cookies, bars and brownies made on request. Prices, quantities and timing are confirmed directly with Nas&Neq after you send an inquiry.
      </PageHead>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 py-16 grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-5">
        {items.map((p, i) => <Reveal key={p.id} delay={(i % 3) * 0.07}><MenuCard p={p} /></Reveal>)}
      </div>
      <section id="inquiry" className="bg-[var(--cream)] scroll-mt-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-10 py-20 grid lg:grid-cols-5 gap-10">
          <div className="lg:col-span-2">
            <p className="eyebrow">Inquiry</p>
            <h2 className="font-display text-4xl mt-3">Ask about a bake</h2>
            <p className="mt-4 text-[var(--espresso)]/80">Your inquiry is saved and sent to Nas&Neq. It is not a confirmed order until Nas&Neq gets back to you.</p>
          </div>
          <div className="lg:col-span-3">{items.length > 0 && <InquiryForm items={items} />}</div>
        </div>
      </section>
    </main>
  );
}
