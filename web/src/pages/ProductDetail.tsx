import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MovementRow } from '../components/MovementRow';
import { useToast } from '../components/toast';
import { Badge, Button, Card, Empty, ErrorBox, Field, Modal, NumberInput, Page, Section, Spinner, Tabs, TextInput, Thumb, useConfirm } from '../components/ui';
import { REASON_LABEL, api, type Movement, type Product, type WriteoffReason } from '../lib/api';
import { som } from '../lib/format';
import { ProductModal } from './Products';

export function ProductDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm, element } = useConfirm();
  const product = useQuery({ queryKey: ['product', id], queryFn: () => api.get<Product>(`/products/${id}`) });
  const moves = useQuery({ queryKey: ['movements', id], queryFn: () => api.get<Movement[]>(`/movements?productId=${id}&limit=100`) });
  const [editing, setEditing] = useState(false);
  const [writeOff, setWriteOff] = useState(false);
  const [correct, setCorrect] = useState(false);

  const remove = useMutation({
    mutationFn: () => api.del(`/products/${id}`),
    onSuccess: () => {
      toast('Mahsulot oʻchirildi');
      navigate('/mahsulotlar');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  if (product.isPending) return <Page title="Mahsulot" back="/mahsulotlar"><Spinner /></Page>;
  if (product.error) return <Page title="Mahsulot" back="/mahsulotlar"><ErrorBox error={product.error} /></Page>;
  const p = product.data;

  return (
    <Page title={p.name} back="/mahsulotlar" actions={<Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Tahrirlash</Button>}>
      <Card className="flex items-center gap-4">
        <Thumb src={p.imagePath} name={p.name} size="lg" />
        <div className="flex-1 space-y-1 text-sm">
          <div>
            Sotish narxi: <b>{som(p.sellPrice)}</b>
          </div>
          <div>
            Tannarxi: <b>{som(p.avgCost)}</b>
          </div>
          <div>
            Foyda: <b className={p.sellPrice - p.avgCost < 0 ? 'text-red-700' : 'text-emerald-700'}>{som(p.sellPrice - p.avgCost)}</b>
          </div>
          {!p.active && <Badge tone="muted">Faol emas</Badge>}
        </div>
      </Card>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Card className="text-center">
          <div className="text-xs text-stone-500">Vitrinada</div>
          <div className="tabular text-2xl font-bold">{p.standQty}</div>
        </Card>
        <Card className="text-center">
          <div className="text-xs text-stone-500">Omborda</div>
          <div className="tabular text-2xl font-bold">{p.warehouseQty}</div>
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => setWriteOff(true)}>
          Hisobdan chiqarish
        </Button>
        <Button variant="secondary" onClick={() => setCorrect(true)}>
          Qoldiqni tuzatish
        </Button>
      </div>

      <Section title="Tarix">
        {moves.data?.length ? (
          <Card className="divide-y divide-bean-100 p-0">
            {moves.data.map((m) => (
              <MovementRow key={m.id} m={m} showProduct={false} />
            ))}
          </Card>
        ) : (
          <Empty>Hali harakat yoʻq</Empty>
        )}
      </Section>

      <button
        className="mt-6 w-full text-center text-sm text-red-700"
        onClick={async () => {
          if (await confirm(`“${p.name}” mahsulotini oʻchirasizmi? Tarixi bor mahsulotni oʻchirib boʻlmaydi — uni “faol emas” qiling.`)) remove.mutate();
        }}
      >
        Mahsulotni oʻchirish
      </button>

      {editing && <ProductModal product={p} onClose={() => setEditing(false)} />}
      {writeOff && <WriteOffModal p={p} onClose={() => setWriteOff(false)} />}
      {correct && <CorrectModal p={p} onClose={() => setCorrect(false)} />}
      {element}
    </Page>
  );
}

function WriteOffModal({ p, onClose }: { p: Product; onClose: () => void }) {
  const toast = useToast();
  const [from, setFrom] = useState<'stand' | 'warehouse'>(p.standQty > 0 ? 'stand' : 'warehouse');
  const [qty, setQty] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState<WriteoffReason>('gift');
  const have = from === 'stand' ? p.standQty : p.warehouseQty;
  const save = useMutation({
    mutationFn: () => api.post('/writeoffs', { productId: p.id, from, qty, reason, note }),
    onSuccess: () => {
      toast('Hisobdan chiqarildi');
      onClose();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Hisobdan chiqarish"
      footer={
        <Button size="lg" className="w-full" disabled={!qty || qty > have} loading={save.isPending} onClick={() => save.mutate()}>
          Chiqarish{qty ? ` · ${som(qty * p.avgCost)} zarar` : ''}
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-stone-600">Sotilmagan, lekin yoʻqolgan mahsulot: muddati oʻtgan, buzilgan, sovgʻa qilingan. Tannarxi zarar sifatida hisoblanadi, savdoga qoʻshilmaydi.</p>
        <Tabs
          value={from}
          onChange={setFrom}
          options={[
            { value: 'stand', label: `Vitrinadan (${p.standQty})` },
            { value: 'warehouse', label: `Ombordan (${p.warehouseQty})` },
          ]}
        />
        <Field label="Soni">
          <NumberInput value={qty} onChange={setQty} suffix="ta" placeholder="0" />
        </Field>
        {qty !== null && qty > have && <p className="text-sm text-red-700">Faqat {have} ta bor</p>}
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(REASON_LABEL) as WriteoffReason[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={`min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-semibold ${reason === r ? 'border-bean-900 bg-bean-900 text-white' : 'border-bean-200 bg-white text-bean-900'}`}
            >
              {REASON_LABEL[r]}
            </button>
          ))}
        </div>
        <Field label="Izoh (ixtiyoriy)">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Kimga / nima uchun" />
        </Field>
      </div>
    </Modal>
  );
}

function CorrectModal({ p, onClose }: { p: Product; onClose: () => void }) {
  const toast = useToast();
  const [warehouseQty, setWarehouseQty] = useState<number | null>(p.warehouseQty);
  const [standQty, setStandQty] = useState<number | null>(p.standQty);
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: () => api.post('/corrections', { productId: p.id, warehouseQty: warehouseQty ?? 0, standQty: standQty ?? 0, note }),
    onSuccess: () => {
      toast('Qoldiq tuzatildi');
      onClose();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Qoldiqni tuzatish"
      footer={
        <Button size="lg" className="w-full" loading={save.isPending} onClick={() => save.mutate()}>
          Saqlash
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-stone-600">
          Xato kiritilgan sonni toʻgʻrilash uchun. Bu <b>savdo sifatida yozilmaydi</b>. Sotilgan mahsulotlarni hisoblash uchun “Vitrinani sanash”dan foydalaning.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Omborda">
            <NumberInput value={warehouseQty} onChange={setWarehouseQty} suffix="ta" />
          </Field>
          <Field label="Vitrinada">
            <NumberInput value={standQty} onChange={setStandQty} suffix="ta" />
          </Field>
        </div>
        <Field label="Izoh">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nima uchun tuzatildi" />
        </Field>
      </div>
    </Modal>
  );
}
