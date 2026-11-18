import type { ReactNode } from 'react';
import { NumberInput, Thumb } from './ui';

/**
 * A product row with a quantity input. The name uses the full width next to the photo and wraps
 * by words; the numbers and the input sit on the line below. Stays readable on phones with
 * large text.
 */
export function QtyRow({
  image,
  name,
  info,
  extra,
  value,
  onChange,
  placeholder = '0',
  action,
}: {
  image: string | null;
  name: string;
  info: ReactNode;
  extra?: ReactNode;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex gap-3 p-3">
      <Thumb src={image} name={name} />
      <div className="min-w-0 flex-1">
        <div className="leading-snug font-semibold break-words text-stone-900">{name}</div>
        <div className="mt-1.5 flex items-end justify-between gap-3">
          <div className="min-w-0 text-xs leading-snug text-stone-500">
            {info}
            {extra}
            {action && <div className="mt-1">{action}</div>}
          </div>
          <NumberInput className="w-20 shrink-0" placeholder={placeholder} value={value} aria-label={`${name} soni`} onChange={onChange} />
        </div>
      </div>
    </div>
  );
}
