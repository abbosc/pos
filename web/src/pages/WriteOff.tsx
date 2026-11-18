import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { QtyRow } from '../components/QtyRow';
import { useToast } from '../components/toast';
import { Button, Card, Empty, ErrorBox, Field, Page, Spinner, Tabs, TextInput, cx } from '../components/ui';
import { REASON_LABEL, api, type Product, type WriteoffReason } from '../lib/api';
import { som } from '../lib/format';

const REASONS: WriteoffReason[] = ['gift', 'staff', 'spoiled', 'other'];

/**
 * Snacks that left without being sold: gifts, eaten by us, expired or damaged.
 * Must be entered BEFORE counting the stand, otherwise the count records them as sales.
 */
export function WriteOffPage() {
  const toast = useToast();
  const products = useQuery({ queryKey: ['products'], queryFn: () => api.get<Product[]>('/products') });
  const [reason, setReason] = useState<WriteoffReason>('gift');
  const [from, setFrom] = useState<'stand' | 'warehouse'>('stand');
  const [qty, setQty] = useState<Record<number, number | null>>({});
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');

  const all = products.data ?? [];
  const byId = new Map(all.map((p) => [p.id, p]));
  const lines = Object.entries(qty)
    .filter(([, v]) => v)
    .map(([id, v]) => ({ productId: Number(id), qty: v! }));
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const totalCost = lines.reduce((s, l) => s + l.qty * (byId.get(l.productId)?.avgCost ?? 0), 0);
  const have = (p: Product) => (from === 'stand' ? p.standQty : p.warehouseQty);
  const tooMuch = lines.some((l) => l.qty > have(byId.get(l.productId)!));

  const save = useMutation({
    mutationFn: () => api.post<{ qty: number; cost: number }>('/writeoffs/bulk', { reason, from, note, lines }),
    onSuccess: (r) => {
      setQty({});
      setNote('');
      toast(`${REASON_LABEL[reason]}: ${r.qty} ta yozildi`);
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const s = search.trim().toLowerCase();
  const list = all.filter((p) => have(p) > 0 && (!s || p.name.toLowerCase().includes(s)));

  return (
    <Page title="Sovgʻa / yeyilgan" back="/">
      <p className="-mt-2 mb-3 text-sm text-stone-600">
        Sotilmagan, lekin vitrinadan ketgan mahsulotlar. <b>Vitrinani sanashdan oldin</b> kiriting — aks holda sanoq ularni sotilgan deb hisoblaydi.
      </p>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={cx(
                'min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-semibold',
                reason === r ? 'border-bean-900 bg-bean-900 text-white' : 'border-bean-200 bg-white text-bean-900',
              )}
            >
              {REASON_LABEL[r]}
            </button>
          ))}
        </div>
        <Tabs
          value={from}
          onChange={(v) => {
            setFrom(v);
            setQty({});
          }}
          options={[
            { value: 'stand', label: 'Vitrinadan' },
            { value: 'warehouse', label: 'Ombordan' },
          ]}
        />
      </div>

      <div className="mt-4">
        {products.isPending ? (
          <Spinner />
        ) : products.error ? (
          <ErrorBox error={products.error} />
        ) : all.length === 0 ? (
          <Empty>
            Hali mahsulot yoʻq. <Link className="font-semibold underline" to="/mahsulotlar">Mahsulot qoʻshing</Link>
          </Empty>
        ) : (
          <>
            {all.length > 8 && <TextInput placeholder="Qidirish…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3" />}
            <Card className="divide-y divide-bean-100 p-0">
              {list.map((p) => {
                const v = qty[p.id] ?? null;
                const over = (v ?? 0) > have(p);
                return (
                  <QtyRow
                    key={p.id}
                    image={p.imagePath}
                    name={p.name}
                    value={v}
                    onChange={(val) => setQty((q) => ({ ...q, [p.id]: val }))}
                    info={
                      <span className={cx(over && 'font-semibold text-red-700')}>
                        {from === 'stand' ? 'Vitrinada' : 'Omborda'} <b className="tabular">{have(p)}</b> ta
                        {v ? <> · tannarx {som(v * p.avgCost)}</> : null}
                      </span>
                    }
                  />
                );
              })}
              {list.length === 0 && <div className="p-4 text-center text-sm text-stone-500">{from === 'stand' ? 'Vitrinada' : 'Omborda'} mahsulot yoʻq</div>}
            </Card>
          </>
        )}
      </div>

      <Field label="Izoh (ixtiyoriy)">
        <TextInput className="mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Kimga / nima uchun" />
      </Field>

      <Button size="lg" className="mt-4 w-full" disabled={lines.length === 0 || tooMuch} loading={save.isPending} onClick={() => save.mutate()}>
        {tooMuch ? 'Yetarli emas' : `Saqlash${totalQty ? ` · ${totalQty} ta · ${som(totalCost)}` : ''}`}
      </Button>
      <p className="mt-2 text-center text-xs text-stone-500">Tannarxi zarar sifatida hisobotda koʻrinadi, savdoga qoʻshilmaydi.</p>
    </Page>
  );
}
