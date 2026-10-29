import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/pages/MadeToOrder";
import { useAdmin, useLoad, H, Btn, Card } from "@/pages/admin/AdminPage";
import { useStore } from "@/context/StoreContext";
import { errMsg } from "@/lib/api";

const Row = ({ label, checked, onChange, testid, hint }) => (
  <label className="flex items-center justify-between gap-4 py-2"><span className="text-sm">{label}{hint && <span className="block text-xs text-[var(--taupe)]">{hint}</span>}</span><Switch checked={!!checked} onCheckedChange={onChange} data-testid={testid} /></label>
);

export default function SettingsPanel() {
  const api = useAdmin();
  const { loadMenu } = useStore();
  const { data } = useLoad(() => api("get", "/admin/settings"), []);
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const sendNow = async () => {
    setSending(true);
    try { await api("post", "/admin/daily-summary/send"); toast.success("Summary emailed"); } catch (e) { toast.error(errMsg(e)); } finally { setSending(false); }
  };
  useEffect(() => { if (data) setS(data); }, [data]);
  if (!s) return <p>Loading…</p>;
  const sv = (k, f, v) => setS({ ...s, services: { ...s.services, [k]: { ...s.services[k], [f]: v } } });
  const save = async () => {
    setBusy(true);
    try { setS(await api("put", "/admin/settings", s)); toast.success("Settings saved"); loadMenu(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const d = s.services.delivery;
  return (
    <section data-testid="admin-settings" className="max-w-3xl">
      <H sub="Only enabled services and payment methods are offered at checkout. Nothing here is assumed — fill in what you've confirmed.">Settings</H>
      <Card className="p-5 mb-4"><p className="font-medium mb-2">Online ordering</p>
        <Row label="Accept online orders" checked={s.accepting_orders} onChange={(v) => setS({ ...s, accepting_orders: v })} testid="setting-accepting-orders" />
        <Row label="Email customers when status changes" hint="Only customers who entered an email" checked={s.notify_customers} onChange={(v) => setS({ ...s, notify_customers: v })} testid="setting-notify-customers" />
        <Row label="Nightly order summary email" hint="Sent around 12:30 AM (Manila) to the alert email below: the day's orders, sales and low-stock items" checked={s.daily_summary} onChange={(v) => setS({ ...s, daily_summary: v })} testid="setting-daily-summary" />
        <div className="pb-2"><Btn type="button" variant="light" disabled={sending} onClick={sendNow} data-testid="send-summary-now-btn">{sending ? "Sending…" : "Email today's summary now"}</Btn></div>
        <Field id="st-email" label="Send new order / inquiry alerts to"><Input id="st-email" type="email" value={s.notify_email} onChange={(e) => setS({ ...s, notify_email: e.target.value })} data-testid="setting-notify-email" /></Field>
        <div className="mt-3"><Field id="st-hours" label="Opening hours text"><Input id="st-hours" value={s.hours_text} onChange={(e) => setS({ ...s, hours_text: e.target.value })} data-testid="setting-hours" /></Field></div>
      </Card>
      <Card className="p-5 mb-4"><p className="font-medium mb-2">Service methods</p>
        {["pickup", "dine_in", "takeout"].map((k) => <Row key={k} label={s.services[k].label} checked={s.services[k].enabled} onChange={(v) => sv(k, "enabled", v)} testid={`setting-service-${k}`} />)}
        <div className="border-t border-[var(--cream)] mt-2 pt-2">
          <Row label="Delivery" hint="Requires fee and coverage area" checked={d.enabled} onChange={(v) => sv("delivery", "enabled", v)} testid="setting-service-delivery" />
          <div className="grid sm:grid-cols-2 gap-3">
            <Field id="st-fee" label="Delivery fee (₱)"><Input id="st-fee" type="number" min="0" value={d.fee ?? ""} onChange={(e) => sv("delivery", "fee", e.target.value)} data-testid="setting-delivery-fee" /></Field>
            <Field id="st-min" label="Minimum order (₱, optional)"><Input id="st-min" type="number" min="0" value={d.min_order ?? ""} onChange={(e) => sv("delivery", "min_order", e.target.value)} data-testid="setting-delivery-min" /></Field>
            <Field id="st-cov" label="Coverage area"><Input id="st-cov" value={d.coverage} onChange={(e) => sv("delivery", "coverage", e.target.value)} data-testid="setting-delivery-coverage" /></Field>
            <Field id="st-dh" label="Delivery hours (optional)"><Input id="st-dh" value={d.hours} onChange={(e) => sv("delivery", "hours", e.target.value)} data-testid="setting-delivery-hours" /></Field>
          </div>
        </div>
        <div className="border-t border-[var(--cream)] mt-3 pt-2">
          <Row label="Contactless delivery" hint="Requires delivery and instructions" checked={s.services.contactless.enabled} onChange={(v) => sv("contactless", "enabled", v)} testid="setting-service-contactless" />
          <Field id="st-ci" label="Contactless instructions shown to customers"><Textarea id="st-ci" rows={2} value={s.services.contactless.instructions} onChange={(e) => sv("contactless", "instructions", e.target.value)} data-testid="setting-contactless-instructions" /></Field>
        </div>
      </Card>
      <Card className="p-5 mb-4"><p className="font-medium mb-2">Payment methods</p>
        <Row label="Cash on pickup / delivery" checked={s.payments.cash.enabled} onChange={(v) => setS({ ...s, payments: { cash: { ...s.payments.cash, enabled: v } } })} testid="setting-payment-cash" />
        <p className="text-xs text-[var(--taupe)]">Online card/e-wallet payment is not connected yet. Mark payments as paid manually in Orders.</p>
      </Card>
      <Btn onClick={save} disabled={busy} data-testid="settings-save-btn">{busy ? "Saving…" : "Save settings"}</Btn>
    </section>
  );
}
