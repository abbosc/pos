export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api${url}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined && !isForm ? { 'content-type': 'application/json' } : undefined,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Internet aloqasi yoʻq. Qayta urinib koʻring.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/')) window.dispatchEvent(new Event('pos:unauthorized'));
    throw new ApiError(res.status, data?.error ?? `Xatolik (${res.status})`);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body ?? {}),
  del: <T>(url: string) => request<T>('DELETE', url),
  upload: <T>(url: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<T>('POST', url, fd);
  },
};

// ─── Types (mirror the server responses) ─────────────────────────────────────

export type Product = {
  id: number;
  name: string;
  sellPrice: number;
  avgCost: number;
  warehouseQty: number;
  standQty: number;
  lowStockLevel: number;
  imagePath: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
};

export type MovementKind = 'opening' | 'purchase' | 'refill' | 'sale' | 'writeoff' | 'correction';

export type Movement = {
  id: number;
  productId: number;
  productName: string;
  kind: MovementKind;
  warehouseDelta: number;
  standDelta: number;
  unitPrice: number;
  unitCost: number;
  purchaseId: number | null;
  standCountId: number | null;
  reason: WriteoffReason | null;
  note: string | null;
  createdAt: string;
};

export type WriteoffReason = 'gift' | 'staff' | 'spoiled' | 'other';

export const REASON_LABEL: Record<WriteoffReason, string> = {
  gift: 'Sovgʻa',
  staff: 'Oʻzimiz yedik',
  spoiled: 'Buzilgan / muddati oʻtgan',
  other: 'Boshqa',
};

export type Container = {
  id: number;
  name: string;
  isCup: boolean;
  stockQty: number;
  lowStockLevel: number;
  sortOrder: number;
  active: boolean;
};

export type ContainerMovement = {
  id: number;
  containerId: number;
  containerName: string;
  kind: 'purchase' | 'usage' | 'count' | 'writeoff';
  delta: number;
  sheetDate: string | null;
  hasExpense: boolean;
  note: string | null;
  createdAt: string;
};

export type Drink = {
  id: number;
  name: string;
  groupName: string;
  price: number;
  costPerCup: number | null;
  containerId: number | null;
  allowCup: boolean;
  featured: boolean;
  imagePath: string | null;
  sortOrder: number;
  active: boolean;
};

export type SheetLine = {
  drinkId: number;
  name: string;
  groupName: string;
  imagePath: string | null;
  price: number;
  costPerCup: number | null;
  containerId: number | null;
  allowCup: boolean;
  soldQty: number;
  giftQty: number;
  cupQty: number;
};

export type Sheet = {
  date: string;
  exists: boolean;
  note: string | null;
  locked: boolean;
  updatedAt: string | null;
  lines: SheetLine[];
  totals: { soldQty: number; giftQty: number; cupQty: number; revenue: number };
  cupContainerId: number | null;
  containerCounts: { containerId: number; countedUsed: number }[];
  containerUsage: { containerId: number; used: number }[];
};

export type SheetSummary = { date: string; locked: boolean; soldQty: number; giftQty: number; revenue: number };

export type ExpenseCategory = { id: number; name: string; sortOrder: number };

export type Expense = {
  id: number;
  date: string;
  categoryId: number;
  categoryName: string;
  amount: number;
  paidFromCash: boolean;
  note: string | null;
  purchaseId: number | null;
  locked: boolean;
  createdAt: string;
};

export type CashClose = {
  id: number;
  createdAt: string;
  expected: number;
  counted: number;
  difference: number;
  isOpening: boolean;
  note: string | null;
};

export type CashStatus = {
  hasOpening: boolean;
  lastClose: CashClose | null;
  opening: number;
  snackSales: number;
  snackSoldQty: number;
  drinkSales: number;
  drinkSheetDates: string[];
  cashExpenses: number;
  withdrawals: number;
  deposits: number;
  expected: number;
};

export type CashMovement = {
  id: number;
  kind: 'withdrawal' | 'deposit';
  amount: number;
  note: string | null;
  locked: boolean;
  createdAt: string;
};

export type Totals = {
  drinkRevenue: number;
  drinkCost: number;
  drinkSold: number;
  giftQty: number;
  giftCost: number;
  snackRevenue: number;
  snackCost: number;
  snackSold: number;
  writeoffCost: number;
  expenses: number;
  goodsPurchases: number;
  revenue: number;
  grossProfit: number;
  cashFlow: number;
  drinksMissingCost: number;
};

export type LowStockItem = {
  id: number;
  name: string;
  imagePath: string | null;
  standQty: number;
  warehouseQty: number;
  lowStockLevel: number;
};

export type Dashboard = {
  today: string;
  cash: CashStatus;
  todayTotals: Totals;
  lowStock: { refill: LowStockItem[]; buy: LowStockItem[] };
  lastStandCountAt: string | null;
  todaySheetExists: boolean;
};

export type Summary = {
  from: string;
  to: string;
  totals: Totals;
  byDay: (Omit<Totals, 'revenue' | 'grossProfit' | 'cashFlow' | 'drinksMissingCost'> & { date: string })[];
  byDrink: {
    id: number;
    name: string;
    groupName: string;
    sold: number;
    gifts: number;
    revenue: number;
    cost: number;
    profit: number;
    missingCost: boolean;
  }[];
  byProduct: {
    id: number;
    name: string;
    sold: number;
    revenue: number;
    cost: number;
    profit: number;
    writeoffQty: number;
    writeoffCost: number;
  }[];
  byCategory: { id: number; name: string; total: number; count: number }[];
  writeoffsByReason: { reason: WriteoffReason; qty: number; cost: number }[];
  containerUsage: { id: number; name: string; used: number }[];
  purchaseCategory: string;
};

export type StandCountResult = {
  countId: number;
  soldQty: number;
  revenue: number;
  lines: {
    productId: number;
    name: string;
    expected: number;
    counted: number;
    sold: number;
    surplus: number;
    surplusSource: 'warehouse' | 'correction' | null;
    revenue: number;
  }[];
};

export type StandCountSummary = { id: number; note: string | null; createdAt: string; soldQty: number; revenue: number; locked: boolean };

export type Purchase = {
  id: number;
  date: string;
  total: number;
  paidFromCash: boolean;
  note: string | null;
  createdAt: string;
  locked: boolean;
  lines: { productId: number; productName: string; qty: number; unitCost: number }[];
};
