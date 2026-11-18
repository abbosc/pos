import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useToast } from '../components/toast';
import { Badge, Button, Card, Empty, ErrorBox, Field, Icon, Modal, MoneyInput, NumberInput, Page, Section, Spinner, TextInput, Toggle, cx, useConfirm } from '../components/ui';
import { api, type Container, type ContainerMovement, type Drink } from '../lib/api';
import { dateTime, relativeDay, som } from '../lib/format';

/** "Kraft butilka" → "Kraft", so the choices fit on one line on phones. */
const shortName = (name: string) => name.split(' ')[0] ?? name;

type Action = { kind: 'receive' | 'count' | 'writeoff'; container: Container };

const KIND_LABEL: Record<ContainerMovement['kind'], string> = {
  purchase: 'Kirim',
  usage: 'Varaq',
  count: 'Sanoq',
  writeoff: 'Chiqim',
};

/** Bottles and cups: stock, receiving, counting, and which drink uses which bottle. */
export function ContainersPage() {
  const containers = useQuery({ queryKey: ['containers'], queryFn: () => api.get<Container[]>('/containers') });
  const moves = useQuery({ queryKey: ['container-movements'], queryFn: () => api.get<ContainerMovement[]>('/container-movements?limit=60') });
  const [action, setAction] = useState<Action | null>(null);

  return (
    <Page title="Idishlar" back="/yana">
      <p className="-mt-2 mb-3 text-sm text-stone-600">
        Butilka va chashkalar. Ichimliklar varagʻi saqlanganda ishlatilganlari ombordan avtomatik ayiriladi.
      </p>
      {containers.isPending ? (
        <Spinner />
      ) : containers.error ? (
        <ErrorBox error={containers.error} />
      ) : (
        <div className="space-y-3">
          {containers.data.map((c) => {
            const low = c.lowStockLevel > 0 && c.stockQty <= c.lowStockLevel;
            return (
              <Card key={c.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-bean-900">{c.name}</div>
                    <div className="text-xs text-stone-500">{c.isCup ? 'Kofe chashkada berilganda' : 'Butilka'}</div>
                  </div>
                  <div className="text-right">
                    <div className={cx('tabular text-2xl font-bold', c.stockQty < 0 ? 'text-red-700' : low ? 'text-amber-700' : 'text-bean-900')}>{c.stockQty}</div>
                    <div className="text-xs text-stone-500">omborda</div>
                  </div>
                </div>
                {c.stockQty < 0 && <p className="mt-2 text-xs text-red-700">Manfiy: omborga kirim yozilmagan. “Sanash” orqali haqiqiy sonni kiriting.</p>}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setAction({ kind: 'receive', container: c })}>
                    Kirim
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setAction({ kind: 'count', container: c })}>
                    Sanash
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setAction({ kind: 'writeoff', container: c })}>
                    Chiqim
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <DrinkAssignments containers={containers.data ?? []} />

      <Section title="Tarix">
        <History moves={moves.data ?? []} />
      </Section>

      {action?.kind === 'receive' && <ReceiveModal c={action.container} onClose={() => setAction(null)} />}
      {action?.kind === 'count' && <CountModal c={action.container} onClose={() => setAction(null)} />}
      {action?.kind === 'writeoff' && <WriteOffModal c={action.container} onClose={() => setAction(null)} />}
    </Page>
  );
}

function DrinkAssignments({ containers }: { containers: Container[] }) {
  const toast = useToast();
  const drinks = useQuery({ queryKey: ['drinks', 'all'], queryFn: () => api.get<Drink[]>('/drinks?all=1') });
  const bottles = containers.filter((c) => !c.isCup);
  const cup = containers.find((c) => c.isCup);
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Drink> }) => api.patch(`/drinks/${id}`, body),
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const groups = useMemo(() => {
    const m = new Map<string, Drink[]>();
    for (const d of drinks.data ?? []) {
      if (!d.active) continue;
      const g = d.groupName || 'Boshqa';
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(d);
    }
    return [...m.entries()];
  }, [drinks.data]);
  const missing = (drinks.data ?? []).filter((d) => d.active && !d.containerId).length;

  return (
    <Section title="Ichimliklar idishi">
      <p className="mb-2 px-1 text-xs text-stone-500">
        Har bir ichimlik qaysi butilkada berilishini tanlang.{cup && <> “+ {shortName(cup.name)}” belgilansa, varaqda “Chashkada” ustuni chiqadi (kofe chashkada ham berilsa).</>}
      </p>
      {missing > 0 && <p className="mb-2 px-1 text-xs font-semibold text-amber-700">{missing} ta ichimlikka idish tanlanmagan</p>}
      {drinks.isPending ? (
        <Spinner />
      ) : (
        <div className="space-y-3">
          {groups.map(([group, list]) => (
            <Card key={group} className="p-0">
              <div className="border-b border-bean-100 px-3 py-2 text-xs font-semibold tracking-wide text-bean-700 uppercase">{group}</div>
              <div className="divide-y divide-bean-50">
                {list.map((d) => (
                  <div key={d.id} className="px-3 py-2.5">
                    <div className="leading-snug font-semibold break-words">{d.name}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {bottles.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => update.mutate({ id: d.id, body: { containerId: d.containerId === b.id ? null : b.id } })}
                          className={cx(
                            'h-9 rounded-full border px-2.5 text-sm font-medium',
                            d.containerId === b.id ? 'border-bean-900 bg-bean-900 text-white' : 'border-bean-200 bg-white text-bean-800',
                          )}
                        >
                          {shortName(b.name)}
                        </button>
                      ))}
                      {cup && (
                        <button
                          type="button"
                          onClick={() => update.mutate({ id: d.id, body: { allowCup: !d.allowCup } })}
                          className={cx(
                            'flex h-9 items-center gap-1 rounded-full border px-2.5 text-sm font-medium',
                            d.allowCup ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-dashed border-bean-300 bg-white text-stone-500',
                          )}
                          aria-pressed={d.allowCup}
                        >
                          {d.allowCup && <Icon name="check" className="size-4" />}
                          + {shortName(cup.name)}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Section>
  );
}

function History({ moves }: { moves: ContainerMovement[] }) {
  const toast = useToast();
  const { confirm, element } = useConfirm();
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/container-movements/${id}`),
    onSuccess: () => toast('Bekor qilindi'),
    onError: (e) => toast((e as Error).message, 'error'),
  });
  if (moves.length === 0) return <Empty>Hali yozuv yoʻq</Empty>;
  return (
    <>
      <Card className="divide-y divide-bean-100 p-0">
        {moves.map((m) => (
          <div key={m.id} className="flex items-start gap-3 p-3 text-sm">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={m.kind === 'usage' ? 'default' : m.kind === 'purchase' ? 'good' : m.kind === 'count' ? 'warn' : 'bad'}>{KIND_LABEL[m.kind]}</Badge>
                <span className="font-medium">{m.containerName}</span>
              </div>
              <div className="mt-0.5 text-xs text-stone-500">
                {m.kind === 'usage' && m.sheetDate ? `${relativeDay(m.sheetDate)} varagʻi` : dateTime(m.createdAt)}
                {m.note && m.kind !== 'usage' ? ` · ${m.note}` : ''}
                {m.hasExpense ? ' · xarajat yozilgan' : ''}
              </div>
            </div>
            <span className={cx('tabular font-semibold', m.delta > 0 ? 'text-emerald-700' : m.delta < 0 ? 'text-red-700' : 'text-stone-500')}>
              {m.delta > 0 ? `+${m.delta}` : m.delta}
            </span>
            {m.kind !== 'usage' && (
              <button
                className="grid size-8 place-items-center rounded-lg text-stone-400 hover:bg-bean-100"
                aria-label="Bekor qilish"
                onClick={async () => {
                  if (await confirm('Bu yozuvni bekor qilasizmi? Ombordagi son qaytariladi.')) remove.mutate(m.id);
                }}
              >
                <Icon name="trash" className="size-4" />
              </button>
            )}
          </div>
        ))}
      </Card>
      {element}
    </>
  );
}

function ReceiveModal({ c, onClose }: { c: Container; onClose: () => void }) {
  const toast = useToast();
  const [qty, setQty] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [paidFromCash, setPaidFromCash] = useState(true);
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: () => api.post('/containers/receive', { containerId: c.id, qty, total, paidFromCash, note }),
    onSuccess: () => {
      toast(`${c.name}: +${qty}`);
      onClose();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`${c.name} — kirim`}
      footer={
        <Button size="lg" className="w-full" disabled={!qty} loading={save.isPending} onClick={() => save.mutate()}>
          Saqlash
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="Soni">
          <NumberInput value={qty} onChange={setQty} suffix="ta" autoFocus />
        </Field>
        <Field label="Jami narxi (ixtiyoriy)" hint="Kiritsangiz, xarajat sifatida ham yoziladi">
          <MoneyInput value={total} onChange={setTotal} />
        </Field>
        {total ? <Toggle checked={paidFromCash} onChange={setPaidFromCash} label="Kassadagi puldan toʻlandi" /> : null}
        <Field label="Izoh">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {total && qty ? <p className="text-xs text-stone-500">Bittasi: {som(Math.round(total / qty))}</p> : null}
      </div>
    </Modal>
  );
}

function CountModal({ c, onClose }: { c: Container; onClose: () => void }) {
  const toast = useToast();
  const [counted, setCounted] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const diff = counted === null ? null : counted - c.stockQty;
  const save = useMutation({
    mutationFn: () => api.post<{ difference: number }>('/containers/count', { containerId: c.id, counted, note }),
    onSuccess: (r) => {
      toast(r.difference === 0 ? 'Mos keldi ✓' : `Farq: ${r.difference > 0 ? '+' : ''}${r.difference}`, r.difference === 0 ? 'ok' : 'error');
      onClose();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`${c.name} — sanash`}
      footer={
        <Button size="lg" className="w-full" disabled={counted === null} loading={save.isPending} onClick={() => save.mutate()}>
          Saqlash
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-stone-600">Omborda hozir nechta borligini sanab kiriting.</p>
        <div className="flex justify-between rounded-xl bg-bean-50 px-4 py-3 text-sm">
          <span>Tizim boʻyicha</span>
          <b className="tabular">{c.stockQty} ta</b>
        </div>
        <Field label="Sanalgan">
          <NumberInput value={counted} onChange={setCounted} suffix="ta" autoFocus />
        </Field>
        {diff !== null && (
          <div className={cx('flex justify-between rounded-xl px-4 py-3 font-semibold', diff === 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800')}>
            <span>Farq</span>
            <span className="tabular">{diff === 0 ? '0 — mos keldi' : diff > 0 ? `+${diff}` : diff}</span>
          </div>
        )}
        <Field label="Izoh">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function WriteOffModal({ c, onClose }: { c: Container; onClose: () => void }) {
  const toast = useToast();
  const [qty, setQty] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: () => api.post('/containers/writeoff', { containerId: c.id, qty, note }),
    onSuccess: () => {
      toast(`${c.name}: −${qty}`);
      onClose();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`${c.name} — chiqim`}
      footer={
        <Button size="lg" className="w-full" disabled={!qty || !note.trim()} loading={save.isPending} onClick={() => save.mutate()}>
          Saqlash
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-stone-600">Ichimliksiz ketgan idishlar: singan, buzilgan, boshqa ishga olingan.</p>
        <Field label="Soni">
          <NumberInput value={qty} onChange={setQty} suffix="ta" autoFocus />
        </Field>
        <Field label="Sababi">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Singan, yirtilgan…" />
        </Field>
      </div>
    </Modal>
  );
}
