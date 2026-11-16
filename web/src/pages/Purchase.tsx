import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/toast';
import { Badge, Button, Card, Empty, Field, Icon, MoneyInput, NumberInput, Page, Section, Select, Spinner, TextInput, Toggle, useConfirm } from '../components/ui';
import { api, type Product, type Purchase } from '../lib/api';
import { dayLabel, num, som, todayIso } from '../lib/format';

type Line = { key: number; productId: number | null; qty: number | null; total: number | null };

let keySeq = 1;
const newLine = (): Line => ({ key: keySeq++, productId: null, qty: null, total: null });

/** Buy goods for the warehouse. Records the expense and updates the average cost. */
export function PurchasePage() {
  const toast = useToast();
  const products = useQuery({ queryKey: ['products'], queryFn: () => api.get<Product[]>('/products') });
  const purchases = useQuery({ queryKey: ['purchases'], queryFn: () => api.get<Purchase[]>('/purchases') });
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [date, setDate] = useState(todayIso());
  const [paidFromCash, setPaidFromCash] = useState(true);
  const [note, setNote] = useState('');
  const { confirm, element: confirmEl } = useConfirm();

  const valid = lines.filter((l) => l.productId && l.qty && l.total);
  const total = valid.reduce((s, l) => s + l.total!, 0);
  const incomplete = lines.some((l) => (l.productId || l.qty || l.total) && !(l.productId && l.qty && l.total));
  const byId = new Map((products.data ?? []).map((p) => [p.id, p]));

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = useMutation({
    mutationFn: () =>
      api.post('/purchases', {
        date,
        paidFromCash,
        note,
        lines: valid.map((l) => ({ productId: l.productId, qty: l.qty, total: l.total })),
      }),
    onSuccess: () => {
      toast(`Xarid saqlandi · ${som(total)}`);
      setLines([newLine()]);
      setNote('');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/purchases/${id}`),
    onSuccess: () => toast('Xarid oʻchirildi'),
    onError: (e) => toast((e as Error).message, 'error'),
  });

  return (
    <Page title="Mahsulot xaridi" back="/">
      <p className="-mt-2 mb-3 text-sm text-stone-600">
        Sotib olingan mahsulotlar omborga qoʻshiladi va xarajat sifatida yoziladi. Yangi mahsulot boʻlsa, avval{' '}
        <Link to="/mahsulotlar?yangi=1" className="font-semibold underline">mahsulot qoʻshing</Link>.
      </p>
      {products.isPending ? (
        <Spinner />
      ) : (
        <Card className="space-y-4">
          {lines.map((l, i) => {
            const p = l.productId ? byId.get(l.productId) : undefined;
            const unit = l.qty && l.total ? Math.round(l.total / l.qty) : null;
            return (
              <div key={l.key} className="space-y-2 border-b border-bean-100 pb-4 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-bean-700">{i + 1}.</span>
                  <Select
                    value={l.productId ?? ''}
                    onChange={(e) => update(l.key, { productId: e.target.value ? Number(e.target.value) : null })}
                    aria-label="Mahsulot"
                  >
                    <option value="">Mahsulotni tanlang…</option>
                    {(products.data ?? []).map((p) => (
                      <option key={p.id} value={p.id} disabled={lines.some((x) => x.key !== l.key && x.productId === p.id)}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                  {lines.length > 1 && (
                    <button className="grid size-11 shrink-0 place-items-center rounded-xl text-stone-500 hover:bg-bean-100" aria-label="Qatorni oʻchirish" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                      <Icon name="trash" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Soni">
                    <NumberInput value={l.qty} onChange={(v) => update(l.key, { qty: v })} suffix="ta" placeholder="0" />
                  </Field>
                  <Field label="Jami narxi">
                    <MoneyInput value={l.total} onChange={(v) => update(l.key, { total: v })} />
                  </Field>
                </div>
                {unit !== null && (
                  <p className="text-xs text-stone-500">
                    Bittasi: <b>{som(unit)}</b>
                    {p && <> · sotish narxi {som(p.sellPrice)} · foyda {som(p.sellPrice - unit)}</>}
                  </p>
                )}
              </div>
            );
          })}
          <Button variant="secondary" className="w-full" onClick={() => setLines((ls) => [...ls, newLine()])}>
            <Icon name="plus" /> Yana mahsulot
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Sana">
              <TextInput type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value || todayIso())} />
            </Field>
            <Field label="Izoh">
              <TextInput value={note} placeholder="Doʻkon nomi…" onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          <Toggle checked={paidFromCash} onChange={setPaidFromCash} label="Kassadagi puldan toʻlandi" hint="Oʻchirsangiz, kassadagi kutilgan pul kamaymaydi" />
        </Card>
      )}
      <Button size="lg" className="mt-4 w-full" disabled={valid.length === 0 || incomplete} loading={save.isPending} onClick={() => save.mutate()}>
        {incomplete ? 'Barcha maydonlarni toʻldiring' : `Saqlash · ${som(total)}`}
      </Button>

      <Section title="Oxirgi xaridlar">
        {purchases.data?.length ? (
          <Card className="divide-y divide-bean-100 p-0">
            {purchases.data.map((pu) => (
              <div key={pu.id} className="flex items-start gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {dayLabel(pu.date)} · {som(pu.total)}
                  </div>
                  <div className="text-stone-500">{pu.lines.map((l) => `${l.productName} × ${num(l.qty)}`).join(', ')}</div>
                  {!pu.paidFromCash && <Badge tone="muted">Kassadan emas</Badge>}
                </div>
                {pu.locked ? (
                  <Badge tone="muted">Yopilgan</Badge>
                ) : (
                  <button
                    className="grid size-9 place-items-center rounded-lg text-stone-500 hover:bg-bean-100"
                    aria-label="Xaridni oʻchirish"
                    onClick={async () => {
                      if (await confirm('Bu xaridni oʻchirasizmi? Mahsulotlar ombordan ayriladi va xarajat oʻchiriladi.')) remove.mutate(pu.id);
                    }}
                  >
                    <Icon name="trash" />
                  </button>
                )}
              </div>
            ))}
          </Card>
        ) : (
          <Empty>Hali xarid yoʻq</Empty>
        )}
      </Section>
      {confirmEl}
    </Page>
  );
}
