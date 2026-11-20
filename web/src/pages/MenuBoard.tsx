import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { num } from '../lib/format';

type MenuItem = { id: number; name: string; price: number; imagePath: string | null };
type Menu = { groups: { name: string; items: MenuItem[] }[]; snacks: MenuItem[] };

const BG = 'radial-gradient(ellipse at top, #3a2416 0%, #1f140d 55%, #140c07 100%)';
const CREAM = '#f5e6d3';
const GOLD = '#e0b06c';

/**
 * Public menu for the TV (no login needed). Fits the whole menu on one screen by picking the
 * number of columns and the largest text size that still fits. Prices update every minute.
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
  const contentRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ fontSize: 24, cols: 3 });
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });

  const sections = menu.data
    ? [...menu.data.groups, ...(menu.data.snacks.length ? [{ name: 'Sneklar', items: menu.data.snacks }] : [])]
    : [];
  const itemCount = sections.reduce((n, s) => n + s.items.length, 0);

  // Find the largest text that fits, trying 2–4 columns.
  const fit = useCallback(() => {
    const box = boxRef.current;
    const content = contentRef.current;
    if (!box || !content || itemCount === 0) return;
    const columns = content.querySelector<HTMLElement>('[data-columns]')!;
    const fits = () => content.offsetHeight <= box.clientHeight && content.scrollWidth <= box.clientWidth + 1;
    let best = { fontSize: 10, cols: 2 };
    for (const cols of [2, 3, 4]) {
      columns.style.columnCount = String(cols);
      let lo = 8;
      let hi = 120;
      while (hi - lo > 0.5) {
        const mid = (lo + hi) / 2;
        content.style.fontSize = `${mid}px`;
        if (fits()) lo = mid;
        else hi = mid;
      }
      if (lo > best.fontSize) best = { fontSize: lo, cols };
    }
    content.style.fontSize = `${best.fontSize}px`;
    columns.style.columnCount = String(best.cols);
    setLayout((l) => (l.fontSize === best.fontSize && l.cols === best.cols ? l : best));
  }, [itemCount]);

  useLayoutEffect(() => {
    fit();
  }, [fit, menu.data, size, fullscreen]);

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onFs);
    // Fonts can load after the first layout.
    document.fonts?.ready.then(() => fit()).catch(() => {});
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, [fit]);

  // Keep the TV screen from going to sleep while the menu is shown.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        const nav = navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
        if (nav.wakeLock && document.visibilityState === 'visible') lock = await nav.wakeLock.request('screen');
      } catch {
        /* not supported or not allowed — fine */
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

  const enterFullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      /* some TV browsers only allow fullscreen from their own menu */
    }
  };

  return (
    <div
      ref={boxRef}
      className={`fixed inset-0 overflow-hidden select-none ${fullscreen ? 'cursor-none' : ''}`}
      style={{ background: BG, color: CREAM }}
      onDoubleClick={() => (document.fullscreenElement ? document.exitFullscreen() : enterFullscreen())}
    >
      {menu.data ? (
        <div ref={contentRef} style={{ fontSize: layout.fontSize, padding: '1.4em 2em 1.2em' }}>
          <header className="mb-[1em] flex items-end justify-between gap-[1em] border-b pb-[0.6em]" style={{ borderColor: 'rgba(224,176,108,0.35)' }}>
            <div className="flex items-center gap-[0.6em]">
              <img src="/icon.svg" alt="" style={{ width: '2.4em', height: '2.4em' }} />
              <div>
                <div className="leading-none font-bold" style={{ fontSize: '2.1em', letterSpacing: '0.01em' }}>
                  Sodiq Coffee
                </div>
                <div className="mt-[0.25em] tracking-[0.25em] uppercase" style={{ color: GOLD, fontSize: '0.8em' }}>
                  Menyu
                </div>
              </div>
            </div>
            <div className="text-right" style={{ color: 'rgba(245,230,211,0.65)', fontSize: '0.85em' }}>
              Narxlar soʻmda
            </div>
          </header>

          <div data-columns style={{ columnCount: layout.cols, columnGap: '2.6em', columnFill: 'balance' }}>
            {sections.map((s) => (
              <section key={s.name} className="mb-[1.1em]" style={{ breakInside: 'avoid' }}>
                <h2 className="mb-[0.35em] font-bold tracking-[0.12em] uppercase" style={{ color: GOLD, fontSize: '0.95em' }}>
                  {s.name}
                </h2>
                {s.items.map((i) => (
                  <div key={i.id} className="flex items-baseline gap-[0.45em] py-[0.16em]">
                    <span className="leading-tight font-medium">{i.name}</span>
                    <span className="min-w-[1em] flex-1 border-b-2 border-dotted" style={{ borderColor: 'rgba(245,230,211,0.25)', transform: 'translateY(-0.28em)' }} />
                    <span className="tabular font-bold whitespace-nowrap" style={{ color: GOLD }}>
                      {num(i.price)}
                    </span>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid h-full place-items-center text-2xl opacity-70">{menu.error ? 'Menyuni yuklab boʻlmadi. Qayta urinilmoqda…' : 'Yuklanmoqda…'}</div>
      )}

      {!fullscreen && (
        <button
          type="button"
          onClick={enterFullscreen}
          autoFocus
          className="fixed right-6 bottom-6 flex items-center gap-2 rounded-2xl px-6 py-4 text-xl font-bold shadow-2xl focus:outline-4 focus:outline-offset-2"
          style={{ background: GOLD, color: '#1f140d', outlineColor: CREAM }}
        >
          <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
          Toʻliq ekran
        </button>
      )}
    </div>
  );
}
