import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { QtyRow } from '../components/QtyRow';
import { useToast } from '../components/toast';
import { Button, Card, Empty, ErrorBox, Page, Spinner, TextInput, cx } from '../components/ui';
import { api, type Product } from '../lib/api';

/** Move goods from the warehouse to the stand. */
export function RefillPage() {
  const toast = useToast();
  const products = useQuery({ queryKey: ['products'], queryFn: () => api.get<Product[]>('/products') });
  const [qty, setQty] = useState<Record<number, number | null>>({});
  const [search, setSearch] = useState('');

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

  const s = search.trim().toLowerCase();
  const available = (products.data ?? []).filter((p) => p.warehouseQty > 0 && (!s || p.name.toLowerCase().includes(s)));
  const empty = (products.data ?? []).filter((p) => p.warehouseQty === 0);

  return (
    <Page title="Vitrinani toʻldirish" back="/">
      <p className="-mt-2 mb-3 text-sm text-stone-600">Ombordan vitrinaga qancha qoʻyganingizni kiriting.</p>
      {products.isPending ? (
        <Spinner />
      ) : products.error ? (
        <ErrorBox error={products.error} />
      ) : (products.data ?? []).every((p) => p.warehouseQty === 0) ? (
        <Empty>
          Omborda mahsulot yoʻq. <Link to="/xarid" className="font-semibold underline">Xarid qoʻshing</Link>
        </Empty>
      ) : (
        <>
          {(products.data?.length ?? 0) > 8 && <TextInput placeholder="Qidirish…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3" />}
          <Card className="divide-y divide-bean-100 p-0">
            {available.map((p) => {
              const v = qty[p.id] ?? null;
              const over = (v ?? 0) > p.warehouseQty;
              return (
                <QtyRow
                  key={p.id}
                  image={p.imagePath}
                  name={p.name}
                  value={v}
                  onChange={(val) => setQty((q) => ({ ...q, [p.id]: val }))}
                  info={
                    <span className={cx(over && 'font-semibold text-red-700')}>
                      <span className="whitespace-nowrap">Ombor <b className="tabular">{p.warehouseQty}</b></span> ·{' '}
                      <span className="whitespace-nowrap">
                        Vitrina <b className="tabular">{p.standQty}</b>
                        {v ? <> → <b className="tabular">{p.standQty + v}</b></> : null}
                      </span>
                    </span>
                  }
                  action={
                    <button type="button" className="text-xs font-semibold text-bean-700" onClick={() => setQty((q) => ({ ...q, [p.id]: p.warehouseQty }))}>
                      Hammasi
                    </button>
                  }
                />
              );
            })}
            {available.length === 0 && <div className="p-4 text-center text-sm text-stone-500">Topilmadi</div>}
          </Card>
        </>
      )}
      {empty.length > 0 && <p className="mt-3 px-1 text-xs text-stone-500">Omborda tugagan: {empty.map((p) => p.name).join(', ')}</p>}
      <Button size="lg" className="mt-4 w-full" disabled={lines.length === 0 || tooMuch} loading={save.isPending} onClick={() => save.mutate()}>
        {tooMuch ? 'Omborda yetarli emas' : `Vitrinaga qoʻyish${total ? ` · ${total} ta` : ''}`}
      </Button>
    </Page>
  );
}
