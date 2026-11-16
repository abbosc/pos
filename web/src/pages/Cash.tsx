import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/toast';
import { Badge, Button, Card, Empty, ErrorBox, Field, Icon, Modal, MoneyInput, Page, Section, Spinner, Tabs, TextInput, cx, useConfirm } from '../components/ui';
import { api, type CashClose, type CashMovement, type CashStatus } from '../lib/api';
import { dateTime, relativeDay, signedSom, som } from '../lib/format';

export function CashPage() {
  const status = useQuery({ queryKey: ['cash'], queryFn: () => api.get<CashStatus>('/cash') });
  const closes = useQuery({ queryKey: ['cash-closes'], queryFn: () => api.get<CashClose[]>('/cash/closes') });
  const movements = useQuery({ queryKey: ['cash-movements'], queryFn: () => api.get<CashMovement[]>('/cash/movements') });
  const [moveOpen, setMoveOpen] = useState(false);

  return (
    <Page
      title="Kassa"
      actions={
        status.data?.hasOpening && (
          <Button size="sm" variant="secondary" onClick={() => setMoveOpen(true)}>
            Pul olish / qoʻyish
          </Button>
        )
      }
    >
      {status.isPending ? (
        <Spinner />
      ) : status.error ? (
        <ErrorBox error={status.error} onRetry={() => status.refetch()} />
      ) : !status.data.hasOpening ? (
        <OpeningForm />
      ) : (
        <>
          <Breakdown s={status.data} />
          <CloseForm s={status.data} />
        </>
      )}

      <OpenMovements list={movements.data?.filter((m) => !m.locked) ?? []} />

      <Section title="Yopilishlar tarixi">
        <ClosesHistory closes={closes.data ?? []} />
      </Section>

      <MovementModal open={moveOpen} onClose={() => setMoveOpen(false)} />
    </Page>
  );
}

function OpeningForm() {
  const toast = useToast();
  const [amount, setAmount] = useState<number | null>(null);
  const save = useMutation({
    mutationFn: () => api.post('/cash/close', { counted: amount, isOpening: true, note: 'Boshlangʻich pul' }),
    onSuccess: () => toast('Boshlangʻich pul saqlandi'),
    onError: (e) => toast((e as Error).message, 'error'),
  });
  return (
    <Card>
      <h2 className="font-bold text-bean-900">Boshlangʻich pul</h2>
      <p className="mt-1 mb-3 text-sm text-stone-600">
        Kassada hozir qancha pul borligini sanab kiriting. Shundan keyin tizim har bir savdo va xarajatni hisobga olib, kassada qancha boʻlishi kerakligini koʻrsatadi.
      </p>
      <MoneyInput value={amount} onChange={setAmount} autoFocus />
      <Button size="lg" className="mt-3 w-full" disabled={amount === null} loading={save.isPending} onClick={() => save.mutate()}>
        Saqlash
      </Button>
    </Card>
  );
}

function Row({ label, value, sign, sub, to }: { label: string; value: number; sign: '+' | '−' | ''; sub?: ReactNode; to?: string }) {
  const content = (
    <div className="flex items-start justify-between gap-3 py-2">
      <div>
        <div className="text-sm text-stone-700">{label}</div>
        {sub && <div className="text-xs text-stone-500">{sub}</div>}
      </div>
      <div className={cx('tabular text-sm font-semibold', sign === '−' && value ? 'text-red-700' : sign === '+' && value ? 'text-emerald-700' : 'text-stone-800')}>
        {sign && value ? sign : ''}
        {som(value)}
      </div>
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

function Breakdown({ s }: { s: CashStatus }) {
  return (
    <Card>
      <div className="divide-y divide-bean-50">
        <Row label="Oxirgi yopilishda qolgan" value={s.opening} sign="" sub={s.lastClose ? dateTime(s.lastClose.createdAt) : undefined} />
        <Row
          label="Ichimliklar savdosi"
          value={s.drinkSales}
          sign="+"
          to="/varaq"
          sub={s.drinkSheetDates.length ? `Varaqlar: ${s.drinkSheetDates.map((d) => relativeDay(d)).join(', ')}` : 'Varaq kiritilmagan'}
        />
        <Row label="Sneklar savdosi" value={s.snackSales} sign="+" to="/vitrina" sub={`${s.snackSoldQty} ta sotilgan (sanoqlar boʻyicha)`} />
        <Row label="Kassadan xarajatlar" value={s.cashExpenses} sign="−" to="/xarajatlar" />
        {s.withdrawals > 0 && <Row label="Olingan pul" value={s.withdrawals} sign="−" />}
        {s.deposits > 0 && <Row label="Qoʻyilgan pul" value={s.deposits} sign="+" />}
      </div>
      <div className="mt-2 flex items-center justify-between rounded-xl bg-bean-900 px-4 py-3 text-white">
        <span className="text-sm">Kassada boʻlishi kerak</span>
        <span className="tabular text-xl font-bold">{som(s.expected)}</span>
      </div>
    </Card>
  );
}

function CloseForm({ s }: { s: CashStatus }) {
  const toast = useToast();
  const [counted, setCounted] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<{ expected: number; counted: number; difference: number } | null>(null);
  const diff = counted === null ? null : counted - s.expected;

  const close = useMutation({
    mutationFn: () => api.post<{ expected: number; counted: number; difference: number }>('/cash/close', { counted, note }),
    onSuccess: (r) => {
      setResult(r);
      setCounted(null);
      setNote('');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  return (
    <Section title="Kassani yopish">
      <Card className="space-y-3">
        <p className="text-sm text-stone-600">
          Kun oxirida: avval <Link to="/varaq" className="font-semibold underline">varaqni</Link> va{' '}
          <Link to="/vitrina" className="font-semibold underline">vitrina sanogʻini</Link> kiriting, keyin kassadagi pulni sanang.
        </p>
        <Field label="Kassadagi pul (sanalgan)">
          <MoneyInput value={counted} onChange={setCounted} />
        </Field>
        {diff !== null && (
          <div className={cx('flex justify-between rounded-xl px-4 py-3 font-semibold', diff === 0 ? 'bg-emerald-50 text-emerald-800' : diff > 0 ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-800')}>
            <span>Farq</span>
            <span className="tabular">{signedSom(diff)}</span>
          </div>
        )}
        <TextInput placeholder="Izoh (ixtiyoriy)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button size="lg" className="w-full" disabled={counted === null} loading={close.isPending} onClick={() => close.mutate()}>
          Kassani yopish
        </Button>
      </Card>

      <Modal open={!!result} onClose={() => setResult(null)} title="Kassa yopildi">
        {result && <AfterClose result={result} onDone={() => setResult(null)} />}
      </Modal>
    </Section>
  );
}

function AfterClose({ result, onDone }: { result: { expected: number; counted: number; difference: number }; onDone: () => void }) {
  const toast = useToast();
  const [leave, setLeave] = useState<number | null>(null);
  const take = leave !== null ? result.counted - leave : 0;
  const withdraw = useMutation({
    mutationFn: () => api.post('/cash/movements', { kind: 'withdrawal', amount: take, note: 'Kun yakunida olindi' }),
    onSuccess: () => {
      toast(`${som(take)} olindi`);
      onDone();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const d = result.difference;
  return (
    <div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-xs text-stone-500">Kutilgan</div>
          <div className="tabular font-semibold">{som(result.expected)}</div>
        </div>
        <div>
          <div className="text-xs text-stone-500">Sanalgan</div>
          <div className="tabular font-semibold">{som(result.counted)}</div>
        </div>
        <div>
          <div className="text-xs text-stone-500">Farq</div>
          <div className={cx('tabular font-bold', d === 0 ? 'text-emerald-700' : d > 0 ? 'text-amber-700' : 'text-red-700')}>{signedSom(d)}</div>
        </div>
      </div>
      {result.counted > 0 && (
        <div className="mt-5 rounded-2xl bg-bean-50 p-4">
          <h3 className="font-semibold text-bean-900">Pulni olib qoʻyasizmi?</h3>
          <p className="mb-2 text-sm text-stone-600">Ertaga uchun kassada qancha mayda pul qoldirasiz?</p>
          <MoneyInput value={leave} onChange={setLeave} placeholder="Qoldiriladigan summa" />
          {leave !== null && leave > result.counted && <p className="mt-1 text-xs text-red-700">Kassadagi puldan koʻp</p>}
          {leave !== null && take > 0 && <p className="mt-2 text-sm">Olinadi: <b>{som(take)}</b></p>}
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={onDone}>
              Hammasi kassada qoladi
            </Button>
            <Button className="flex-1" disabled={leave === null || take <= 0} loading={withdraw.isPending} onClick={() => withdraw.mutate()}>
              Olish
            </Button>
          </div>
        </div>
      )}
      {result.counted === 0 && (
        <Button className="mt-4 w-full" onClick={onDone}>
          Yaxshi
        </Button>
      )}
    </div>
  );
}

function OpenMovements({ list }: { list: CashMovement[] }) {
  const toast = useToast();
  const { confirm, element } = useConfirm();
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/cash/movements/${id}`),
    onSuccess: () => toast('Oʻchirildi'),
    onError: (e) => toast((e as Error).message, 'error'),
  });
  if (list.length === 0) return null;
  return (
    <Section title="Olingan / qoʻyilgan pul (yopilmagan)">
      <Card className="divide-y divide-bean-100 p-0">
        {list.map((m) => (
          <div key={m.id} className="flex items-center gap-3 p-3 text-sm">
            <div className="flex-1">
              <div className="font-medium">{m.kind === 'withdrawal' ? 'Olindi' : 'Qoʻyildi'} · {som(m.amount)}</div>
              <div className="text-stone-500">
                {dateTime(m.createdAt)}
                {m.note ? ` · ${m.note}` : ''}
              </div>
            </div>
            <button
              className="grid size-9 place-items-center rounded-lg text-stone-500 hover:bg-bean-100"
              aria-label="Oʻchirish"
              onClick={async () => {
                if (await confirm('Bu yozuvni oʻchirasizmi?')) remove.mutate(m.id);
              }}
            >
              <Icon name="trash" />
            </button>
          </div>
        ))}
      </Card>
      {element}
    </Section>
  );
}

function ClosesHistory({ closes }: { closes: CashClose[] }) {
  const toast = useToast();
  const { confirm, element } = useConfirm();
  const reopen = useMutation({
    mutationFn: () => api.post('/cash/reopen'),
    onSuccess: () => toast('Oxirgi yopilish bekor qilindi'),
    onError: (e) => toast((e as Error).message, 'error'),
  });
  if (closes.length === 0) return <Empty>Hali kassa yopilmagan</Empty>;
  return (
    <>
      <Card className="divide-y divide-bean-100 p-0">
        {closes.map((c, i) => (
          <div key={c.id} className="p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{dateTime(c.createdAt)}</span>
              {c.isOpening ? (
                <Badge tone="muted">Boshlangʻich</Badge>
              ) : (
                <Badge tone={c.difference === 0 ? 'good' : c.difference > 0 ? 'warn' : 'bad'}>Farq {signedSom(c.difference)}</Badge>
              )}
            </div>
            <div className="mt-0.5 text-stone-500">
              {c.isOpening ? `Kassada: ${som(c.counted)}` : `Kutilgan ${som(c.expected)} · sanalgan ${som(c.counted)}`}
              {c.note && !c.isOpening ? ` · ${c.note}` : ''}
            </div>
            {i === 0 && (
              <button
                className="mt-1 text-xs font-semibold text-bean-700 underline"
                onClick={async () => {
                  if (await confirm('Oxirgi yopilishni bekor qilasizmi? Shu davrdagi varaqlar, savdo va xarajatlar yana tahrirlanadigan boʻladi. Keyin kassani qaytadan yoping.')) reopen.mutate();
                }}
              >
                Qayta ochish
              </button>
            )}
          </div>
        ))}
      </Card>
      {element}
    </>
  );
}

function MovementModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<'withdrawal' | 'deposit'>('withdrawal');
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: () => api.post('/cash/movements', { kind, amount, note }),
    onSuccess: () => {
      toast('Saqlandi');
      setAmount(null);
      setNote('');
      onClose();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pul olish / qoʻyish"
      footer={
        <Button size="lg" className="w-full" disabled={!amount} loading={save.isPending} onClick={() => save.mutate()}>
          Saqlash
        </Button>
      }
    >
      <div className="space-y-3">
        <Tabs
          value={kind}
          onChange={setKind}
          options={[
            { value: 'withdrawal', label: 'Kassadan olish' },
            { value: 'deposit', label: 'Kassaga qoʻyish' },
          ]}
        />
        <p className="text-sm text-stone-600">
          {kind === 'withdrawal'
            ? 'Masalan, tushumni egasiga topshirish. Bu xarajat emas — faqat kassadagi pul kamayadi.'
            : 'Masalan, mayda pul uchun kassaga qoʻyilgan pul.'}
        </p>
        <Field label="Summa">
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="Izoh">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Kimga / nima uchun" />
        </Field>
      </div>
    </Modal>
  );
}
