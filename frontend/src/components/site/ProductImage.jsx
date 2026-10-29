import { useState } from "react";
import { Coffee } from "lucide-react";
import { imgUrl } from "@/lib/api";

export default function ProductImage({ product, size = "thumb", className = "", imgClass = "", eager = false }) {
  const [failed, setFailed] = useState(false);
  const path = size === "thumb" ? product.thumb_path || product.image_path : product.image_path || product.thumb_path;
  const src = imgUrl(path);
  return (
    <div className={`relative aspect-square overflow-hidden bg-white ${className}`}>
      {src && !failed ? (
        <img
          src={src}
          alt={`${product.name} — illustrative image`}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          width="480"
          height="480"
          onError={() => setFailed(true)}
          className={`h-full w-full object-contain ${imgClass}`}
        />
      ) : (
        <div className="h-full w-full grid place-items-center bg-[var(--cream)] text-[var(--sand)]" aria-label="Image coming soon">
          <Coffee size={40} strokeWidth={1.2} />
        </div>
      )}
    </div>
  );
}
