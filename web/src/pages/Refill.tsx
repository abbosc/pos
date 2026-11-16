import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/toast';
import { Button, Card, Empty, ErrorBox, NumberInput, Page, Spinner, Thumb, cx } from '../components/ui';
import { api, type Product } from '../lib/api';

/** Move goods from the warehouse to the stand. */
export function RefillPage() {
  const toast = useToast();
  const products = useQuery({ queryKey: ['products'], queryFn: () => api.get<Product[]>('/products') });
  const [qty, setQty] = useState<Record<number, number | null>>({});

  const lines = Object.entries(qty)
    .filter(([, v]) => v)
    .map(([id, v]) => ({ productId: Number(id), qty: v! }));
  const total = lines.reduce((s, l) => s + l.qty, 0);
  const tooMuch = (products.data ?? []).some((p) => (qty[p.id] ?? 0) > p.warehouseQty);

  const save = useMutation({
    mutationFn: () => api.post('/refill', { lines }),
    onSuccess: () => {
      setQty({});
      toast(`Vitrinaga ${total} ta mahsulot qoʻyildi`);
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const available = (products.data ?? []).filter((p) => p.warehouseQty > 0);
  const empty = (products.data ?? []).filter((p) => p.warehouseQty === 0);

  return (
    <Page title="Vitrinani toʻldirish" back="/">
      <p className="-mt-2 mb-3 text-sm text-stone-600">Ombordan vitrinaga qancha qoʻyganingizni kiriting.</p>
      {products.isPending ? (
        <Spinner />
      ) : products.error ? (
        <ErrorBox error={products.error} />
      ) : available.length === 0 ? (
        <Empty>
          Omborda mahsulot yoʻq. <Link to="/xarid" className="font-semibold underline">Xarid qoʻshing</Link>
        </Empty>
      ) : (
        <Card className="divide-y divide-bean-100 p-0">
          {available.map((p) => {
            const v = qty[p.id] ?? null;
            const over = (v ?? 0) > p.warehouseQty;
            return (
              <div key={p.id} className="flex items-center gap-3 p-3">
                <Thumb src={p.imagePath} name={p.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className={cx('text-xs', over ? 'font-semibold text-red-700' : 'text-stone-500')}>
                    Omborda {p.warehouseQty} · vitrinada {p.standQty}
                    {v ? ` → ${p.standQty + v}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="h-11 rounded-xl px-2 text-xs font-semibold text-bean-700"
                  onClick={() => setQty((q) => ({ ...q, [p.id]: p.warehouseQty }))}
                >
                  Hammasi
                </button>
                <NumberInput className="w-20" placeholder="0" value={v} aria-label={`${p.name} soni`} onChange={(val) => setQty((q) => ({ ...q, [p.id]: val }))} />
              </div>
            );
          })}
        </Card>
      )}
      {empty.length > 0 && (
        <p className="mt-3 px-1 text-xs text-stone-500">Omborda tugagan: {empty.map((p) => p.name).join(', ')}</p>
      )}
      <Button size="lg" className="mt-4 w-full" disabled={lines.length === 0 || tooMuch} loading={save.isPending} onClick={() => save.mutate()}>
        {tooMuch ? 'Omborda yetarli emas' : `Vitrinaga qoʻyish${total ? ` · ${total} ta` : ''}`}
      </Button>
    </Page>
  );
}
