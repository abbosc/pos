import '@fontsource-variable/inter';
import '@fontsource-variable/roboto-slab';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';

type MenuItem = { id: number; name: string; price: number; featured: boolean; imagePath: string | null };
type Menu = { groups: { name: string; items: MenuItem[] }[] };
type Slide = { src: string; label: string };

// Sodiq School brand colours.
const NAVY = '#06123c';
const INK = '#0d1a45';
const ORANGE = '#ff8a32';
const CREAM = '#f3f1ec';
const LINE = '#dcd8cf';
const MUTED = '#5d6380';
const SLAB = "'Roboto Slab Variable', 'Roboto Slab', Georgia, serif";
const SANS = "'Inter Variable', Inter, system-ui, sans-serif";

/** Prices are shown in thousands of soʻm: 22000 → "22", 22500 → "22,5". */
const k = (price: number) => {
  const v = price / 1000;
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ',');
};

// Estimated heights (in em) used to spread the sections over the four columns.
const ROW = 2.3;
const TITLE = 4.4;
const CARD = 14.5;

type Block = { kind: 'section'; name: string; items: MenuItem[] } | { kind: 'card'; slides: Slide[] };

/** Fill 4 columns in menu order (like the printed menu), photo cards on top of columns 2 and 4. */
function distribute(groups: Menu['groups'], cards: Slide[][]): Block[][] {
  const cols: Block[][] = [[], [], [], []];
  const heights = [0, 0, 0, 0];
  const cardCols = cards.length >= 2 ? [1, 3] : cards.length === 1 ? [3] : [];
  cardCols.forEach((c, i) => {
    cols[c]!.push({ kind: 'card', slides: cards[i]! });
    heights[c]! += CARD;
  });
  const size = (g: Menu['groups'][number]) => TITLE + g.items.length * ROW;
  const total = groups.reduce((s, g) => s + size(g), 0) + cardCols.length * CARD;
  const target = total / 4;
  let col = 0;
  for (const g of groups) {
    const h = size(g);
    const hasSection = cols[col]!.some((b) => b.kind === 'section');
    if (col < 3 && hasSection && heights[col]! + h > target * 1.15) col++;
    cols[col]!.push({ kind: 'section', name: g.name, items: g.items });
    heights[col]! += h;
  }
  return cols;
}

/**
 * Public drinks menu for the TV (no login). Designed after the printed “Bar menyusi”:
 * navy header, four columns, photo cards, “TAVSIYA” badges. The text size is chosen so the
 * whole menu fits one screen. Prices update every minute; gentle animations keep it alive.
 */
export function MenuBoardPage() {
  const menu = useQuery({
    queryKey: ['public-menu'],
    queryFn: () => api.get<Menu>('/public/menu'),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    retry: true,
  });
  const boxRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(20);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [lit, setLit] = useState(-1);
  const [flash, setFlash] = useState<Set<number>>(new Set());
  const prevPrices = useRef<Map<number, number>>(new Map());

  const groups = useMemo(() => menu.data?.groups ?? [], [menu.data]);
  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Photo cards: recommended drinks with a photo first, then the bar's own photos.
  const cards = useMemo<Slide[][]>(() => {
    if (groups.length === 0) return [];
    const withPhoto = allItems.filter((i) => i.imagePath).sort((a, b) => Number(b.featured) - Number(a.featured));
    const kapuchino = allItems.find((i) => i.name.toLowerCase() === 'kapuchino');
    const defaults: Slide[] = [
      { src: '/menu/kapuchino.jpg', label: kapuchino ? `${kapuchino.name} · ${k(kapuchino.price)}` : groups[0]!.name },
      { src: '/menu/muzdek.jpg', label: groups.at(-1)!.name },
    ];
    const pool: Slide[] = [...withPhoto.map((i) => ({ src: i.imagePath!, label: `${i.name} · ${k(i.price)}` })), ...defaults];
    // Two cards; when there are more photos, each card rotates through its half.
    return [pool.filter((_, i) => i % 2 === 0), pool.filter((_, i) => i % 2 === 1)].filter((s) => s.length > 0);
  }, [groups, allItems]);

  const columns = useMemo(() => distribute(groups, cards), [groups, cards]);

  // Largest text size at which the four columns fit between header and footer.
  const fit = useCallback(() => {
    const box = boxRef.current;
    const main = mainRef.current;
    const grid = gridRef.current;
    if (!box || !main || !grid || allItems.length === 0) return;
    const fits = () => {
      const cs = getComputedStyle(main);
      const inner = main.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      return grid.offsetHeight <= inner && grid.scrollWidth <= main.clientWidth + 1;
    };
    let lo = 6;
    let hi = 80;
    while (hi - lo > 0.25) {
      const mid = (lo + hi) / 2;
      box.style.fontSize = `${mid}px`;
      if (fits()) lo = mid;
      else hi = mid;
    }
    box.style.fontSize = `${lo}px`;
    setFontSize(lo);
  }, [allItems.length]);

  useLayoutEffect(() => {
    fit();
  }, [fit, columns, size, fullscreen]);

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onFs);
    document.fonts?.ready.then(() => fit()).catch(() => {});
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, [fit]);

  // A soft highlight that slowly travels through the drinks.
  useEffect(() => {
    if (allItems.length === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setLit((i) => (i + 1) % allItems.length), 3500);
    return () => clearInterval(t);
  }, [allItems.length]);

  // Flash prices that changed since the last refresh.
  useEffect(() => {
    if (allItems.length === 0) return;
    const changed = new Set<number>();
    for (const i of allItems) {
      const before = prevPrices.current.get(i.id);
      if (before !== undefined && before !== i.price) changed.add(i.id);
      prevPrices.current.set(i.id, i.price);
    }
    if (changed.size) {
      setFlash(changed);
      const t = setTimeout(() => setFlash(new Set()), 6000);
      return () => clearTimeout(t);
    }
  }, [allItems]);

  // Keep the TV screen awake.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        const nav = navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
        if (nav.wakeLock && document.visibilityState === 'visible') lock = await nav.wakeLock.request('screen');
      } catch {
        /* not supported — fine */
      }
    };
    request();
    const onVisible = () => document.visibilityState === 'visible' && request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, []);

  // The fullscreen button hides after a few seconds without input, and comes back on any
  // mouse move or remote-control key press.
  const [showButton, setShowButton] = useState(true);
  useEffect(() => {
    let timer = setTimeout(() => setShowButton(false), 8000);
    const wake = () => {
      setShowButton(true);
      clearTimeout(timer);
      timer = setTimeout(() => setShowButton(false), 8000);
    };
    window.addEventListener('pointermove', wake);
    window.addEventListener('keydown', wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('keydown', wake);
    };
  }, []);

  const enterFullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      /* some TV browsers only allow fullscreen from their own menu */
    }
  };

  const litId = lit >= 0 ? allItems[lit]?.id : undefined;
  let sectionIndex = 0;

  return (
    <div
      ref={boxRef}
      className={`mb-root fixed inset-0 flex flex-col overflow-hidden select-none ${fullscreen || !showButton ? 'cursor-none' : ''}`}
      style={{ background: CREAM, color: INK, fontFamily: SANS, fontSize }}
      onDoubleClick={() => (document.fullscreenElement ? document.exitFullscreen() : enterFullscreen())}
    >
      <style>{CSS}</style>

      <header className="mb-header flex shrink-0 items-center justify-between" style={{ background: NAVY, padding: '1.1em 2.6em' }}>
        <img src="/menu/logo.png" alt="Sodiq School" style={{ height: '3.3em', width: 'auto' }} />
        <div className="flex items-center" style={{ gap: '0.9em' }}>
          <div className="mb-stripes flex flex-col" style={{ gap: '0.32em' }} aria-hidden>
            <span style={{ width: '2.6em' }} />
            <span style={{ width: '2.1em' }} />
            <span style={{ width: '2.6em' }} />
            <span style={{ width: '1.7em' }} />
          </div>
          <h1 style={{ fontFamily: SLAB, fontWeight: 800, fontSize: '3.2em', lineHeight: 1, color: CREAM, letterSpacing: '-0.01em' }}>Bar menyusi</h1>
        </div>
      </header>
      <div className="mb-accent shrink-0" style={{ height: '0.32em', background: ORANGE }} />

      <main ref={mainRef} className="min-h-0 flex-1" style={{ padding: '1.7em 2.6em 0.9em' }}>
        {menu.data ? (
          <div ref={gridRef} className="grid grid-cols-4 items-start" style={{ columnGap: '2em' }}>
            {columns.map((col, ci) => (
              <div key={ci} className="flex flex-col">
                {col.map((b) => {
                  if (b.kind === 'card') return <PhotoCard key={`card-${ci}`} slides={b.slides} />;
                  const delay = sectionIndex++ * 0.12;
                  return (
                    <section key={b.name} className="mb-section" style={{ marginBottom: '1.5em', animationDelay: `${delay}s` }}>
                      <h2 style={{ fontFamily: SLAB, fontWeight: 750, fontSize: '1.62em', lineHeight: 1.15 }}>{b.name}</h2>
                      <div className="mb-underline" style={{ width: '1.6em', height: '0.2em', background: ORANGE, margin: '0.45em 0 0.55em' }} />
                      {b.items.map((i) => (
                        <div
                          key={i.id}
                          className={`mb-row flex items-baseline justify-between ${i.id === litId ? 'is-lit' : ''} ${flash.has(i.id) ? 'is-flash' : ''}`}
                          style={{ gap: '0.8em', padding: '0.52em 0.35em', margin: '0 -0.35em', borderBottom: `1px solid ${LINE}` }}
                        >
                          <span className="flex flex-wrap items-center" style={{ gap: '0.25em 0.55em', fontWeight: 500, lineHeight: 1.25 }}>
                            {i.name}
                            {i.featured && (
                              <span className="mb-badge" style={{ background: ORANGE, color: '#fff' }}>
                                TAVSIYA
                              </span>
                            )}
                          </span>
                          <span className="mb-price tabular-nums" style={{ fontWeight: 700, fontSize: '1.08em' }}>
                            {k(i.price)}
                          </span>
                        </div>
                      ))}
                    </section>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid h-full place-items-center" style={{ color: MUTED, fontSize: '1.4em' }}>
            {menu.error ? 'Menyuni yuklab boʻlmadi. Qayta urinilmoqda…' : 'Yuklanmoqda…'}
          </div>
        )}
      </main>

      <footer className="flex shrink-0 items-center justify-between" style={{ margin: '0 2.6em', padding: '0.9em 0 1.1em', borderTop: `1px solid ${LINE}`, gap: '2em' }}>
        <div className="flex items-center" style={{ gap: '0.7em', fontWeight: 700, letterSpacing: '0.16em', fontSize: '0.8em' }}>
          <span style={{ width: '0.8em', height: '0.8em', background: ORANGE, display: 'inline-block' }} />
          SODIQ SCHOOL COFFEE BAR
        </div>
        <div style={{ color: MUTED, fontSize: '0.75em' }}>*Suratlar ichimliklarning haqiqiy koʻrinishidan farq qilishi mumkin</div>
        <div style={{ fontWeight: 650, fontSize: '0.8em' }}>Narxlar ming soʻmda</div>
      </footer>

      {!fullscreen && showButton && (
        <button
          type="button"
          onClick={enterFullscreen}
          autoFocus
          className="fixed right-6 bottom-6 flex items-center gap-2 rounded-2xl px-6 py-4 text-xl font-bold shadow-2xl focus:outline-4 focus:outline-offset-2"
          style={{ background: NAVY, color: CREAM, outlineColor: ORANGE, fontFamily: SANS }}
        >
          <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke={ORANGE} strokeWidth={2.4} strokeLinecap="round" aria-hidden>
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
          Toʻliq ekran
        </button>
      )}
    </div>
  );
}

/** A photo with a label; slowly zooms, and crossfades between photos when there are several. */
function PhotoCard({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), 9000);
    return () => clearInterval(t);
  }, [slides.length]);
  const current = slides[index % slides.length]!;
  return (
    <div className="mb-card relative overflow-hidden" style={{ height: `${CARD - 1.5}em`, marginBottom: '1.5em', borderRadius: '1.1em', background: LINE }}>
      {slides.map((s, i) => (
        <img
          key={s.src}
          src={s.src}
          alt=""
          className="mb-photo absolute inset-0 h-full w-full object-cover"
          style={{ opacity: i === index % slides.length ? 1 : 0 }}
        />
      ))}
      <div
        key={current.label}
        className="mb-label absolute"
        style={{ left: '0.8em', bottom: '0.8em', background: NAVY, color: '#fff', borderRadius: '999px', padding: '0.4em 0.9em', fontWeight: 650, fontSize: '0.78em' }}
      >
        {current.label}
      </div>
    </div>
  );
}

const CSS = `
.mb-badge {
  position: relative; overflow: hidden; display: inline-block;
  font-size: 0.6em; font-weight: 800; letter-spacing: 0.08em; line-height: 1;
  padding: 0.4em 0.75em; border-radius: 999px; white-space: nowrap;
}
.mb-badge::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%);
  transform: translateX(-120%); animation: mb-shine 4.5s ease-in-out infinite;
}
@keyframes mb-shine { 0%, 55% { transform: translateX(-120%); } 85%, 100% { transform: translateX(120%); } }

.mb-row { border-radius: 0.4em; transition: background-color 1.2s ease, color 1.2s ease; }
.mb-row.is-lit { background: linear-gradient(90deg, rgba(255,138,50,0.16), rgba(255,138,50,0.04)); }
.mb-row .mb-price { transition: color 1.2s ease, transform 1.2s ease; display: inline-block; }
.mb-row.is-lit .mb-price { color: ${ORANGE}; transform: scale(1.08); }
.mb-row.is-flash { animation: mb-flash 1.5s ease-in-out 3; }
@keyframes mb-flash { 50% { background: rgba(255,138,50,0.3); } }

.mb-section { animation: mb-rise 0.9s cubic-bezier(.2,.7,.2,1) both; }
@keyframes mb-rise { from { opacity: 0; transform: translateY(1.2em); } to { opacity: 1; transform: none; } }
.mb-underline { transform-origin: left; animation: mb-grow 1.1s 0.4s cubic-bezier(.2,.7,.2,1) both; }
@keyframes mb-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }

.mb-card { animation: mb-rise 1s 0.2s cubic-bezier(.2,.7,.2,1) both; box-shadow: 0 0.6em 1.6em rgba(6,18,60,0.12); }
.mb-photo { transition: opacity 1.6s ease; animation: mb-kenburns 22s ease-in-out infinite alternate; }
@keyframes mb-kenburns { from { transform: scale(1.02) translate(0, 0); } to { transform: scale(1.12) translate(-2%, -1.5%); } }
.mb-label { animation: mb-label-in 0.8s cubic-bezier(.2,.7,.2,1) both; }
@keyframes mb-label-in { from { opacity: 0; transform: translateY(0.6em); } to { opacity: 1; transform: none; } }

.mb-stripes span { display: block; height: 0.36em; background: ${ORANGE}; transform-origin: right; animation: mb-wave 3.2s ease-in-out infinite; }
.mb-stripes span:nth-child(2) { animation-delay: 0.25s; }
.mb-stripes span:nth-child(3) { animation-delay: 0.5s; }
.mb-stripes span:nth-child(4) { animation-delay: 0.75s; }
@keyframes mb-wave { 0%, 100% { transform: scaleX(1); } 50% { transform: scaleX(0.6); } }
.mb-stripes { align-items: flex-end; }

.mb-header { animation: mb-drop 0.8s cubic-bezier(.2,.7,.2,1) both; }
@keyframes mb-drop { from { transform: translateY(-100%); } to { transform: none; } }
.mb-accent { transform-origin: left; animation: mb-grow 1.2s 0.3s cubic-bezier(.2,.7,.2,1) both; }

@media (prefers-reduced-motion: reduce) {
  .mb-root *, .mb-root *::after { animation: none !important; transition: none !important; }
}
`;
