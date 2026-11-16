import { Link } from 'react-router-dom';
import type { Movement, MovementKind } from '../lib/api';
import { dateTime, som } from '../lib/format';
import { Badge } from './ui';

export const KIND_LABEL: Record<MovementKind, string> = {
  opening: 'Boshlangʻich',
  purchase: 'Xarid',
  refill: 'Toʻldirish',
  sale: 'Sotildi',
  writeoff: 'Hisobdan chiqarildi',
  correction: 'Tuzatish',
};

const KIND_TONE: Record<MovementKind, 'default' | 'good' | 'warn' | 'bad' | 'muted'> = {
  opening: 'muted',
  purchase: 'default',
  refill: 'default',
  sale: 'good',
  writeoff: 'bad',
  correction: 'warn',
};

function delta(v: number) {
  return v > 0 ? `+${v}` : String(v);
}

export function MovementRow({ m, showProduct = true }: { m: Movement; showProduct?: boolean }) {
  const parts: string[] = [];
  if (m.warehouseDelta) parts.push(`ombor ${delta(m.warehouseDelta)}`);
  if (m.standDelta) parts.push(`vitrina ${delta(m.standDelta)}`);
  const amount =
    m.kind === 'sale'
      ? som(-m.standDelta * m.unitPrice)
      : m.kind === 'purchase'
        ? som(m.warehouseDelta * m.unitCost)
        : m.kind === 'writeoff'
          ? `−${som(-(m.warehouseDelta + m.standDelta) * m.unitCost)}`
          : null;
  return (
    <div className="flex items-start gap-3 p-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={KIND_TONE[m.kind]}>{KIND_LABEL[m.kind]}</Badge>
          {showProduct && (
            <Link to={`/mahsulotlar/${m.productId}`} className="font-medium">
              {m.productName}
            </Link>
          )}
        </div>
        <div className="mt-0.5 text-xs text-stone-500">
          {dateTime(m.createdAt)} · {parts.join(', ')}
          {m.note ? ` · ${m.note}` : ''}
        </div>
      </div>
      {amount && <span className="tabular shrink-0 font-semibold">{amount}</span>}
    </div>
  );
}
