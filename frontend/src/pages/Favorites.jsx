import { Link } from "react-router-dom";
import { PageHead } from "@/pages/Menu";
import MenuCard from "@/components/site/MenuCard";
import { useStore } from "@/context/StoreContext";

export default function Favorites() {
  const { favs, byId, isSignedIn } = useStore();
  const items = favs.map((id) => byId[id]).filter(Boolean);
  return (
    <main data-testid="favorites-page">
      <PageHead eyebrow="Saved" title="Your Favorites">
        {isSignedIn
          ? "Saved to your account — they sync across your devices."
          : <>Saved on this browser only. <Link to="/sign-in" className="underline">Sign in</Link> to keep favorites across devices.</>}
      </PageHead>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10 py-14">
        {items.length ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">{items.map((p) => <MenuCard key={p.id} p={p} />)}</div>
        ) : (
          <p className="text-center py-20" data-testid="favorites-empty">No favorites yet — tap the heart on any menu item. <Link to="/menu" className="underline">Browse the menu</Link></p>
        )}
      </div>
    </main>
  );
}
