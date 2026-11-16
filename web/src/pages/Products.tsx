import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ImagePicker } from '../components/ImagePicker';
import { useToast } from '../components/toast';
import { Badge, Button, Card, Empty, ErrorBox, Field, Icon, Modal, MoneyInput, NumberInput, Page, Spinner, TextInput, Thumb, Toggle } from '../components/ui';
import { api, type Product } from '../lib/api';
import { num, som } from '../lib/format';

export function ProductsPage() {
  const [params, setParams] = useSearchParams();
  const [showInactive, setShowInactive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const products = useQuery({ queryKey: ['products', 'all'], queryFn: () => api.get<Product[]>('/products?all=1') });

  useEffect(() => {
    if (params.get('yangi')) {
      setCreating(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (products.data ?? []).filter((p) => (showInactive || p.active) && (!s || p.name.toLowerCase().includes(s)));
  }, [products.data, showInactive, search]);

  const totals = (products.data ?? [])
    .filter((p) => p.active)
    .reduce(
      (t, p) => {
        t.stand += p.standQty;
        t.warehouse += p.warehouseQty;
        t.value += (p.standQty + p.warehouseQty) * p.avgCost;
        return t;
      },
      { stand: 0, warehouse: 0, value: 0 },
    );
  const inactiveCount = (products.data ?? []).filter((p) => !p.active).length;

  return (
    <Page
      title="Mahsulotlar"
      back="/yana"
      actions={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Icon name="plus" className="size-4" /> Yangi
        </Button>
      }
    >
      {products.isPending ? (
        <Spinner />
      ) : products.error ? (
        <ErrorBox error={products.error} />
      ) : products.data.length === 0 ? (
        <Empty>
          Hali mahsulot yoʻq. Snickers, Twix, suv kabi sotiladigan mahsulotlarni qoʻshing.
          <div className="mt-3">
            <Button onClick={() => setCreating(true)}>Mahsulot qoʻshish</Button>
          </div>
        </Empty>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            <Card className="p-3">
              <div className="text-xs text-stone-500">Vitrinada</div>
              <div className="tabular font-bold">{num(totals.stand)} ta</div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-stone-500">Omborda</div>
              <div className="tabular font-bold">{num(totals.warehouse)} ta</div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-stone-500">Tannarxi</div>
              <div className="tabular font-bold">{num(Math.round(totals.value / 1000))}k</div>
            </Card>
          </div>
          {products.data.length > 8 && <TextInput placeholder="Qidirish…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3" />}
          <Card className="divide-y divide-bean-100 p-0">
            {list.map((p) => {
              const low = p.lowStockLevel > 0 && p.standQty <= p.lowStockLevel;
              return (
                <Link key={p.id} to={`/mahsulotlar/${p.id}`} className="flex items-center gap-3 p-3">
                  <Thumb src={p.imagePath} name={p.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{p.name}</span>
                      {!p.active && <Badge tone="muted">Faol emas</Badge>}
                    </div>
                    <div className="text-xs text-stone-500">
                      {som(p.sellPrice)} · tannarx {som(p.avgCost)}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className={low ? 'font-semibold text-amber-700' : 'text-stone-700'}>Vitrina {p.standQty}</div>
                    <div className="text-stone-500">Ombor {p.warehouseQty}</div>
                  </div>
                  <Icon name="chevron" className="size-4 text-stone-400" />
                </Link>
              );
            })}
          </Card>
          {inactiveCount > 0 && (
            <div className="mt-3">
              <Toggle checked={showInactive} onChange={setShowInactive} label={`Faol boʻlmaganlarni koʻrsatish (${inactiveCount})`} />
            </div>
          )}
        </>
      )}
      {creating && <ProductModal onClose={() => setCreating(false)} />}
    </Page>
  );
}

/** Create or edit a product. */
export function ProductModal({ product, onClose }: { product?: Product; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(product?.name ?? '');
  const [sellPrice, setSellPrice] = useState<number | null>(product?.sellPrice ?? null);
  const [cost, setCost] = useState<number | null>(product ? product.avgCost : null);
  const [warehouseQty, setWarehouseQty] = useState<number | null>(null);
  const [standQty, setStandQty] = useState<number | null>(null);
  const [lowStockLevel, setLowStockLevel] = useState<number | null>(product?.lowStockLevel ?? null);
  const [active, setActive] = useState(product?.active ?? true);
  const [pendingImage, setPendingImage] = useState<File | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (product) {
        return api.patch<Product>(`/products/${product.id}`, { name, sellPrice, avgCost: cost ?? 0, lowStockLevel: lowStockLevel ?? 0, active });
      }
      const created = await api.post<Product>('/products', {
        name,
        sellPrice,
        cost: cost ?? 0,
        warehouseQty: warehouseQty ?? 0,
        standQty: standQty ?? 0,
        lowStockLevel: lowStockLevel ?? 0,
      });
      if (pendingImage) await api.upload(`/products/${created.id}/image`, pendingImage).catch(() => toast('Rasm yuklanmadi', 'error'));
      return created;
    },
    onSuccess: (p) => {
      toast(product ? 'Saqlandi' : `“${p.name}” qoʻshildi`);
      onClose();
      if (!product) navigate(`/mahsulotlar/${p.id}`);
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const margin = sellPrice !== null && cost ? sellPrice - cost : null;

  return (
    <Modal
      open
      onClose={onClose}
      title={product ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot'}
      footer={
        <Button size="lg" className="w-full" disabled={!name.trim() || sellPrice === null} loading={save.isPending} onClick={() => save.mutate()}>
          Saqlash
        </Button>
      }
    >
      <div className="space-y-3">
        {product ? (
          <ImagePicker
            src={product.imagePath}
            name={name}
            onPick={async (f) => {
              await api.upload(`/products/${product.id}/image`, f);
              await qc.invalidateQueries();
            }}
            onRemove={async () => {
              await api.del(`/products/${product.id}/image`);
              await qc.invalidateQueries();
            }}
          />
        ) : (
          <ImagePicker src={pendingImage ? URL.createObjectURL(pendingImage) : null} name={name} onPick={async (f) => setPendingImage(f)} />
        )}
        <Field label="Nomi">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Snickers" autoFocus={!product} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Sotish narxi">
            <MoneyInput value={sellPrice} onChange={setSellPrice} />
          </Field>
          <Field label={product ? 'Tannarxi (oʻrtacha)' : 'Tannarxi (bittasi)'}>
            <MoneyInput value={cost} onChange={setCost} />
          </Field>
        </div>
        {margin !== null && (
          <p className={margin < 0 ? 'text-sm text-red-700' : 'text-sm text-stone-600'}>
            Bittasidan foyda: <b>{som(margin)}</b>
          </p>
        )}
        {product && <p className="text-xs text-stone-500">Tannarx har bir xariddan keyin avtomatik yangilanadi. Sotish narxini oʻzgartirishdan oldin vitrinani sanash tavsiya etiladi.</p>}
        {!product && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Hozir omborda">
              <NumberInput value={warehouseQty} onChange={setWarehouseQty} suffix="ta" placeholder="0" />
            </Field>
            <Field label="Hozir vitrinada">
              <NumberInput value={standQty} onChange={setStandQty} suffix="ta" placeholder="0" />
            </Field>
          </div>
        )}
        <Field label="Ogohlantirish chegarasi" hint="Vitrinada shu sondan kam qolsa, bosh sahifada eslatma chiqadi. 0 — oʻchirilgan.">
          <NumberInput value={lowStockLevel} onChange={setLowStockLevel} suffix="ta" placeholder="0" />
        </Field>
        {product && <Toggle checked={active} onChange={setActive} label="Faol" hint="Faol boʻlmagan mahsulot sanash va toʻldirish roʻyxatlarida koʻrinmaydi" />}
      </div>
    </Modal>
  );
}
