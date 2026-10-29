import { useState } from "react";
import { toast } from "sonner";
import { useAdmin, useLoad, H, Btn, Card } from "@/pages/admin/AdminPage";
import { Input } from "@/components/ui/input";
import { errMsg } from "@/lib/api";

function FlagRow({ f, onDone }) {
  const api = useAdmin();
  const [txt, setTxt] = useState(f.resolution || "");
  const save = async (resolved) => {
    try { await api("post", `/admin/flags/${f.id}`, { resolved, resolution: txt }); toast.success(resolved ? "Marked resolved" : "Reopened"); onDone(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Card className={`p-4 space-y-2 ${f.resolved ? "opacity-60" : ""}`} data-testid={`flag-row-${f.id}`}>
      <p className="text-sm"><span className="eyebrow mr-2">{f.topic}</span>{f.detail}</p>
      <div className="flex gap-2"><Input placeholder="Your answer / note" value={txt} onChange={(e) => setTxt(e.target.value)} />
        {f.resolved ? <Btn variant="light" onClick={() => save(false)}>Reopen</Btn> : <Btn onClick={() => save(true)} data-testid={`flag-resolve-${f.id}`}>Resolve</Btn>}</div>
    </Card>
  );
}

export default function Flags() {
  const api = useAdmin();
  const { data, reload } = useLoad(() => api("get", "/admin/flags"), []);
  const open = (data || []).filter((f) => !f.resolved).length;
  return (
    <section data-testid="admin-flags">
      <H sub={`Details that need your confirmation before launch. ${open} open. Resolving a flag records your answer; update the menu or settings to change the website.`}>Flags to confirm</H>
      <div className="space-y-2">{(data || []).map((f) => <FlagRow key={f.id} f={f} onDone={reload} />)}</div>
    </section>
  );
}
