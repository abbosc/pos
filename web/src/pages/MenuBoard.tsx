import '@fontsource-variable/inter';
import '@fontsource-variable/roboto-slab';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';

type MenuItem = { id: number; name: string; price: number; featured: boolean; imagePath: string | null };
type Group = { name: string; items: MenuItem[] };
type Menu = { groups: Group[] };
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

// Estimated heights (in em) used to split the menu into pages and columns.
const ROW = 2.3;
const TITLE = 4.4;
const CARD = 14.5; // photo card on the single-page menu
const CARD_PAGED = 11.5; // shorter card when the menu is split into pages
const CONT = 1.6; // “… · davomi” label above a continued group
const weight = (g: Group) => TITLE + g.items.length * ROW;

/**
 * Settings from the link: /menyu?sahifa=2&vaqt=15
 *   sahifa — how many pages the menu is split into (1 = everything on one screen), default 2
 *   vaqt   — seconds each page stays on screen, default 15
 */
function readSettings() {
  const q = new URLSearchParams(window.location.search);
  const pages = Math.min(4, Math.max(1, Number(q.get('sahifa')) || 2));
  const seconds = Math.min(600, Math.max(5, Number(q.get('vaqt')) || 15));
  return { pages, seconds };
}

/** Split items into at most `n` consecutive parts (menu order kept), making the heaviest part as light as possible. */
function partition<T>(
  items: T[],
  n: number,
  w: (x: T) => number,
  canCut: (i: number) => boolean = () => true,
  /** Extra height already taken in each part (e.g. a photo card on top of a column). */
  offsets: number[] = [],
  /** Extra height when a part starts at item j (e.g. a “continued” label). */
  startExtra: (j: number) => number = () => 0,
): T[][] {
  const count = Math.max(1, Math.min(n, items.length));
  if (count === 1) return [items];
  const prefix = [0];
  for (const x of items) prefix.push(prefix.at(-1)! + w(x));
  const sum = (a: number, b: number) => prefix[b]! - prefix[a]!;
  const N = items.length;
  const best: number[][] = Array.from({ length: count + 1 }, () => Array(N + 1).fill(Infinity));
  const cut: number[][] = Array.from({ length: count + 1 }, () => Array(N + 1).fill(0));
  best[0]![0] = 0;
  for (let p = 1; p <= count; p++) {
    for (let i = p; i <= N; i++) {
      for (let j = p - 1; j < i; j++) {
        if (j > 0 && !canCut(j)) continue;
        const v = Math.max(best[p - 1]![j]!, sum(j, i) + (offsets[p - 1] ?? 0) + startExtra(j));
        if (v <= best[p]![i]!) {
          best[p]![i] = v;
          cut[p]![i] = j;
        }
      }
    }
  }
  const parts: T[][] = [];
  let i = N;
  for (let p = count; p >= 1; p--) {
    const j = cut[p]![i]!;
    parts.unshift(items.slice(j, i));
    i = j;
  }
  return parts;
}

type Block = { kind: 'section'; group: Group; items: MenuItem[]; continued: boolean } | { kind: 'card'; slides: Slide[] };

/** One menu row; a group's title is attached to its first item. */
type Unit = { group: Group; item: MenuItem; index: number };

/**
 * Spread the menu over `n` columns in menu order, as evenly as possible. A long group may
 * continue at the top of the next column (at least 2 drinks on each side, with a small “davomi” label), like a printed menu.
 * Each photo card then goes on top of the shortest column.
 */
function distribute(groups: Group[], cards: Slide[][], n: number, cardHeight: number): Block[][] {
  const units: Unit[] = groups.flatMap((group) => group.items.map((item, index) => ({ group, item, index })));
  const w = (u: Unit) => (u.index === 0 ? TITLE : 0) + ROW;
  const canCut = (i: number) => {
    const u = units[i]!;
    if (u.index === 0) return true; // between groups
    return u.index >= 2 && u.group.items.length - u.index >= 2; // inside a group: at least 2 drinks on each side
  };
  const build = (parts: Unit[][]): Block[][] =>
    parts.map((part) => {
      const blocks: Block[] = [];
      for (const u of part) {
        const last = blocks.at(-1);
        if (last && last.kind === 'section' && last.group === u.group) last.items.push(u.item);
        else blocks.push({ kind: 'section', group: u.group, items: [u.item], continued: u.index > 0 });
      }
      return blocks;
    });
  const contExtra = (j: number) => (units[j] && units[j]!.index > 0 ? CONT : 0);
  const heightOf = (part: Unit[]) => part.reduce((sum, u) => sum + w(u), 0) + (part[0] && part[0].index > 0 ? CONT : 0);

  // Try each column (or pair of columns) for the photo cards, counting them in the balance. A card
  // must sit above a group title, never above continued drinks. Keep the most even layout,
  // preferring later columns (as in the printed menu).
  const placements: number[][] = [];
  if (cards.length === 0) placements.push([]);
  else if (cards.length === 1) for (let c = n - 1; c >= 0; c--) placements.push([c]);
  else for (let b = n - 1; b >= 1; b--) for (let a = b - 1; a >= 0; a--) placements.push([a, b]);
  let bestCols: Block[][] | null = null;
  let bestMax = Infinity;
  for (const place of placements) {
    const offsets = Array.from({ length: n }, (_, i) => (place.includes(i) ? cardHeight : 0));
    const parts = partition(units, n, w, canCut, offsets, contExtra);
    while (parts.length < n) parts.push([]);
    if (place.some((c) => parts[c]!.length > 0 && parts[c]![0]!.index > 0)) continue;
    const max = Math.max(...parts.map((p, i) => heightOf(p) + offsets[i]!));
    if (max < bestMax - 0.01) {
      bestMax = max;
      const cols = build(parts);
      place.forEach((c, i) => cols[c]!.unshift({ kind: 'card', slides: cards[i]! }));
      bestCols = cols;
    }
  }
  const cols = bestCols ?? build(partition(units, n, w, canCut));
  return cols;
}

/**
 * Public drinks menu for the TV (no login), designed after the printed “Bar menyusi”.
 * The menu is split into pages that take turns, so the text can be large enough to read from
 * across the room. Prices update every minute; gentle animations keep it alive.
 */
export function MenuBoardPage() {
  const settings = useMemo(readSettings, []);
  const menu = useQuery({
    queryKey: ['public-menu'],
    queryFn: () => api.get<Menu>('/public/menu'),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    retry: true,
  });
  const boxRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(20);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [page, setPage] = useState(0);
  const [lit, setLit] = useState(-1);
  const [flash, setFlash] = useState<Set<number>>(new Set());
  const prevPrices = useRef<Map<number, number>>(new Map());

  const groups = useMemo(() => menu.data?.groups ?? [], [menu.data]);
  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Photo slides: recommended drinks with a photo first, then the bar's own photos.
  const cards = useMemo<Slide[][]>(() => {
    if (groups.length === 0) return [];
    const withPhoto = allItems.filter((i) => i.imagePath).sort((a, b) => Number(b.featured) - Number(a.featured));
    const kapuchino = allItems.find((i) => i.name.toLowerCase() === 'kapuchino');
    const defaults: Slide[] = [
      { src: '/menu/kapuchino.jpg', label: kapuchino ? `${kapuchino.name} · ${k(kapuchino.price)}` : groups[0]!.name },
      { src: '/menu/muzdek.jpg', label: groups.at(-1)!.name },
    ];
    const pool: Slide[] = [...withPhoto.map((i) => ({ src: i.imagePath!, label: `${i.name} · ${k(i.price)}` })), ...defaults];
    return [pool.filter((_, i) => i % 2 === 0), pool.filter((_, i) => i % 2 === 1)].filter((s) => s.length > 0);
  }, [groups, allItems]);

  // Pages, each with its own columns and one photo card (two on a single-page menu).
  const pages = useMemo(() => {
    const split = partition(groups, settings.pages, weight);
    if (split.length === 1) {
      return [{ groups: split[0]!, cardHeight: CARD, columns: distribute(split[0]!, cards, 4, CARD) }];
    }
    return split.map((pg, i) => {
      const card = cards.length ? [cards[i % cards.length]!] : [];
      return { groups: pg, cardHeight: CARD_PAGED, columns: distribute(pg, card, 3, CARD_PAGED) };
    });
  }, [groups, cards, settings.pages]);
  const pageCount = pages.length;
  const current = page % pageCount;

  // One text size for all pages: the largest at which every page fits between header and footer.
  const fit = useCallback(() => {
    const box = boxRef.current;
    const main = mainRef.current;
    if (!box || !main || allItems.length === 0) return;
    const grids = Array.from(main.querySelectorAll<HTMLElement>('[data-grid]'));
    if (grids.length === 0) return;
    const fits = () => {
      const cs = getComputedStyle(main);
      const inner = main.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      return grids.every((g) => g.offsetHeight <= inner && g.scrollWidth <= main.clientWidth + 1);
    };
    let lo = 6;
    let hi = 90;
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
  }, [fit, pages, size, fullscreen]);

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

  // Turn the pages.
  useEffect(() => {
    if (pageCount < 2) return;
    const t = setInterval(() => setPage((p) => p + 1), settings.seconds * 1000);
    return () => clearInterval(t);
  }, [pageCount, settings.seconds]);

  // A soft highlight that slowly travels through the drinks on the visible page.
  const pageItems = useMemo(() => pages[current]?.groups.flatMap((g) => g.items) ?? [], [pages, current]);
  useEffect(() => {
    setLit(-1);
    if (pageItems.length === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setLit((i) => (i + 1) % pageItems.length), 2800);
    return () => clearInterval(t);
  }, [pageItems]);

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

  const litId = lit >= 0 ? pageItems[lit]?.id : undefined;

  return (
    <div
      ref={boxRef}
      className={`mb-root fixed inset-0 flex flex-col overflow-hidden select-none ${fullscreen || !showButton ? 'cursor-none' : ''}`}
      style={{ background: CREAM, color: INK, fontFamily: SANS, fontSize }}
      onDoubleClick={() => (document.fullscreenElement ? document.exitFullscreen() : enterFullscreen())}
    >
      <style>{CSS}</style>

      <header className="mb-header relative flex shrink-0 items-center justify-between" style={{ background: NAVY, padding: '0.9em 2.6em' }}>
        <img src="/menu/logo.png" alt="Sodiq School" style={{ height: '2.8em', width: 'auto' }} />
        <div className="flex items-center" style={{ gap: '0.9em' }}>
          <div className="mb-stripes flex flex-col" style={{ gap: '0.3em' }} aria-hidden>
            <span style={{ width: '2.3em' }} />
            <span style={{ width: '1.9em' }} />
            <span style={{ width: '2.3em' }} />
            <span style={{ width: '1.5em' }} />
          </div>
          <h1 style={{ fontFamily: SLAB, fontWeight: 800, fontSize: '2.7em', lineHeight: 1, color: CREAM, letterSpacing: '-0.01em' }}>Bar menyusi</h1>
        </div>
      </header>
      <div className="mb-accent relative shrink-0" style={{ height: '0.3em', background: pageCount > 1 ? 'rgba(255,138,50,0.35)' : ORANGE }}>
        {pageCount > 1 && <div key={page} className="mb-progress absolute inset-y-0 left-0" style={{ background: ORANGE, animationDuration: `${settings.seconds}s` }} />}
      </div>

      <main ref={mainRef} className="relative min-h-0 flex-1" style={{ padding: '1.5em 2.6em 0.8em' }}>
        {menu.data ? (
          pages.map((pg, pi) => {
            const active = pi === current;
            let sectionIndex = 0;
            return (
              <div
                key={pi}
                className={`mb-page ${active ? 'is-active' : ''}`}
                aria-hidden={!active}
                style={{ position: pi === 0 ? 'relative' : 'absolute', inset: pi === 0 ? undefined : '1.5em 2.6em 0.8em' }}
              >
                <div data-grid className="grid items-start" style={{ gridTemplateColumns: `repeat(${pg.columns.length}, minmax(0, 1fr))`, columnGap: '2.2em' }}>
                  {pg.columns.map((col, ci) => (
                    <div key={ci} className="flex min-w-0 flex-col">
                      {col.map((b) => {
                        if (b.kind === 'card') return <PhotoCard key={`card-${ci}`} slides={b.slides} active={active} height={pg.cardHeight} />;
                        const delay = sectionIndex++ * 0.12;
                        return (
                          <section key={`${b.group.name}-${b.continued}`} className="mb-section" style={{ marginBottom: '1.4em', animationDelay: `${delay}s` }}>
                            {b.continued && (
                              <div style={{ color: MUTED, fontSize: '0.8em', fontWeight: 600, letterSpacing: '0.03em', margin: '0.2em 0 0.3em' }}>
                                {b.group.name} · davomi
                              </div>
                            )}
                            {!b.continued && (
                              <>
                                <h2 style={{ fontFamily: SLAB, fontWeight: 750, fontSize: '1.62em', lineHeight: 1.15 }}>{b.group.name}</h2>
                                <div className="mb-underline" style={{ width: '1.6em', height: '0.2em', background: ORANGE, margin: '0.45em 0 0.55em', animationDelay: `${delay + 0.3}s` }} />
                              </>
                            )}
                            {b.items.map((i) => (
                              <div
                                key={i.id}
                                className={`mb-row flex items-baseline justify-between ${active && i.id === litId ? 'is-lit' : ''} ${flash.has(i.id) ? 'is-flash' : ''}`}
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
              </div>
            );
          })
        ) : (
          <div className="grid h-full place-items-center" style={{ color: MUTED, fontSize: '1.4em' }}>
            {menu.error ? 'Menyuni yuklab boʻlmadi. Qayta urinilmoqda…' : 'Yuklanmoqda…'}
          </div>
        )}
      </main>

      <footer className="flex shrink-0 items-center justify-between" style={{ margin: '0 2.6em', padding: '0.8em 0 1em', borderTop: `1px solid ${LINE}`, gap: '2em' }}>
        <div className="flex items-center" style={{ gap: '0.7em', fontWeight: 700, letterSpacing: '0.16em', fontSize: '0.8em' }}>
          <span style={{ width: '0.8em', height: '0.8em', background: ORANGE, display: 'inline-block' }} />
          SODIQ SCHOOL COFFEE BAR
        </div>
        {pageCount > 1 ? (
          <div className="flex items-center" style={{ gap: '0.5em' }} aria-label={`Sahifa ${current + 1} / ${pageCount}`}>
            {pages.map((_, i) => (
              <span
                key={i}
                className="mb-dot"
                style={{ width: i === current ? '2.2em' : '0.7em', height: '0.7em', borderRadius: '999px', background: i === current ? ORANGE : LINE }}
              />
            ))}
          </div>
        ) : (
          <div style={{ color: MUTED, fontSize: '0.75em' }}>*Suratlar ichimliklarning haqiqiy koʻrinishidan farq qilishi mumkin</div>
        )}
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
function PhotoCard({ slides, active, height }: { slides: Slide[]; active: boolean; height: number }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (slides.length < 2 || !active) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), 9000);
    return () => clearInterval(t);
  }, [slides.length, active]);
  const current = slides[index % slides.length]!;
  return (
    <div className="mb-card relative overflow-hidden" style={{ height: `${height - 1.5}em`, marginBottom: '1.4em', borderRadius: '1.1em', background: LINE }}>
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
.mb-page { transition: opacity 0.9s ease, transform 0.9s cubic-bezier(.2,.7,.2,1); opacity: 0; transform: translateX(2.5%); pointer-events: none; }
.mb-page.is-active { opacity: 1; transform: none; }

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

/* Entrance animations replay every time a page becomes visible. */
.mb-page.is-active .mb-section { animation: mb-rise 0.9s cubic-bezier(.2,.7,.2,1) both; }
@keyframes mb-rise { from { opacity: 0; transform: translateY(1.2em); } to { opacity: 1; transform: none; } }
.mb-underline { transform-origin: left; }
.mb-page.is-active .mb-underline { animation: mb-grow 1.1s cubic-bezier(.2,.7,.2,1) both; }
@keyframes mb-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.mb-page.is-active .mb-card { animation: mb-rise 1s 0.2s cubic-bezier(.2,.7,.2,1) both; }
.mb-card { box-shadow: 0 0.6em 1.6em rgba(6,18,60,0.12); }

.mb-photo { transition: opacity 1.6s ease; animation: mb-kenburns 22s ease-in-out infinite alternate; }
@keyframes mb-kenburns { from { transform: scale(1.02) translate(0, 0); } to { transform: scale(1.12) translate(-2%, -1.5%); } }
.mb-label { animation: mb-label-in 0.8s cubic-bezier(.2,.7,.2,1) both; }
@keyframes mb-label-in { from { opacity: 0; transform: translateY(0.6em); } to { opacity: 1; transform: none; } }

.mb-stripes span { display: block; height: 0.32em; background: ${ORANGE}; transform-origin: right; animation: mb-wave 3.2s ease-in-out infinite; }
.mb-stripes span:nth-child(2) { animation-delay: 0.25s; }
.mb-stripes span:nth-child(3) { animation-delay: 0.5s; }
.mb-stripes span:nth-child(4) { animation-delay: 0.75s; }
@keyframes mb-wave { 0%, 100% { transform: scaleX(1); } 50% { transform: scaleX(0.6); } }
.mb-stripes { align-items: flex-end; }

.mb-header { animation: mb-drop 0.8s cubic-bezier(.2,.7,.2,1) both; }
@keyframes mb-drop { from { transform: translateY(-100%); } to { transform: none; } }

/* Time left on the current page. */
.mb-progress { width: 100%; transform-origin: left; animation-name: mb-progress; animation-timing-function: linear; animation-fill-mode: both; }
@keyframes mb-progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.mb-dot { transition: width 0.6s ease, background-color 0.6s ease; }

@media (prefers-reduced-motion: reduce) {
  .mb-root *, .mb-root *::after { animation: none !important; transition: none !important; }
  .mb-page { opacity: 0; }
  .mb-page.is-active { opacity: 1; }
}
`;
