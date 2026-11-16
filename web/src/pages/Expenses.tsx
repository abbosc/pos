import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../components/toast';
import { Badge, Button, Card, Empty, ErrorBox, Field, Icon, Modal, MoneyInput, Page, Select, Spinner, TextInput, Toggle, cx, useConfirm } from '../components/ui';
import { api, type Expense, type ExpenseCategory } from '../lib/api';
import { relativeDay, som, todayIso } from '../lib/format';

const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];

function monthRange(ym: string) {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
}

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function ExpensesPage() {
  const [params, setParams] = useSearchParams();
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const [catsOpen, setCatsOpen] = useState(false);
  const { from, to } = monthRange(month);

  useEffect(() => {
    if (params.get('yangi')) {
      setEditing('new');
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const categories = useQuery({ queryKey: ['expense-categories'], queryFn: () => api.get<ExpenseCategory[]>('/expense-categories') });
  const expenses = useQuery({
    queryKey: ['expenses', from, to, categoryId],
    queryFn: () => api.get<{ rows: Expense[]; total: number }>(`/expenses?from=${from}&to=${to}${categoryId ? `&categoryId=${categoryId}` : ''}`),
  });

  const byDate = useMemo(() => {
    const m = new Map<string, Expense[]>();
    for (const e of expenses.data?.rows ?? []) {
      if (!m.has(e.date)) m.set(e.date, []);
      m.get(e.date)!.push(e);
    }
    return [...m.entries()];
  }, [expenses.data]);

  const [y, mm] = month.split('-').map(Number) as [number, number];

  return (
    <Page
      title="Xarajatlar"
      back="/yana"
      actions={
        <Button size="sm" onClick={() => setEditing('new')}>
          <Icon name="plus" className="size-4" /> Qoʻshish
        </Button>
      }
    >
      <div className="mb-3 flex items-center gap-2">
        <button className="grid size-11 place-items-center rounded-xl border border-bean-200 bg-white" aria-label="Oldingi oy" onClick={() => setMonth(shiftMonth(month, -1))}>
          <Icon name="left" />
        </button>
        <div className="flex h-11 flex-1 items-center justify-center rounded-xl border border-bean-200 bg-white font-semibold">
          {MONTHS[mm - 1]} {y}
        </div>
        <button
          className="grid size-11 place-items-center rounded-xl border border-bean-200 bg-white disabled:opacity-40"
          aria-label="Keyingi oy"
          disabled={month >= todayIso().slice(0, 7)}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          <Icon name="right" />
        </button>
      </div>

      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip active={categoryId === null} onClick={() => setCategoryId(null)}>
          Hammasi
        </Chip>
        {categories.data?.map((c) => (
          <Chip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
            {c.name}
          </Chip>
        ))}
        <Chip active={false} onClick={() => setCatsOpen(true)}>
          <Icon name="edit" className="size-4" />
        </Chip>
      </div>

      <Card className="mb-4 flex items-center justify-between bg-bean-900 text-white">
        <span className="text-sm text-bean-200">Jami</span>
        <span className="tabular text-xl font-bold">{som(expenses.data?.total)}</span>
      </Card>

      {expenses.isPending ? (
        <Spinner />
      ) : expenses.error ? (
        <ErrorBox error={expenses.error} />
      ) : byDate.length === 0 ? (
        <Empty>Bu oyda xarajat yoʻq</Empty>
      ) : (
        <div className="space-y-4">
          {byDate.map(([date, rows]) => (
            <div key={date}>
              <div className="mb-1 flex justify-between px-1 text-xs font-semibold text-stone-500">
                <span>{relativeDay(date)}</span>
                <span className="tabular">{som(rows.reduce((s, r) => s + r.amount, 0))}</span>
              </div>
              <Card className="divide-y divide-bean-100 p-0">
                {rows.map((e) => (
                  <button key={e.id} className="flex w-full items-start gap-3 p-3 text-left" onClick={() => setEditing(e)}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{e.categoryName}</div>
                      {e.note && <div className="truncate text-xs text-stone-500">{e.note}</div>}
                      <div className="mt-1 flex gap-1">
                        {!e.paidFromCash && <Badge tone="muted">Kassadan emas</Badge>}
                        {e.locked && <Badge tone="muted">Yopilgan</Badge>}
                      </div>
                    </div>
                    <span className="tabular text-sm font-semibold">{som(e.amount)}</span>
                  </button>
                ))}
              </Card>
            </div>
          ))}
        </div>
      )}

      {editing && <ExpenseModal expense={editing === 'new' ? null : editing} categories={categories.data ?? []} onClose={() => setEditing(null)} />}
      <CategoriesModal open={catsOpen} onClose={() => setCatsOpen(false)} categories={categories.data ?? []} />
    </Page>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx('flex h-9 shrink-0 items-center rounded-full border px-3 text-sm font-medium whitespace-nowrap', active ? 'border-bean-900 bg-bean-900 text-white' : 'border-bean-200 bg-white text-bean-800')}
    >
      {children}
    </button>
  );
}

function ExpenseModal({ expense, categories, onClose }: { expense: Expense | null; categories: ExpenseCategory[]; onClose: () => void }) {
  const toast = useToast();
  const { confirm, element } = useConfirm();
  const readOnly = Boolean(expense?.locked || expense?.purchaseId);
  const selectable = categories.filter((c) => c.name !== 'Mahsulot xaridi' || expense?.categoryId === c.id);
  const [categoryId, setCategoryId] = useState<number | null>(expense?.categoryId ?? null);
  const [amount, setAmount] = useState<number | null>(expense?.amount ?? null);
  const [date, setDate] = useState(expense?.date ?? todayIso());
  const [paidFromCash, setPaidFromCash] = useState(expense?.paidFromCash ?? true);
  const [note, setNote] = useState(expense?.note ?? '');

  const save = useMutation({
    mutationFn: () => {
      const body = { categoryId, amount, date, paidFromCash, note };
      return expense ? api.patch(`/expenses/${expense.id}`, body) : api.post('/expenses', body);
    },
    onSuccess: () => {
      toast('Xarajat saqlandi');
      onClose();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/expenses/${expense!.id}`),
    onSuccess: () => {
      toast('Xarajat oʻchirildi');
      onClose();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={expense ? 'Xarajat' : 'Yangi xarajat'}
      footer={
        readOnly ? undefined : (
          <div className="flex gap-2">
            {expense && (
              <Button
                variant="secondary"
                size="lg"
                aria-label="Oʻchirish"
                loading={remove.isPending}
                onClick={async () => {
                  if (await confirm('Bu xarajatni oʻchirasizmi?')) remove.mutate();
                }}
              >
                <Icon name="trash" />
              </Button>
            )}
            <Button size="lg" className="flex-1" disabled={!categoryId || !amount} loading={save.isPending} onClick={() => save.mutate()}>
              Saqlash
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-3">
        {expense?.purchaseId && <p className="rounded-xl bg-bean-50 p-3 text-sm text-stone-700">Bu xarajat mahsulot xarididan yaratilgan. Uni “Mahsulot xaridi” sahifasida oʻchirishingiz mumkin.</p>}
        {expense?.locked && !expense.purchaseId && <p className="rounded-xl bg-stone-100 p-3 text-sm text-stone-700">Kassa yopilgan — bu xarajatni oʻzgartirib boʻlmaydi.</p>}
        <Field label="Summa">
          <MoneyInput value={amount} onChange={setAmount} disabled={readOnly} autoFocus={!expense} />
        </Field>
        <Field label="Turkum">
          <Select value={categoryId ?? ''} disabled={readOnly} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Tanlang…</option>
            {selectable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sana">
          <TextInput type="date" value={date} max={todayIso()} disabled={readOnly} onChange={(e) => setDate(e.target.value || todayIso())} />
        </Field>
        <Field label="Izoh">
          <TextInput value={note} disabled={readOnly} onChange={(e) => setNote(e.target.value)} placeholder="Nima sotib olindi…" />
        </Field>
        <Toggle checked={paidFromCash} onChange={(v) => !readOnly && setPaidFromCash(v)} label="Kassadagi puldan toʻlandi" hint="Oʻchirsangiz, kassadagi kutilgan pul kamaymaydi" />
      </div>
      {element}
    </Modal>
  );
}

function CategoriesModal({ open, onClose, categories }: { open: boolean; onClose: () => void; categories: ExpenseCategory[] }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const { confirm, element } = useConfirm();
  const add = useMutation({
    mutationFn: () => api.post('/expense-categories', { name, sortOrder: (categories.at(-1)?.sortOrder ?? 0) + 10 }),
    onSuccess: () => setName(''),
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => api.patch(`/expense-categories/${id}`, { name }),
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/expense-categories/${id}`),
    onError: (e) => toast((e as Error).message, 'error'),
  });
  return (
    <Modal open={open} onClose={onClose} title="Xarajat turkumlari">
      <div className="space-y-2">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            <TextInput
              defaultValue={c.name}
              disabled={c.name === 'Mahsulot xaridi'}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== c.name) rename.mutate({ id: c.id, name: v });
              }}
            />
            {c.name !== 'Mahsulot xaridi' && (
              <button
                className="grid size-11 shrink-0 place-items-center rounded-xl text-stone-500 hover:bg-bean-100"
                aria-label={`${c.name} turkumini oʻchirish`}
                onClick={async () => {
                  if (await confirm(`“${c.name}” turkumini oʻchirasizmi?`)) remove.mutate(c.id);
                }}
              >
                <Icon name="trash" />
              </button>
            )}
          </div>
        ))}
        <div className="flex gap-2 pt-2">
          <TextInput placeholder="Yangi turkum" value={name} onChange={(e) => setName(e.target.value)} />
          <Button disabled={!name.trim()} loading={add.isPending} onClick={() => add.mutate()}>
            Qoʻshish
          </Button>
        </div>
      </div>
      {element}
    </Modal>
  );
}
