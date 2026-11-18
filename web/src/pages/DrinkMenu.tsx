import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ImagePicker } from '../components/ImagePicker';
import { useToast } from '../components/toast';
import { Badge, Button, Card, ErrorBox, Field, Icon, Modal, MoneyInput, NumberInput, Page, Select, Spinner, TextInput, Thumb, Toggle, useConfirm } from '../components/ui';
import { api, type Container, type Drink } from '../lib/api';
import { som } from '../lib/format';

export function DrinkMenuPage() {
  const drinks = useQuery({ queryKey: ['drinks', 'all'], queryFn: () => api.get<Drink[]>('/drinks?all=1') });
  const [editing, setEditing] = useState<Drink | 'new' | null>(null);

  const groups = useMemo(() => {
    const m = new Map<string, Drink[]>();
    for (const d of drinks.data ?? []) {
      const g = d.groupName || 'Boshqa';
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(d);
    }
    return [...m.entries()];
  }, [drinks.data]);
  const missing = (drinks.data ?? []).filter((d) => d.active && d.costPerCup === null).length;

  return (
    <Page
      title="Ichimliklar menyusi"
      back
      actions={
        <Button size="sm" onClick={() => setEditing('new')}>
          <Icon name="plus" className="size-4" /> Yangi
        </Button>
      }
    >
      {missing > 0 && (
        <div className="mb-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <Icon name="warn" className="size-5 shrink-0" />
          <span>
            {missing} ta ichimlikning <b>bir stakan tannarxi</b> kiritilmagan. Har bir ichimlik foydasini hisoblash uchun kiriting.
          </span>
        </div>
      )}
      {drinks.isPending ? (
        <Spinner />
      ) : drinks.error ? (
        <ErrorBox error={drinks.error} />
      ) : (
        <div className="space-y-4">
          {groups.map(([group, list]) => (
            <div key={group}>
              <h2 className="mb-1 px-1 text-xs font-semibold tracking-wide text-bean-700 uppercase">{group}</h2>
              <Card className="divide-y divide-bean-100 p-0">
                {list.map((d) => (
                  <button key={d.id} className="flex w-full items-center gap-3 p-3 text-left" onClick={() => setEditing(d)}>
                    <Thumb src={d.imagePath} name={d.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm leading-snug font-semibold [overflow-wrap:anywhere]">{d.name}</span>
                        {!d.active && <Badge tone="muted">Faol emas</Badge>}
                      </div>
                      <div className="text-xs text-stone-500">
                        {d.costPerCup === null ? (
                          <span className="text-amber-700">Tannarx kiritilmagan</span>
                        ) : (
                          <>
                            Tannarx {som(d.costPerCup)} · foyda <b className="text-emerald-700">{som(d.price - d.costPerCup)}</b>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="tabular text-sm font-semibold">{som(d.price)}</span>
                  </button>
                ))}
              </Card>
            </div>
          ))}
        </div>
      )}
      {editing && <DrinkModal drink={editing === 'new' ? null : editing} groups={groups.map(([g]) => g)} onClose={() => setEditing(null)} />}
    </Page>
  );
}

function DrinkModal({ drink, groups, onClose }: { drink: Drink | null; groups: string[]; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { confirm, element } = useConfirm();
  const [name, setName] = useState(drink?.name ?? '');
  const [groupName, setGroupName] = useState(drink?.groupName ?? groups[0] ?? '');
  const [price, setPrice] = useState<number | null>(drink?.price ?? null);
  const [costPerCup, setCostPerCup] = useState<number | null>(drink?.costPerCup ?? null);
  const [sortOrder, setSortOrder] = useState<number | null>(drink?.sortOrder ?? null);
  const [active, setActive] = useState(drink?.active ?? true);
  const [containerId, setContainerId] = useState<number | null>(drink?.containerId ?? null);
  const [allowCup, setAllowCup] = useState(drink?.allowCup ?? false);
  const containers = useQuery({ queryKey: ['containers'], queryFn: () => api.get<Container[]>('/containers') });

  const save = useMutation({
    mutationFn: () => {
      const body = { name, groupName, price, costPerCup, containerId, allowCup, active, ...(sortOrder !== null ? { sortOrder } : {}) };
      return drink ? api.patch(`/drinks/${drink.id}`, body) : api.post('/drinks', body);
    },
    onSuccess: () => {
      toast('Saqlandi');
      onClose();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/drinks/${drink!.id}`),
    onSuccess: () => {
      toast('Oʻchirildi');
      onClose();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={drink ? drink.name : 'Yangi ichimlik'}
      footer={
        <div className="flex gap-2">
          {drink && (
            <Button
              variant="secondary"
              size="lg"
              aria-label="Oʻchirish"
              onClick={async () => {
                if (await confirm(`“${drink.name}” ni oʻchirasizmi? Varaqlarda ishlatilgan boʻlsa, oʻchirib boʻlmaydi — “faol emas” qiling.`)) remove.mutate();
              }}
            >
              <Icon name="trash" />
            </Button>
          )}
          <Button size="lg" className="flex-1" disabled={!name.trim() || price === null} loading={save.isPending} onClick={() => save.mutate()}>
            Saqlash
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {drink && (
          <ImagePicker
            src={drink.imagePath}
            name={name}
            onPick={async (f) => {
              await api.upload(`/drinks/${drink.id}/image`, f);
              await qc.invalidateQueries();
            }}
            onRemove={async () => {
              await api.del(`/drinks/${drink.id}/image`);
              await qc.invalidateQueries();
            }}
          />
        )}
        <Field label="Nomi">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus={!drink} />
        </Field>
        <Field label="Guruh" hint="Varaqda shu guruh boʻyicha ajratiladi">
          <TextInput value={groupName} onChange={(e) => setGroupName(e.target.value)} list="drink-groups" />
          <datalist id="drink-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Narxi">
            <MoneyInput value={price} onChange={setPrice} />
          </Field>
          <Field label="1 stakan tannarxi">
            <MoneyInput value={costPerCup} onChange={setCostPerCup} />
          </Field>
        </div>
        <p className="text-xs text-stone-500">
          Tannarx — bir stakan uchun ketadigan mahsulotlar: kofe, sut, sirop, stakan va qopqoq. Masalan, latte: kofe 3 000 + sut 4 500 + stakan 1 500 = 9 000.
          {price !== null && costPerCup !== null && (
            <>
              {' '}
              Foyda: <b>{som(price - costPerCup)}</b>
            </>
          )}
        </p>
        <Field label="Idish" hint="Bu ichimlik doim shu stakanda beriladi">
          <Select value={containerId ?? ''} onChange={(e) => setContainerId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Tanlanmagan</option>
            {(containers.data ?? [])
              .filter((c) => !c.isCup)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </Field>
        <Toggle checked={allowCup} onChange={setAllowCup} label="Chashkada ham beriladi" hint="Varaqda “Chashkada” ustuni chiqadi (kofe uchun)" />
        <Field label="Tartib raqami" hint="Kichik raqam roʻyxatda yuqorida turadi">
          <NumberInput value={sortOrder} onChange={setSortOrder} placeholder="avtomatik" />
        </Field>
        <Toggle checked={active} onChange={setActive} label="Faol" hint="Faol boʻlmagan ichimlik varaqda koʻrinmaydi" />
        {drink && drink.price !== price && (
          <p className="rounded-xl bg-bean-50 p-3 text-xs text-stone-600">Yangi narx bundan keyingi varaqlarga qoʻllanadi. Avval saqlangan varaqlar eski narxda qoladi.</p>
        )}
      </div>
      {element}
    </Modal>
  );
}
