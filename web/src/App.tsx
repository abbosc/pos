import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { api } from './lib/api';
import { CashPage } from './pages/Cash';
import { DashboardPage } from './pages/Dashboard';
import { DrinkMenuPage } from './pages/DrinkMenu';
import { ExpensesPage } from './pages/Expenses';
import { HistoryPage } from './pages/History';
import { LoginPage } from './pages/Login';
import { MorePage } from './pages/More';
import { ProductDetailPage } from './pages/ProductDetail';
import { ProductsPage } from './pages/Products';
import { PurchasePage } from './pages/Purchase';
import { RefillPage } from './pages/Refill';
import { ReportsPage } from './pages/Reports';
import { SheetPage } from './pages/Sheet';
import { StandCountPage } from './pages/StandCount';

export function App() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<{ loggedIn: boolean }>('/auth/me'), staleTime: Infinity });

  useEffect(() => {
    const onUnauthorized = () => qc.setQueryData(['me'], { loggedIn: false });
    window.addEventListener('pos:unauthorized', onUnauthorized);
    return () => window.removeEventListener('pos:unauthorized', onUnauthorized);
  }, [qc]);

  if (me.isPending) return <Spinner className="pt-[40dvh]" />;
  if (!me.data?.loggedIn) return <LoginPage />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="vitrina" element={<StandCountPage />} />
        <Route path="toldirish" element={<RefillPage />} />
        <Route path="xarid" element={<PurchasePage />} />
        <Route path="varaq" element={<SheetPage />} />
        <Route path="kassa" element={<CashPage />} />
        <Route path="xarajatlar" element={<ExpensesPage />} />
        <Route path="mahsulotlar" element={<ProductsPage />} />
        <Route path="mahsulotlar/:id" element={<ProductDetailPage />} />
        <Route path="ichimliklar" element={<DrinkMenuPage />} />
        <Route path="hisobot" element={<ReportsPage />} />
        <Route path="tarix" element={<HistoryPage />} />
        <Route path="yana" element={<MorePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
