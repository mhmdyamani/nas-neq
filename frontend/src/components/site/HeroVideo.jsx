import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { ArrowDown } from "lucide-react";

const useIsMobile = () => {
  const [m, setM] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
};

/** Scroll position drives video.currentTime: down = forward, up = reverse, stop = hold. */
function useScrollScrub(sectionRef, videoRef, enabled) {
  useEffect(() => {
    const v = videoRef.current;
    const s = sectionRef.current;
    if (!enabled || !v || !s) return;
    let raf, target = 0, current = 0, ready = false;
    const progress = () => {
      const r = s.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      return total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
    };
    const onMeta = () => { ready = true; target = current = progress() * v.duration; };
    const prime = () => { v.play().then(() => v.pause()).catch(() => {}); };
    if (v.readyState >= 1) onMeta(); else v.addEventListener("loadedmetadata", onMeta);
    prime();
    window.addEventListener("touchstart", prime, { once: true, passive: true });
    const tick = () => {
      if (ready && v.duration) {
        target = progress() * (v.duration - 0.05);
        current += (target - current) * 0.18;
        if (Math.abs(current - v.currentTime) > 0.04 && !v.seeking) v.currentTime = current;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); v.removeEventListener("loadedmetadata", onMeta); window.removeEventListener("touchstart", prime); };
  }, [sectionRef, videoRef, enabled]);
}

export default function HeroVideo() {
  const reduce = useReducedMotion();
  const mobile = useIsMobile();
  const sectionRef = useRef(null);
  const videoRef = useRef(null);
  useScrollScrub(sectionRef, videoRef, !reduce);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });
  const textY = useTransform(scrollYProgress, [0, 0.35], [0, -120]);
  const textO = useTransform(scrollYProgress, [0, 0.3], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.08]);
  const endO = useTransform(scrollYProgress, [0.78, 0.95], [0, 1]);
  const ext = typeof document !== "undefined" && document.createElement("video").canPlayType('video/mp4; codecs="avc1.640028"') ? "mp4" : "webm";
  const src = `/media/hero-${mobile ? "mobile" : "desktop"}.${ext}`;

  return (
    <section ref={sectionRef} className={reduce ? "relative h-[100svh]" : "relative h-[320svh] md:h-[400vh]"} data-testid="hero-video-section" aria-label="Nas&Neq introduction">
      <div className="sticky top-0 h-[100svh] overflow-hidden bg-[var(--beige)]">
        <motion.video
          key={src}
          ref={videoRef}
          src={src}
          poster="/media/hero-poster.jpg"
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          style={reduce ? undefined : { scale }}
          className="absolute inset-0 h-full w-full object-cover"
          data-testid="hero-video"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-white/85 via-white/10 to-transparent md:bg-gradient-to-r md:from-white/80 md:via-white/25 md:to-transparent" />
        <motion.div style={reduce ? undefined : { y: textY, opacity: textO }} className="absolute inset-x-0 bottom-0 md:inset-y-0 flex items-end md:items-center">
          <div className="mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-10 pb-16 md:pb-0">
            <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.8 }} className="eyebrow text-[var(--espresso)]/70">
              Bakery & Café · Culiat, Quezon City
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 30, rotateX: 25 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ delay: 0.35, duration: 1.1, ease: [0.2, 0.7, 0.2, 1] }}
              style={{ transformPerspective: 800 }}
              className="font-display text-[var(--espresso)] text-[2.7rem] leading-[0.98] sm:text-6xl lg:text-[5.6rem] mt-4 max-w-[12ch]"
            >
              Coffee, Bakes & Good Food.
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8, duration: 0.8 }} className="mt-5 max-w-md text-base md:text-lg text-[var(--espresso)]/85">
              Espresso, pastries, snacks, meals, beverages, and desserts from Nas&Neq.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1, duration: 0.7 }} className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link to="/menu" data-testid="hero-explore-menu-btn" className="h-12 px-7 rounded-full bg-[var(--espresso)] text-[var(--cream)] inline-flex items-center justify-center font-medium hover:bg-[#3a281e] transition-colors">Explore Our Menu</Link>
              <Link to="/made-to-order" data-testid="hero-made-to-order-btn" className="h-12 px-7 rounded-full bg-white/80 backdrop-blur border border-[var(--sand)] text-[var(--espresso)] inline-flex items-center justify-center font-medium hover:bg-white transition-colors">View Made-to-Order Bakes</Link>
            </motion.div>
          </div>
        </motion.div>
        {!reduce && (
          <motion.div style={{ opacity: endO }} className="absolute bottom-8 inset-x-0 flex justify-center pointer-events-none">
            <p className="rounded-full bg-white/80 backdrop-blur px-5 py-2 text-sm text-[var(--espresso)]">Keep scrolling — the menu is just below</p>
          </motion.div>
        )}
        {!reduce && (
          <motion.a href="#featured" style={{ opacity: textO }} className="hidden md:flex absolute bottom-8 right-10 items-center gap-2 text-sm text-[var(--espresso)]/80" data-testid="hero-skip-link">
            Scroll to play · skip <ArrowDown size={16} />
          </motion.a>
        )}
      </div>
    </section>
  );
}
