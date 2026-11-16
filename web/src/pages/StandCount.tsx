import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/toast';
import { Badge, Button, Card, Empty, ErrorBox, Modal, NumberInput, Page, Section, Spinner, TextInput, Thumb, Toggle, cx, useConfirm } from '../components/ui';
import { api, type Product, type StandCountResult, type StandCountSummary } from '../lib/api';
import { dateTime, num, som } from '../lib/format';

/**
 * Enter what is on the stand now. Missing pieces since the last count (plus refills) are sales.
 */
export function StandCountPage() {
  const toast = useToast();
  const products = useQuery({ queryKey: ['products'], queryFn: () => api.get<Product[]>('/products') });
  const history = useQuery({ queryKey: ['stand-counts'], queryFn: () => api.get<StandCountSummary[]>('/stand-counts') });
  const [counts, setCounts] = useState<Record<number, number | null>>({});
  const [search, setSearch] = useState('');
  const [surplusFromWarehouse, setSurplusFromWarehouse] = useState(true);
  const [result, setResult] = useState<StandCountResult | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const { confirm, element: confirmEl } = useConfirm();

  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (products.data ?? []).filter((p) => !s || p.name.toLowerCase().includes(s));
  }, [products.data, search]);

  const entered = (products.data ?? []).filter((p) => counts[p.id] !== undefined && counts[p.id] !== null);
  const preview = entered.map((p) => {
    const counted = counts[p.id]!;
    const sold = Math.max(0, p.standQty - counted);
    return { p, counted, sold, surplus: Math.max(0, counted - p.standQty), revenue: sold * p.sellPrice };
  });
  const previewSold = preview.reduce((s, r) => s + r.sold, 0);
  const previewRevenue = preview.reduce((s, r) => s + r.revenue, 0);

  const save = useMutation({
    mutationFn: () =>
      api.post<StandCountResult>('/stand-counts', {
        surplusFromWarehouse,
        lines: entered.map((p) => ({ productId: p.id, counted: counts[p.id] })),
      }),
    onSuccess: (r) => {
      setCounts({});
      setReviewOpen(false);
      setResult(r);
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const undo = useMutation({
    mutationFn: (id: number) => api.del(`/stand-counts/${id}`),
    onSuccess: () => toast('Sanoq bekor qilindi'),
    onError: (e) => toast((e as Error).message, 'error'),
  });

  return (
    <Page title="Vitrinani sanash" actions={<Link to="/toldirish" className="text-sm font-semibold text-bean-700">Toʻldirish →</Link>}>
      <p className="-mt-2 mb-3 text-sm text-stone-600">
        Vitrinada hozir nechta borligini kiriting. Tizim oxirgi sanoqdan beri qancha sotilganini hisoblaydi. Hammasini sanash shart emas.
      </p>

      {products.isPending ? (
        <Spinner />
      ) : products.error ? (
        <ErrorBox error={products.error} onRetry={() => products.refetch()} />
      ) : products.data.length === 0 ? (
        <Empty>
          Hali mahsulot yoʻq. <Link className="font-semibold text-bean-800 underline" to="/mahsulotlar">Mahsulot qoʻshing</Link>
        </Empty>
      ) : (
        <>
          {products.data.length > 8 && (
            <TextInput placeholder="Qidirish…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3" />
          )}
          <Card className="divide-y divide-bean-100 p-0">
            {list.map((p) => {
              const v = counts[p.id] ?? null;
              const sold = v !== null ? p.standQty - v : 0;
              return (
                <div key={p.id} className="flex items-center gap-3 p-3">
                  <Thumb src={p.imagePath} name={p.name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="text-xs text-stone-500">
                      Kutilgan: <b className="tabular text-stone-700">{p.standQty}</b> · {som(p.sellPrice)}
                    </div>
                    {v !== null && sold > 0 && <div className="text-xs font-semibold text-emerald-700">Sotildi: {sold} ta = {som(sold * p.sellPrice)}</div>}
                    {v !== null && sold < 0 && <div className="text-xs font-semibold text-amber-700">Kutilganidan {-sold} ta koʻp</div>}
                  </div>
                  <NumberInput
                    className="w-24"
                    placeholder={String(p.standQty)}
                    value={v}
                    aria-label={`${p.name} soni`}
                    onChange={(val) => setCounts((c) => ({ ...c, [p.id]: val }))}
                  />
                </div>
              );
            })}
            {list.length === 0 && <div className="p-4 text-center text-sm text-stone-500">Topilmadi</div>}
          </Card>

          <div className="pointer-events-none fixed inset-x-0 bottom-[68px] z-30 px-4 pb-safe">
            <div className="pointer-events-auto mx-auto flex max-w-3xl items-center gap-3 rounded-2xl bg-bean-900 p-3 pl-4 text-white shadow-xl">
              <div className="flex-1 text-sm">
                <div className="font-semibold">{entered.length} ta mahsulot sanaldi</div>
                <div className="text-bean-200">
                  Sotilgan: {num(previewSold)} ta · {som(previewRevenue)}
                </div>
              </div>
              <Button variant="secondary" disabled={entered.length === 0} onClick={() => setReviewOpen(true)}>
                Saqlash
              </Button>
            </div>
          </div>
        </>
      )}

      <Section title="Oxirgi sanoqlar">
        {history.data?.length ? (
          <Card className="divide-y divide-bean-100 p-0">
            {history.data.slice(0, 10).map((h) => (
              <div key={h.id} className="flex items-center gap-3 p-3 text-sm">
                <div className="flex-1">
                  <div className="font-medium">{dateTime(h.createdAt)}</div>
                  <div className="text-stone-500">
                    {h.soldQty} ta sotilgan · {som(h.revenue)}
                  </div>
                </div>
                {h.locked ? (
                  <Badge tone="muted">Kassa yopilgan</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (await confirm('Bu sanoqni bekor qilasizmi? Vitrinadagi soni va savdo sanoqdan oldingi holatga qaytadi.')) undo.mutate(h.id);
                    }}
                  >
                    Bekor qilish
                  </Button>
                )}
              </div>
            ))}
          </Card>
        ) : (
          <Empty>Hali sanoq yoʻq</Empty>
        )}
      </Section>
      <div className="h-24" />

      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Sanoqni tekshiring"
        footer={
          <Button size="lg" className="w-full" loading={save.isPending} onClick={() => save.mutate()}>
            Tasdiqlash · {som(previewRevenue)}
          </Button>
        }
      >
        <div className="space-y-2">
          {preview.map(({ p, counted, sold, surplus, revenue }) => (
            <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex-1 truncate">{p.name}</span>
              <span className="tabular text-stone-500">
                {p.standQty} → {counted}
              </span>
              <span className={cx('tabular w-32 text-right font-semibold', surplus > 0 ? 'text-amber-700' : sold > 0 ? 'text-emerald-700' : 'text-stone-400')}>
                {surplus > 0 ? `+${surplus} ortiqcha` : sold > 0 ? `${sold} ta · ${num(revenue)}` : 'oʻzgarmadi'}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-between border-t border-bean-100 pt-3 font-bold">
          <span>Jami sotilgan: {previewSold} ta</span>
          <span>{som(previewRevenue)}</span>
        </div>
        {preview.some((r) => r.surplus > 0) && (
          <div className="mt-4 rounded-xl bg-amber-50 p-3">
            <Toggle
              checked={surplusFromWarehouse}
              onChange={setSurplusFromWarehouse}
              label="Ortiqchasini ombordan olingan deb hisoblash"
              hint="Vitrinaga ombordan qoʻyilgan, lekin “Toʻldirish”da yozilmagan boʻlsa. Omborda yetarli boʻlmasa, tuzatish sifatida yoziladi."
            />
          </div>
        )}
      </Modal>

      <Modal open={!!result} onClose={() => setResult(null)} title="Sanoq saqlandi" footer={<Button className="w-full" onClick={() => setResult(null)}>Yaxshi</Button>}>
        {result && (
          <div className="text-center">
            <div className="text-sm text-stone-500">Sotilgan</div>
            <div className="text-3xl font-bold text-bean-900">{som(result.revenue)}</div>
            <div className="mt-1 text-sm text-stone-600">{result.soldQty} ta mahsulot</div>
            <div className="mt-4 space-y-1 text-left text-sm">
              {result.lines
                .filter((l) => l.sold || l.surplus)
                .map((l) => (
                  <div key={l.productId} className="flex justify-between gap-2">
                    <span>{l.name}</span>
                    <span className="tabular">
                      {l.sold ? `${l.sold} ta sotildi` : `+${l.surplus} (${l.surplusSource === 'warehouse' ? 'ombordan' : 'tuzatish'})`}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </Modal>
      {confirmEl}
    </Page>
  );
}
