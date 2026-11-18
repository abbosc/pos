import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useToast } from '../components/toast';
import { Badge, Button, Card, ErrorBox, Icon, NumberInput, Page, Spinner, TextInput, cx, useConfirm } from '../components/ui';
import { api, type Container, type Sheet, type SheetSummary } from '../lib/api';
import { addDays, num, relativeDay, som, todayIso } from '../lib/format';

/** Daily drinks sheet — the paper “Kunlik savdo roʻyxati” typed in at the end of the day. */
export function SheetPage() {
  const [params, setParams] = useSearchParams();
  const date = params.get('sana') ?? todayIso();
  const setDate = (d: string) => setParams(d === todayIso() ? {} : { sana: d }, { replace: true });
  const sheet = useQuery({ queryKey: ['sheet', date], queryFn: () => api.get<Sheet>(`/sheets/${date}`) });
  const sheets = useQuery({ queryKey: ['sheets'], queryFn: () => api.get<SheetSummary[]>('/sheets') });

  return (
    <Page title="Ichimliklar varagʻi" actions={<Link to="/ichimliklar" className="text-sm font-semibold text-bean-700">Menyu</Link>}>
      <div className="mb-4 flex items-center gap-2">
        <button className="grid size-11 place-items-center rounded-xl border border-bean-200 bg-white" aria-label="Oldingi kun" onClick={() => setDate(addDays(date, -1))}>
          <Icon name="left" />
        </button>
        <label className="relative flex h-11 flex-1 items-center justify-center rounded-xl border border-bean-200 bg-white font-semibold">
          {relativeDay(date)}
          <input type="date" className="absolute inset-0 opacity-0" value={date} max={todayIso()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Sana" />
        </label>
        <button
          className="grid size-11 place-items-center rounded-xl border border-bean-200 bg-white disabled:opacity-40"
          aria-label="Keyingi kun"
          disabled={date >= todayIso()}
          onClick={() => setDate(addDays(date, 1))}
        >
          <Icon name="right" />
        </button>
      </div>

      {sheet.isPending ? (
        <Spinner />
      ) : sheet.error ? (
        <ErrorBox error={sheet.error} onRetry={() => sheet.refetch()} />
      ) : (
        <SheetForm key={`${date}-${sheet.data.updatedAt}`} sheet={sheet.data} />
      )}

      {sheets.data && sheets.data.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-2 px-1 text-sm font-semibold tracking-wide text-bean-700 uppercase">Oxirgi varaqlar</h2>
          <Card className="divide-y divide-bean-100 p-0">
            {sheets.data.slice(0, 14).map((s) => (
              <button key={s.date} className="flex w-full items-center gap-3 p-3 text-left text-sm" onClick={() => { setDate(s.date); window.scrollTo({ top: 0 }); }}>
                <span className="flex-1 font-medium">{relativeDay(s.date)}</span>
                <span className="text-stone-500">{s.soldQty} ta</span>
                <span className="tabular w-28 text-right font-semibold">{som(s.revenue)}</span>
                {s.locked && <Icon name="lock" className="size-4 text-stone-400" />}
              </button>
            ))}
          </Card>
        </div>
      )}
    </Page>
  );
}

type Row = { sold: number | null; gift: number | null; cup: number | null };

function SheetForm({ sheet }: { sheet: Sheet }) {
  const toast = useToast();
  const { confirm, element: confirmEl } = useConfirm();
  const containersQ = useQuery({ queryKey: ['containers'], queryFn: () => api.get<Container[]>('/containers') });
  const initial = useMemo(
    () => Object.fromEntries(sheet.lines.map((l) => [l.drinkId, { sold: l.soldQty || null, gift: l.giftQty || null, cup: l.cupQty || null }])),
    [sheet],
  );
  const initialCounts = useMemo(() => Object.fromEntries(sheet.containerCounts.map((c) => [c.containerId, c.countedUsed])), [sheet]);
  const [values, setValues] = useState<Record<number, Row>>(initial);
  const [counted, setCounted] = useState<Record<number, number | null>>(initialCounts);
  const [note, setNote] = useState(sheet.note ?? '');
  const locked = sheet.locked;

  const groups = useMemo(() => {
    const m = new Map<string, Sheet['lines']>();
    for (const l of sheet.lines) {
      const g = l.groupName || 'Boshqa';
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(l);
    }
    return [...m.entries()];
  }, [sheet.lines]);

  const v = (id: number) => values[id] ?? { sold: null, gift: null, cup: null };
  const totals = sheet.lines.reduce(
    (t, l) => {
      const r = v(l.drinkId);
      t.sold += r.sold ?? 0;
      t.gift += r.gift ?? 0;
      t.cup += r.cup ?? 0;
      t.revenue += (r.sold ?? 0) * l.price;
      return t;
    },
    { sold: 0, gift: 0, cup: 0, revenue: 0 },
  );
  const cupErrors = sheet.lines.filter((l) => (v(l.drinkId).cup ?? 0) > (v(l.drinkId).sold ?? 0) + (v(l.drinkId).gift ?? 0));

  // Containers used according to the numbers on screen.
  const usage = new Map<number, number>();
  const noContainer: string[] = [];
  for (const l of sheet.lines) {
    const r = v(l.drinkId);
    const total = (r.sold ?? 0) + (r.gift ?? 0);
    const cups = Math.min(r.cup ?? 0, total);
    if (total - cups > 0) {
      if (l.containerId) usage.set(l.containerId, (usage.get(l.containerId) ?? 0) + total - cups);
      else noContainer.push(l.name);
    }
    if (cups > 0 && sheet.cupContainerId) usage.set(sheet.cupContainerId, (usage.get(sheet.cupContainerId) ?? 0) + cups);
  }
  const containers = (containersQ.data ?? []).filter((c) => c.active || usage.has(c.id) || counted[c.id] != null);

  const dirty =
    note !== (sheet.note ?? '') ||
    sheet.lines.some((l) => (v(l.drinkId).sold ?? 0) !== l.soldQty || (v(l.drinkId).gift ?? 0) !== l.giftQty || (v(l.drinkId).cup ?? 0) !== l.cupQty) ||
    (containersQ.data ?? []).some((c) => (counted[c.id] ?? null) !== (initialCounts[c.id] ?? null));

  const save = useMutation({
    mutationFn: () =>
      api.put<Sheet>(`/sheets/${sheet.date}`, {
        note,
        lines: sheet.lines.map((l) => ({
          drinkId: l.drinkId,
          soldQty: v(l.drinkId).sold ?? 0,
          giftQty: v(l.drinkId).gift ?? 0,
          cupQty: v(l.drinkId).cup ?? 0,
        })),
        containerCounts: (containersQ.data ?? []).map((c) => ({ containerId: c.id, countedUsed: counted[c.id] ?? null })),
      }),
    onSuccess: () => toast(`Varaq saqlandi · ${som(totals.revenue)}`),
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/sheets/${sheet.date}`),
    onSuccess: () => toast('Varaq oʻchirildi'),
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const set = (id: number, field: keyof Row, x: number | null) => setValues((s) => ({ ...s, [id]: { ...v(id), ...s[id], [field]: x } }));

  return (
    <>
      {locked && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-stone-100 p-3 text-sm text-stone-700">
          <Icon name="lock" className="size-4" /> Bu kunning kassasi yopilgan. Oʻzgartirish uchun kassani qayta oching.
        </div>
      )}
      {!sheet.exists && !locked && (
        <p className="-mt-1 mb-3 text-sm text-stone-600">Qogʻoz varaqdagi “Sotildi”, “Sovgʻa” va stakanda berilganlar sonini kiriting.</p>
      )}

      <div className="space-y-4">
        {groups.map(([group, lines]) => {
          const anyCup = lines.some((l) => l.allowCup);
          return (
            <Card key={group} className="p-0">
              <div className="border-b border-bean-100 px-3 pt-2 pb-1.5">
                <div className="text-xs font-semibold tracking-wide text-bean-700 uppercase">{group}</div>
                <div className="mt-1 grid grid-cols-3 gap-2 text-center text-[11px] font-medium text-stone-500">
                  <span>Sotildi</span>
                  <span>Sovgʻa</span>
                  <span>{anyCup ? 'Stakanda' : ''}</span>
                </div>
              </div>
              <div className="divide-y divide-bean-50">
                {lines.map((l) => {
                  const r = v(l.drinkId);
                  const sum = (r.sold ?? 0) * l.price;
                  const cupBad = (r.cup ?? 0) > (r.sold ?? 0) + (r.gift ?? 0);
                  return (
                    <div key={l.drinkId} className="px-3 py-2.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="leading-snug font-semibold [overflow-wrap:anywhere] text-stone-900">{l.name}</span>
                        <span className="tabular shrink-0 text-xs whitespace-nowrap text-stone-500">
                          {num(l.price / 1000)} ming{sum > 0 && <b className="text-bean-800"> · {num(sum)}</b>}
                        </span>
                      </div>
                      <div className="mt-1.5 grid grid-cols-3 gap-2">
                        <NumberInput value={r.sold} disabled={locked} placeholder="0" aria-label={`${l.name} sotildi`} onChange={(x) => set(l.drinkId, 'sold', x)} />
                        <NumberInput
                          className={cx((r.gift ?? 0) > 0 && '[&_input]:border-amber-300 [&_input]:bg-amber-50')}
                          value={r.gift}
                          disabled={locked}
                          placeholder="0"
                          aria-label={`${l.name} sovgʻa`}
                          onChange={(x) => set(l.drinkId, 'gift', x)}
                        />
                        {l.allowCup ? (
                          <NumberInput
                            className={cx(cupBad && '[&_input]:border-red-400 [&_input]:bg-red-50')}
                            value={r.cup}
                            disabled={locked}
                            placeholder="0"
                            aria-label={`${l.name} stakanda`}
                            onChange={(x) => set(l.drinkId, 'cup', x)}
                          />
                        ) : (
                          <span />
                        )}
                      </div>
                      {cupBad && <p className="mt-1 text-xs text-red-700">Stakandagilar sotilgan + sovgʻadan koʻp boʻlishi mumkin emas</p>}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      <TextInput className="mt-4" placeholder="Izoh (ixtiyoriy)" value={note} disabled={locked} onChange={(e) => setNote(e.target.value)} />

      <Card className="mt-4">
        <div className="flex justify-between text-sm text-stone-600">
          <span>Sotildi</span>
          <span className="tabular">{totals.sold} ta</span>
        </div>
        <div className="flex justify-between text-sm text-stone-600">
          <span>Sovgʻa</span>
          <span className="tabular">{totals.gift} ta</span>
        </div>
        {totals.cup > 0 && (
          <div className="flex justify-between text-sm text-stone-600">
            <span>Shundan stakanda</span>
            <span className="tabular">{totals.cup} ta</span>
          </div>
        )}
        <div className="mt-2 flex justify-between border-t border-bean-100 pt-2 text-lg font-bold text-bean-900">
          <span>Jami savdo</span>
          <span className="tabular">{som(totals.revenue)}</span>
        </div>
      </Card>

      <Card className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-bean-900">Idishlar tekshiruvi</h3>
          <Link to="/idishlar" className="text-sm font-semibold text-bean-700">
            Sozlash
          </Link>
        </div>
        <p className="mt-1 text-xs text-stone-500">Bugun ishlatilgan butilka va stakanlarni sanab, “Sanalgan”ga kiriting — varaqdagi son bilan mos kelishi kerak.</p>
        {noContainer.length > 0 && (
          <Link to="/idishlar" className="mt-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <Icon name="warn" className="size-5 shrink-0" />
            <span>
              Idish turi belgilanmagan: <b>{noContainer.join(', ')}</b>. Belgilash →
            </span>
          </Link>
        )}
        <div className="mt-3 divide-y divide-bean-50">
          {containers.map((c) => {
            const expected = usage.get(c.id) ?? 0;
            const cnt = counted[c.id] ?? null;
            const diff = cnt === null ? null : cnt - expected;
            return (
              <div key={c.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="leading-snug font-semibold">{c.name}</div>
                  <div className="text-xs text-stone-500">
                    Varaqda: <b className="tabular text-stone-800">{expected}</b>
                  </div>
                </div>
                <NumberInput className="w-20 shrink-0" value={cnt} disabled={locked} placeholder="—" aria-label={`${c.name} sanalgan`} onChange={(x) => setCounted((m) => ({ ...m, [c.id]: x }))} />
                <span className={cx('tabular w-10 shrink-0 text-right font-bold', diff === null ? 'text-stone-300' : diff === 0 ? 'text-emerald-700' : 'text-red-700')}>
                  {diff === null ? '—' : diff === 0 ? '✓' : diff > 0 ? `+${diff}` : diff}
                </span>
              </div>
            );
          })}
        </div>
        {containers.some((c) => counted[c.id] != null && counted[c.id] !== (usage.get(c.id) ?? 0)) && (
          <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-800">
            Mos kelmadi. Ortiqcha idish ishlatilgan boʻlsa — varaqda yozilmagan ichimlik boʻlishi mumkin. Kam boʻlsa — varaqda ortiqcha yozilgan yoki stakan ustuni toʻldirilmagan.
          </p>
        )}
      </Card>

      {!locked && (
        <div className="mt-4 flex gap-2">
          {sheet.exists && (
            <Button
              variant="secondary"
              size="lg"
              loading={remove.isPending}
              onClick={async () => {
                if (await confirm('Bu kunning varagʻini butunlay oʻchirasizmi?')) remove.mutate();
              }}
              aria-label="Varaqni oʻchirish"
            >
              <Icon name="trash" />
            </Button>
          )}
          <Button size="lg" className="flex-1" disabled={cupErrors.length > 0} loading={save.isPending} onClick={() => save.mutate()}>
            {dirty || !sheet.exists ? 'Saqlash' : 'Qayta saqlash'}
          </Button>
        </div>
      )}
      {sheet.exists && !dirty && !locked && (
        <p className="mt-2 text-center text-xs text-stone-500">
          <Badge tone="good">Saqlangan</Badge> Kun oxirida <Link to="/kassa" className="font-semibold underline">kassani yoping</Link>.
        </p>
      )}
      {confirmEl}
    </>
  );
}
