import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useToast } from '../components/toast';
import { Badge, Button, Card, ErrorBox, Icon, NumberInput, Page, Spinner, TextInput, Thumb, cx, useConfirm } from '../components/ui';
import { api, type Sheet, type SheetSummary } from '../lib/api';
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

function SheetForm({ sheet }: { sheet: Sheet }) {
  const toast = useToast();
  const { confirm, element: confirmEl } = useConfirm();
  const initial = useMemo(() => Object.fromEntries(sheet.lines.map((l) => [l.drinkId, { sold: l.soldQty || null, gift: l.giftQty || null }])), [sheet]);
  const [values, setValues] = useState<Record<number, { sold: number | null; gift: number | null }>>(initial);
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

  const totals = sheet.lines.reduce(
    (t, l) => {
      const v = values[l.drinkId];
      t.sold += v?.sold ?? 0;
      t.gift += v?.gift ?? 0;
      t.revenue += (v?.sold ?? 0) * l.price;
      return t;
    },
    { sold: 0, gift: 0, revenue: 0 },
  );
  const dirty =
    note !== (sheet.note ?? '') ||
    sheet.lines.some((l) => (values[l.drinkId]?.sold ?? 0) !== l.soldQty || (values[l.drinkId]?.gift ?? 0) !== l.giftQty);

  const save = useMutation({
    mutationFn: () =>
      api.put<Sheet>(`/sheets/${sheet.date}`, {
        note,
        lines: sheet.lines.map((l) => ({ drinkId: l.drinkId, soldQty: values[l.drinkId]?.sold ?? 0, giftQty: values[l.drinkId]?.gift ?? 0 })),
      }),
    onSuccess: () => toast(`Varaq saqlandi · ${som(totals.revenue)}`),
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/sheets/${sheet.date}`),
    onSuccess: () => toast('Varaq oʻchirildi'),
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const set = (id: number, field: 'sold' | 'gift', v: number | null) =>
    setValues((s) => ({ ...s, [id]: { sold: s[id]?.sold ?? null, gift: s[id]?.gift ?? null, [field]: v } }));

  return (
    <>
      {locked && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-stone-100 p-3 text-sm text-stone-700">
          <Icon name="lock" className="size-4" /> Bu kunning kassasi yopilgan. Oʻzgartirish uchun kassani qayta oching.
        </div>
      )}
      {!sheet.exists && !locked && <p className="-mt-1 mb-3 text-sm text-stone-600">Qogʻoz varaqdagi “Sotildi” va “Sovgʻa” ustunlarini kiriting.</p>}

      <div className="space-y-4">
        {groups.map(([group, lines]) => (
          <Card key={group} className="p-0">
            <div className="flex items-center justify-between border-b border-bean-100 px-3 py-2 text-xs font-semibold tracking-wide text-bean-700 uppercase">
              <span>{group}</span>
              <span className="flex gap-2 normal-case">
                <span className="w-16 text-center">Sotildi</span>
                <span className="w-16 text-center">Sovgʻa</span>
              </span>
            </div>
            <div className="divide-y divide-bean-50">
              {lines.map((l) => {
                const v = values[l.drinkId];
                const sum = (v?.sold ?? 0) * l.price;
                return (
                  <div key={l.drinkId} className="flex items-center gap-2 px-3 py-2">
                    <Thumb src={l.imagePath} name={l.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{l.name}</div>
                      <div className="tabular text-xs text-stone-500">
                        {num(l.price / 1000)} ming
                        {sum > 0 && <span className="font-semibold text-bean-800"> · {num(sum)}</span>}
                      </div>
                    </div>
                    <NumberInput className="w-16" value={v?.sold ?? null} disabled={locked} placeholder="0" aria-label={`${l.name} sotildi`} onChange={(x) => set(l.drinkId, 'sold', x)} />
                    <NumberInput
                      className={cx('w-16', (v?.gift ?? 0) > 0 && '[&_input]:border-amber-300 [&_input]:bg-amber-50')}
                      value={v?.gift ?? null}
                      disabled={locked}
                      placeholder="0"
                      aria-label={`${l.name} sovgʻa`}
                      onChange={(x) => set(l.drinkId, 'gift', x)}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
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
        <div className="mt-2 flex justify-between border-t border-bean-100 pt-2 text-lg font-bold text-bean-900">
          <span>Jami savdo</span>
          <span className="tabular">{som(totals.revenue)}</span>
        </div>
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
          <Button size="lg" className="flex-1" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
            {dirty ? 'Saqlash' : sheet.exists ? 'Saqlangan' : 'Saqlash'}
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
