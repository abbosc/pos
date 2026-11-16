import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, Icon, Page } from '../components/ui';
import { api } from '../lib/api';

const LINKS = [
  { to: '/hisobot', label: 'Hisobot', sub: 'Savdo, foyda, eng koʻp sotilganlar', icon: 'chart' },
  { to: '/xarajatlar', label: 'Xarajatlar', sub: 'Sut, kofe, stakan va boshqa xarajatlar', icon: 'wallet' },
  { to: '/xarid', label: 'Mahsulot xaridi', sub: 'Omborga yangi mahsulot', icon: 'cart' },
  { to: '/toldirish', label: 'Vitrinani toʻldirish', sub: 'Ombordan vitrinaga', icon: 'refill' },
  { to: '/mahsulotlar', label: 'Mahsulotlar', sub: 'Sneklar, narxlar, rasmlar, qoldiq', icon: 'box' },
  { to: '/ichimliklar', label: 'Ichimliklar menyusi', sub: 'Narx va bir stakan tannarxi', icon: 'cup' },
  { to: '/tarix', label: 'Ombor tarixi', sub: 'Barcha xarid, sotuv va tuzatishlar', icon: 'history' },
];

export function MorePage() {
  const qc = useQueryClient();
  return (
    <Page title="Yana">
      <Card className="divide-y divide-bean-100 p-0">
        {LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="flex items-center gap-3 p-3">
            <span className="grid size-10 place-items-center rounded-xl bg-bean-100 text-bean-800">
              <Icon name={l.icon} />
            </span>
            <span className="flex-1">
              <span className="block font-semibold text-bean-900">{l.label}</span>
              <span className="block text-xs text-stone-500">{l.sub}</span>
            </span>
            <Icon name="chevron" className="size-4 text-stone-400" />
          </Link>
        ))}
      </Card>
      <Card className="mt-4 p-0">
        <button
          className="flex w-full items-center gap-3 p-3 text-left text-red-700"
          onClick={async () => {
            await api.post('/auth/logout');
            qc.clear();
            qc.setQueryData(['me'], { loggedIn: false });
          }}
        >
          <span className="grid size-10 place-items-center rounded-xl bg-red-50">
            <Icon name="logout" />
          </span>
          <span className="font-semibold">Chiqish</span>
        </button>
      </Card>
      <p className="mt-6 text-center text-xs text-stone-400">Sodiq Coffee hisob tizimi</p>
    </Page>
  );
}
