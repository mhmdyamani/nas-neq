import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/pages/MadeToOrder";
import { useAdmin, Btn } from "@/pages/admin/AdminPage";
import ProductImage from "@/components/site/ProductImage";
import { errMsg } from "@/lib/api";

const EMPTY = { name: "", category: "chicken-wings", price: "", description: "", notes: "", options: [], kind: "regular", is_packaging: false, is_drink: false,
  available: true, hidden: false, image_path: null, thumb_path: null, image_source: null, track_stock: false, low_threshold: 0,
  preorder: { enabled: false, lead_days: null, max_qty: null, daily_capacity: null } };

const num = (v) => (v === "" || v == null ? null : Number(v));

function ImagePicker({ f, setF, productId }) {
  const api = useAdmin();
  const input = useRef(null);
  const [busy, setBusy] = useState("");
  const [draft, setDraft] = useState(null);
  const upload = async (file) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) return toast.error("Please choose a JPG, PNG or WebP image");
    if (file.size > 10 * 1024 * 1024) return toast.error("Image is larger than 10 MB");
    setBusy("Uploading…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      setDraft(await api("post", "/admin/upload", fd));
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(""); input.current.value = ""; }
  };
  const generate = async () => {
    setBusy("Generating… (up to a minute)");
    try { setDraft(await api("post", `/admin/products/${productId}/generate-image`)); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(""); }
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><p className="text-xs text-[var(--taupe)] mb-1">Current</p><ProductImage product={f} className="rounded-xl border border-[var(--beige)]" /></div>
        <div><p className="text-xs text-[var(--taupe)] mb-1">New (preview)</p>{draft ? <ProductImage product={draft} className="rounded-xl border-2 border-[var(--espresso)]" /> : <div className="aspect-square rounded-xl border border-dashed border-[var(--sand)] grid place-items-center text-xs text-[var(--taupe)] p-3 text-center">{busy || "Choose a photo to preview"}</div>}</div>
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="hidden" onChange={(e) => upload(e.target.files?.[0])} data-testid="product-image-file-input" />
      <div className="flex flex-wrap gap-2">
        <Btn type="button" variant="light" onClick={() => input.current.click()} disabled={!!busy} data-testid="product-image-upload-btn"><Upload size={14} className="inline mr-1" />Upload photo</Btn>
        {productId && <Btn type="button" variant="light" onClick={generate} disabled={!!busy} data-testid="product-image-generate-btn"><Sparkles size={14} className="inline mr-1" />AI illustration</Btn>}
        {draft && <><Btn type="button" onClick={() => { setF({ ...f, ...draft }); setDraft(null); toast.message("Image will be replaced when you save the item"); }} data-testid="product-image-use-btn">Use this image</Btn>
          <Btn type="button" variant="light" onClick={() => setDraft(null)} data-testid="product-image-cancel-btn">Discard</Btn></>}
      </div>
      <p className="text-xs text-[var(--taupe)]">The current image stays live until you press Save. {f.image_source === "ai_illustrative" ? "Current image is an AI illustration." : f.image_source === "owner_upload" ? "Current image was uploaded by you." : ""}</p>
    </div>
  );
}

export default function ProductEditor({ product, categories, onClose, onSaved }) {
  const api = useAdmin();
  const [f, setF] = useState(() => ({ ...EMPTY, ...(product || {}), price: product?.price ?? "", preorder: { ...EMPTY.preorder, ...(product?.preorder || {}) } }));
  const [opts, setOpts] = useState((product?.options || []).join(", "));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });
  const setPre = (k, v) => setF({ ...f, preorder: { ...f.preorder, [k]: v } });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const body = { ...f, price: num(f.price), low_threshold: Number(f.low_threshold || 0), options: opts.split(",").map((x) => x.trim()).filter(Boolean),
      preorder: { enabled: f.preorder.enabled, lead_days: num(f.preorder.lead_days), max_qty: num(f.preorder.max_qty), daily_capacity: num(f.preorder.daily_capacity) } };
    ["id", "status", "stock", "sort", "created_at", "updated_at", "stock_left"].forEach((k) => delete body[k]);
    try {
      const saved = product ? await api("put", `/admin/products/${product.id}`, body) : await api("post", "/admin/products", body);
      toast.success(product ? "Item saved" : "Item added");
      onSaved(saved);
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };

  const Toggle = ({ k, label, testid }) => (
    <label className="flex items-center justify-between gap-3 text-sm py-1"><span>{label}</span><Switch checked={!!f[k]} onCheckedChange={(v) => setF({ ...f, [k]: v })} data-testid={testid} /></label>
  );

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="product-editor">
        <DialogTitle className="font-display text-2xl">{product ? `Edit ${product.name}` : "Add menu item"}</DialogTitle>
        <DialogDescription>Changes go live on the public menu after you save.</DialogDescription>
        <form onSubmit={save} className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Field id="pe-name" label="Name" required><Input id="pe-name" value={f.name} onChange={set("name")} required data-testid="product-name-input" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="pe-cat" label="Category"><select id="pe-cat" value={f.category} onChange={set("category")} className="h-10 w-full rounded-md border border-input px-2 text-sm" data-testid="product-category-select">{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></Field>
              <Field id="pe-price" label="Price (₱)"><Input id="pe-price" type="number" min="0" step="0.01" value={f.price} onChange={set("price")} placeholder="To be confirmed" data-testid="product-price-input" /></Field>
            </div>
            <Field id="pe-kind" label="Ordering type"><select id="pe-kind" value={f.kind} onChange={set("kind")} className="h-10 w-full rounded-md border border-input px-2 text-sm" data-testid="product-kind-select"><option value="regular">Regular — add to cart</option><option value="inquiry">Made to order — inquiry / pre-order</option></select></Field>
            <Field id="pe-desc" label="Description (only verified info)"><Textarea id="pe-desc" rows={2} value={f.description} onChange={set("description")} data-testid="product-description-input" /></Field>
            <Field id="pe-notes" label="Serving / packaging notes"><Input id="pe-notes" value={f.notes} onChange={set("notes")} data-testid="product-notes-input" /></Field>
            <Field id="pe-opts" label="Options (comma separated, owner-confirmed)"><Input id="pe-opts" value={opts} onChange={(e) => setOpts(e.target.value)} data-testid="product-options-input" /></Field>
            <div className="rounded-xl bg-[var(--cream)] p-3">
              <Toggle k="available" label="Available to order" testid="product-available-switch" />
              <Toggle k="hidden" label="Hide from public menu" testid="product-hidden-switch" />
              <Toggle k="is_packaging" label="Packaging add-on" testid="product-packaging-switch" />
              <Toggle k="is_drink" label="Beverage (affects AI image angle)" testid="product-drink-switch" />
              <Toggle k="track_stock" label="Track stock quantity" testid="product-track-switch" />
              {f.track_stock && <Field id="pe-low" label="Low-stock warning at"><Input id="pe-low" type="number" min="0" value={f.low_threshold} onChange={set("low_threshold")} data-testid="product-low-threshold-input" /></Field>}
            </div>
            {f.kind === "inquiry" && (
              <div className="rounded-xl border border-[var(--beige)] p-3 space-y-2">
                <label className="flex items-center justify-between text-sm"><span>Accept pre-orders online</span><Switch checked={f.preorder.enabled} onCheckedChange={(v) => setPre("enabled", v)} data-testid="product-preorder-switch" /></label>
                {f.preorder.enabled && <div className="grid grid-cols-3 gap-2">
                  <Field id="pe-lead" label="Lead days" required><Input id="pe-lead" type="number" min="0" value={f.preorder.lead_days ?? ""} onChange={(e) => setPre("lead_days", e.target.value)} data-testid="product-lead-days-input" /></Field>
                  <Field id="pe-max" label="Max / order"><Input id="pe-max" type="number" min="1" value={f.preorder.max_qty ?? ""} onChange={(e) => setPre("max_qty", e.target.value)} data-testid="product-max-qty-input" /></Field>
                  <Field id="pe-cap" label="Daily capacity"><Input id="pe-cap" type="number" min="1" value={f.preorder.daily_capacity ?? ""} onChange={(e) => setPre("daily_capacity", e.target.value)} data-testid="product-capacity-input" /></Field>
                </div>}
                <p className="text-xs text-[var(--taupe)]">Pre-orders need a confirmed price and lead time. Otherwise customers can only send an inquiry.</p>
              </div>
            )}
          </div>
          <div className="space-y-4">
            <ImagePicker f={f} setF={setF} productId={product?.id} />
            <div className="flex gap-2 pt-4"><Btn disabled={busy} data-testid="product-save-btn">{busy ? "Saving…" : "Save"}</Btn><Btn type="button" variant="light" onClick={onClose} data-testid="product-cancel-btn">Cancel</Btn></div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
