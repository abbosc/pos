import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge, Card, ErrorBox, Icon, Page, Section, Spinner, Stat, Thumb } from '../components/ui';
import { api, type Dashboard } from '../lib/api';
import { dateTime, dayLabel, som } from '../lib/format';

const ACTIONS = [
  { to: '/vitrina', label: 'Vitrinani sanash', icon: 'stand' },
  { to: '/varaq', label: 'Ichimliklar varagʻi', icon: 'sheet' },
  { to: '/toldirish', label: 'Vitrinani toʻldirish', icon: 'refill' },
  { to: '/xarid', label: 'Mahsulot xaridi', icon: 'cart' },
  { to: '/xarajatlar?yangi=1', label: 'Xarajat qoʻshish', icon: 'wallet' },
  { to: '/kassa', label: 'Kassani yopish', icon: 'cash' },
];

export function DashboardPage() {
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/dashboard') });

  return (
    <Page title="Sodiq Coffee">
      {q.isPending ? (
        <Spinner />
      ) : q.error ? (
        <ErrorBox error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <Content d={q.data} />
      )}
    </Page>
  );
}

function Content({ d }: { d: Dashboard }) {
  const t = d.todayTotals;
  return (
    <>
      <p className="-mt-3 mb-4 text-sm text-stone-500">{dayLabel(d.today, true)}</p>

      <Stat
        tone="dark"
        to="/kassa"
        label="Kassada boʻlishi kerak"
        value={som(d.cash.expected)}
        sub={d.cash.hasOpening ? `Oxirgi yopilish: ${dateTime(d.cash.lastClose?.createdAt)}` : 'Boshlangʻich pulni kiriting →'}
      />

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stat label="Bugungi savdo" value={som(t.revenue)} sub={`Ichimlik ${som(t.drinkRevenue)}`} to="/hisobot" />
        <Stat label="Bugungi foyda" value={som(t.grossProfit)} tone={t.grossProfit < 0 ? 'bad' : 'default'} sub={`Sneklar ${som(t.snackRevenue)}`} to="/hisobot" />
      </div>

      {(!d.todaySheetExists || !d.lastStandCountAt) && (
        <div className="mt-3 space-y-2">
          {!d.todaySheetExists && (
            <Link to="/varaq" className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <Icon name="sheet" />
              <span className="flex-1">Bugungi ichimliklar varagʻi hali kiritilmagan</span>
              <Icon name="chevron" />
            </Link>
          )}
          {!d.lastStandCountAt && (
            <Link to="/mahsulotlar" className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <Icon name="box" />
              <span className="flex-1">Mahsulotlarni qoʻshing va vitrinani sanang</span>
              <Icon name="chevron" />
            </Link>
          )}
        </div>
      )}

      <Section title="Tezkor amallar">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ACTIONS.map((a) => (
            <Link key={a.to} to={a.to} className="flex items-center gap-3 rounded-2xl border border-bean-100 bg-white p-3 shadow-sm active:bg-bean-50">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-bean-100 text-bean-800">
                <Icon name={a.icon} />
              </span>
              <span className="text-sm leading-tight font-semibold text-bean-900">{a.label}</span>
            </Link>
          ))}
        </div>
        {d.lastStandCountAt && <p className="mt-2 px-1 text-xs text-stone-500">Oxirgi sanoq: {dateTime(d.lastStandCountAt)}</p>}
      </Section>

      {(d.lowStock.refill.length > 0 || d.lowStock.buy.length > 0) && (
        <Section title="Kam qolgan">
          <Card className="divide-y divide-bean-100 p-0">
            {d.lowStock.buy.map((p) => (
              <Link key={`b${p.id}`} to={`/mahsulotlar/${p.id}`} className="flex items-center gap-3 p-3">
                <Thumb src={p.imagePath} name={p.name} size="sm" />
                <span className="flex-1 text-sm font-medium">{p.name}</span>
                <Badge tone="bad">Sotib olish kerak · {p.standQty + p.warehouseQty} ta</Badge>
              </Link>
            ))}
            {d.lowStock.refill
              .filter((p) => !d.lowStock.buy.some((b) => b.id === p.id))
              .map((p) => (
                <Link key={`r${p.id}`} to="/toldirish" className="flex items-center gap-3 p-3">
                  <Thumb src={p.imagePath} name={p.name} size="sm" />
                  <span className="flex-1 text-sm font-medium">{p.name}</span>
                  <Badge tone="warn">Vitrinada {p.standQty} ta · omborda {p.warehouseQty}</Badge>
                </Link>
              ))}
          </Card>
        </Section>
      )}
    </>
  );
}
