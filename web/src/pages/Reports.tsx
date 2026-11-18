import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Empty, ErrorBox, Field, Icon, Page, Section, Spinner, Stat, Tabs, TextInput, cx } from '../components/ui';
import { REASON_LABEL, api, type Summary } from '../lib/api';
import { addDays, dayLabel, num, som, todayIso } from '../lib/format';

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'custom';

function rangeFor(p: Preset, custom: { from: string; to: string }) {
  const t = todayIso();
  switch (p) {
    case 'today':
      return { from: t, to: t };
    case 'yesterday':
      return { from: addDays(t, -1), to: addDays(t, -1) };
    case 'week': {
      const dow = (new Date(`${t}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
      return { from: addDays(t, -dow), to: t };
    }
    case 'month':
      return { from: `${t.slice(0, 7)}-01`, to: t };
    case 'lastMonth': {
      const firstThis = `${t.slice(0, 7)}-01`;
      const lastPrev = addDays(firstThis, -1);
      return { from: `${lastPrev.slice(0, 7)}-01`, to: lastPrev };
    }
    case 'custom':
      return custom;
  }
}

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'today', label: 'Bugun' },
  { value: 'yesterday', label: 'Kecha' },
  { value: 'week', label: 'Hafta' },
  { value: 'month', label: 'Bu oy' },
  { value: 'lastMonth', label: 'Oʻtgan oy' },
  { value: 'custom', label: 'Boshqa' },
];

export function ReportsPage() {
  const [preset, setPreset] = useState<Preset>('month');
  const [custom, setCustom] = useState({ from: addDays(todayIso(), -29), to: todayIso() });
  const range = rangeFor(preset, custom);
  const [tab, setTab] = useState<'drinks' | 'snacks' | 'expenses' | 'days'>('drinks');
  const q = useQuery({
    queryKey: ['summary', range.from, range.to],
    queryFn: () => api.get<Summary>(`/reports/summary?from=${range.from}&to=${range.to}`),
    placeholderData: (prev) => prev,
  });

  return (
    <Page title="Hisobot" back="/yana">
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPreset(p.value)}
            className={cx(
              'h-9 shrink-0 rounded-full border px-3 text-sm font-medium',
              preset === p.value ? 'border-bean-900 bg-bean-900 text-white' : 'border-bean-200 bg-white text-bean-800',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Field label="Dan">
            <TextInput type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} />
          </Field>
          <Field label="Gacha">
            <TextInput type="date" value={custom.to} min={custom.from} max={todayIso()} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} />
          </Field>
        </div>
      )}
      <p className="mb-3 text-sm text-stone-500">{range.from === range.to ? dayLabel(range.from, true) : `${dayLabel(range.from)} — ${dayLabel(range.to)}`}</p>

      {q.isPending ? (
        <Spinner />
      ) : q.error ? (
        <ErrorBox error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className={cx(q.isFetching && 'opacity-60 transition-opacity')}>
          <Totals s={q.data} />
          {q.data.byDay.length > 1 && <DailyChart s={q.data} />}
          <div className="mt-6">
            <Tabs
              value={tab}
              onChange={setTab}
              options={[
                { value: 'drinks', label: 'Ichimlik' },
                { value: 'snacks', label: 'Snek' },
                { value: 'expenses', label: 'Xarajat' },
                { value: 'days', label: 'Kunlar' },
              ]}
            />
          </div>
          <div className="mt-3">
            {tab === 'drinks' && <DrinksTable s={q.data} />}
            {tab === 'snacks' && <SnacksTable s={q.data} />}
            {tab === 'expenses' && <ExpensesTable s={q.data} />}
            {tab === 'days' && <DaysTable s={q.data} />}
          </div>
        </div>
      )}
    </Page>
  );
}

function Totals({ s }: { s: Summary }) {
  const t = s.totals;
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Stat tone="dark" label="Savdo" value={som(t.revenue)} sub={`${num(t.drinkSold)} ichimlik · ${num(t.snackSold)} snek`} />
        <Stat label="Foyda" value={som(t.grossProfit)} tone={t.grossProfit < 0 ? 'bad' : 'good'} sub="Savdo − tannarx" />
        <Stat label="Xarajatlar" value={som(t.expenses)} sub={t.goodsPurchases ? `Shundan xarid ${som(t.goodsPurchases)}` : undefined} />
        <Stat label="Pul oqimi" value={som(t.cashFlow)} tone={t.cashFlow < 0 ? 'bad' : 'default'} sub="Savdo − xarajatlar" />
      </div>
      <Card className="mt-3 divide-y divide-bean-50 py-1 text-sm">
        <Line label="Ichimliklar savdosi" value={som(t.drinkRevenue)} />
        <Line label="Ichimliklar tannarxi" value={minus(t.drinkCost)} />
        <Line label={`Sovgʻalar (${t.giftQty} ta)`} value={minus(t.giftCost)} />
        <Line label="Sneklar savdosi" value={som(t.snackRevenue)} />
        <Line label="Sneklar tannarxi" value={minus(t.snackCost)} />
        {s.writeoffsByReason.map((w) => (
          <Line key={w.reason} label={`${REASON_LABEL[w.reason]} (${w.qty} ta snek)`} value={minus(w.cost)} />
        ))}
        <Line label="Foyda" value={som(t.grossProfit)} bold />
      </Card>
      {s.containerUsage.length > 0 && (
        <Card className="mt-3 py-1 text-sm">
          <div className="divide-y divide-bean-50">
            {s.containerUsage.map((c) => (
              <Line key={c.id} label={`${c.name} ishlatildi`} value={`${num(c.used)} ta`} />
            ))}
          </div>
        </Card>
      )}
      {t.drinksMissingCost > 0 && (
        <Link to="/ichimliklar" className="mt-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <Icon name="warn" className="size-5 shrink-0" />
          <span>
            {t.drinksMissingCost} ta ichimlikning tannarxi kiritilmagan — ularning foydasi toʻliq hisoblanmadi. <b>Kiritish →</b>
          </span>
        </Link>
      )}
      <p className="mt-2 px-1 text-xs text-stone-500">
        <b>Foyda</b> — sotilgan mahsulot va ichimliklarning tannarxi ayirilgan holda. <b>Pul oqimi</b> — shu davrda tushgan pul minus sarflangan pul (xaridlar ham).
      </p>
    </>
  );
}

const minus = (v: number) => (v ? `−${som(v)}` : som(0));

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={cx('flex justify-between py-2', bold && 'font-bold text-bean-900')}>
      <span className={bold ? '' : 'text-stone-600'}>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}

/** Daily sales as bars (single series). Tap a bar to read its value. */
function DailyChart({ s }: { s: Summary }) {
  const days = s.byDay.map((d) => ({ date: d.date, revenue: d.drinkRevenue + d.snackRevenue }));
  const max = Math.max(1, ...days.map((d) => d.revenue));
  const [active, setActive] = useState<number | null>(null);
  const shown = active !== null ? days[active] : null;
  const H = 140;
  return (
    <Section title="Kunlik savdo">
      <Card>
        <div className="mb-2 h-10 text-sm">
          {shown ? (
            <>
              <div className="text-stone-500">{dayLabel(shown.date, true)}</div>
              <div className="tabular font-bold text-bean-900">{som(shown.revenue)}</div>
            </>
          ) : (
            <>
              <div className="text-stone-500">Eng koʻp</div>
              <div className="tabular font-bold text-bean-900">{som(max)}</div>
            </>
          )}
        </div>
        <div className="relative" style={{ height: H }} onMouseLeave={() => setActive(null)}>
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-bean-100" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-bean-200" />
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {days.map((d, i) => (
              <button
                key={d.date}
                type="button"
                className="group flex h-full min-w-0 flex-1 items-end"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                aria-label={`${dayLabel(d.date)}: ${som(d.revenue)}`}
              >
                <span
                  className={cx('block w-full rounded-t-[4px] transition-colors', active === i ? 'bg-bean-900' : 'bg-bean-500 group-hover:bg-bean-700')}
                  style={{ height: d.revenue ? Math.max(2, (d.revenue / max) * H) : 0 }}
                />
              </button>
            ))}
          </div>
        </div>
        <div className="mt-1 flex justify-between text-xs text-stone-500">
          <span>{dayLabel(days[0]!.date)}</span>
          <span>{dayLabel(days.at(-1)!.date)}</span>
        </div>
      </Card>
    </Section>
  );
}

function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty: boolean }) {
  if (empty) return <Empty>Bu davrda maʼlumot yoʻq</Empty>;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bean-100 text-left text-xs text-stone-500">
            {head.map((h, i) => (
              <th key={h} className={cx('px-3 py-2 font-medium', i > 0 && 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-bean-50">{children}</tbody>
      </table>
    </Card>
  );
}

const td = 'px-3 py-2 tabular text-right whitespace-nowrap';

function DrinksTable({ s }: { s: Summary }) {
  return (
    <Table head={['Ichimlik', 'Soni', 'Savdo', 'Foyda']} empty={s.byDrink.length === 0}>
      {s.byDrink.map((d) => (
        <tr key={d.id}>
          <td className="px-3 py-2">
            {d.name}
            {d.gifts > 0 && <span className="text-xs text-stone-500"> · {d.gifts} sovgʻa</span>}
          </td>
          <td className={td}>{d.sold}</td>
          <td className={td}>{num(d.revenue)}</td>
          <td className={cx(td, d.missingCost ? 'text-amber-700' : d.profit < 0 ? 'text-red-700' : 'text-emerald-700')}>{d.missingCost ? '?' : num(d.profit)}</td>
        </tr>
      ))}
    </Table>
  );
}

function SnacksTable({ s }: { s: Summary }) {
  return (
    <Table head={['Mahsulot', 'Soni', 'Savdo', 'Foyda']} empty={s.byProduct.length === 0}>
      {s.byProduct.map((p) => (
        <tr key={p.id}>
          <td className="px-3 py-2">
            {p.name}
            {p.writeoffQty > 0 && <span className="text-xs text-red-700"> · {p.writeoffQty} chiqarilgan</span>}
          </td>
          <td className={td}>{p.sold}</td>
          <td className={td}>{num(p.revenue)}</td>
          <td className={cx(td, p.profit < 0 ? 'text-red-700' : 'text-emerald-700')}>{num(p.profit)}</td>
        </tr>
      ))}
    </Table>
  );
}

function ExpensesTable({ s }: { s: Summary }) {
  return (
    <Table head={['Turkum', 'Soni', 'Summa']} empty={s.byCategory.length === 0}>
      {s.byCategory.map((c) => (
        <tr key={c.id}>
          <td className="px-3 py-2">{c.name}</td>
          <td className={td}>{c.count}</td>
          <td className={td}>{num(c.total)}</td>
        </tr>
      ))}
    </Table>
  );
}

function DaysTable({ s }: { s: Summary }) {
  const rows = [...s.byDay].reverse().filter((d) => d.drinkRevenue || d.snackRevenue || d.expenses);
  return (
    <Table head={['Kun', 'Ichimlik', 'Snek', 'Xarajat']} empty={rows.length === 0}>
      {rows.map((d) => (
        <tr key={d.date}>
          <td className="px-3 py-2 whitespace-nowrap">{dayLabel(d.date)}</td>
          <td className={td}>{num(d.drinkRevenue)}</td>
          <td className={td}>{num(d.snackRevenue)}</td>
          <td className={td}>{num(d.expenses)}</td>
        </tr>
      ))}
    </Table>
  );
}
