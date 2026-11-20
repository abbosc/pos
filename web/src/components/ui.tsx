import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { num } from '../lib/format';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

// ─── Layout pieces ───────────────────────────────────────────────────────────

export function Page({ title, back, actions, children }: { title: string; back?: string | true; actions?: ReactNode; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-28">
      <header className="mb-4 flex min-h-11 items-center gap-2">
        {back && (
          <button
            type="button"
            onClick={() => (back === true ? navigate(-1) : navigate(back))}
            className="-ml-2 grid size-10 place-items-center rounded-full text-bean-800 hover:bg-bean-100"
            aria-label="Orqaga"
          >
            <Icon name="back" />
          </button>
        )}
        <h1 className="flex-1 text-xl font-bold tracking-tight text-bean-900">{title}</h1>
        {actions}
      </header>
      {children}
    </div>
  );
}

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-2xl border border-bean-100 bg-white p-4 shadow-sm', className)} {...rest}>
      {children}
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold tracking-wide text-bean-700 uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-bean-200 p-6 text-center text-sm text-stone-500">{children}</div>;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cx('flex justify-center py-10', className)}>
      <div className="size-7 animate-spin rounded-full border-3 border-bean-200 border-t-bean-700" />
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      {(error as Error)?.message ?? 'Xatolik'}
      {onRetry && (
        <button className="ml-2 font-semibold underline" onClick={onRetry}>
          Qayta urinish
        </button>
      )}
    </div>
  );
}

export function Stat({ label, value, sub, tone = 'default', to }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'default' | 'good' | 'bad' | 'dark'; to?: string }) {
  const body = (
    <div
      className={cx(
        'h-full rounded-2xl border p-4',
        tone === 'dark' ? 'border-bean-900 bg-bean-900 text-white' : 'border-bean-100 bg-white shadow-sm',
      )}
    >
      <div className={cx('text-xs font-medium', tone === 'dark' ? 'text-bean-200' : 'text-stone-500')}>{label}</div>
      <div
        className={cx(
          'tabular mt-1 text-xl font-bold',
          tone === 'good' && 'text-emerald-700',
          tone === 'bad' && 'text-red-700',
          tone === 'default' && 'text-bean-900',
        )}
      >
        {value}
      </div>
      {sub && <div className={cx('mt-0.5 text-xs', tone === 'dark' ? 'text-bean-200' : 'text-stone-500')}>{sub}</div>}
    </div>
  );
  return to ? (
    <Link to={to} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'warn' | 'bad' | 'good' | 'muted' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tone === 'default' && 'bg-bean-100 text-bean-800',
        tone === 'warn' && 'bg-amber-100 text-amber-800',
        tone === 'bad' && 'bg-red-100 text-red-800',
        tone === 'good' && 'bg-emerald-100 text-emerald-800',
        tone === 'muted' && 'bg-stone-100 text-stone-600',
      )}
    >
      {children}
    </span>
  );
}

// ─── Buttons & inputs ────────────────────────────────────────────────────────

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg' | 'sm';
  loading?: boolean;
};

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100',
        size === 'lg' && 'h-13 px-5 text-base',
        size === 'md' && 'h-11 px-4 text-sm',
        size === 'sm' && 'h-9 px-3 text-sm',
        variant === 'primary' && 'bg-bean-900 text-white hover:bg-bean-800',
        variant === 'secondary' && 'border border-bean-200 bg-white text-bean-900 hover:bg-bean-50',
        variant === 'ghost' && 'text-bean-800 hover:bg-bean-100',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
        className,
      )}
      {...rest}
    >
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

const inputCls =
  'h-11 w-full rounded-xl border border-bean-200 bg-white px-3 text-base text-stone-900 outline-none placeholder:text-stone-400 focus:border-bean-500 focus:ring-2 focus:ring-bean-200 disabled:bg-stone-100';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" {...props} className={cx(inputCls, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, 'appearance-auto', props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={2} {...props} className={cx(inputCls, 'h-auto py-2', props.className)} />;
}

/** Whole-number input that shows thousands separators: "125 000". value null = empty. */
export function NumberInput({
  value,
  onChange,
  suffix,
  className,
  ...rest
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  suffix?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <div className={cx('relative', className)}>
      <input
        {...rest}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value === null ? '' : num(value)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
          onChange(digits === '' ? null : Number(digits));
        }}
        onFocus={(e) => {
          e.target.select();
          rest.onFocus?.(e);
        }}
        className={cx(inputCls, 'tabular', suffix && 'pr-14')}
      />
      {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-stone-400">{suffix}</span>}
    </div>
  );
}

export function MoneyInput(props: Omit<Parameters<typeof NumberInput>[0], 'suffix'>) {
  return <NumberInput suffix="soʻm" placeholder="0" {...props} />;
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 py-1">
      <span className="flex-1">
        <span className="block text-sm font-medium text-stone-800">{label}</span>
        {hint && <span className="block text-xs text-stone-500">{hint}</span>}
      </span>
      <input id={id} type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative mt-0.5 h-7 w-12 shrink-0 rounded-full bg-stone-300 transition peer-checked:bg-bean-700 peer-focus-visible:ring-2 peer-focus-visible:ring-bean-300 after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
    </label>
  );
}

/** Segmented control. */
export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex rounded-xl bg-bean-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 rounded-lg px-2 py-2 text-sm font-medium transition',
            value === o.value ? 'bg-white text-bean-900 shadow-sm' : 'text-bean-700',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Modal (bottom sheet on phones) ──────────────────────────────────────────

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div ref={ref} className="relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-xl sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-center gap-2 border-b border-bean-100 px-4 py-3">
          <h2 className="flex-1 text-lg font-bold text-bean-900">{title}</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-bean-100" aria-label="Yopish">
            <Icon name="close" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="pb-safe border-t border-bean-100 px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function useConfirm() {
  const [state, setState] = useState<{ text: string; resolve: (v: boolean) => void; danger?: boolean } | null>(null);
  const confirm = (text: string, danger = true) => new Promise<boolean>((resolve) => setState({ text, resolve, danger }));
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const element = (
    <Modal
      open={!!state}
      onClose={() => close(false)}
      title="Tasdiqlang"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => close(false)}>
            Bekor qilish
          </Button>
          <Button variant={state?.danger ? 'danger' : 'primary'} className="flex-1" onClick={() => close(true)}>
            Ha
          </Button>
        </div>
      }
    >
      <p className="text-stone-700">{state?.text}</p>
    </Modal>
  );
  return { confirm, element };
}

// ─── Images ──────────────────────────────────────────────────────────────────

export function Thumb({ src, name, size = 'md' }: { src: string | null; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'sm' ? 'size-9 text-sm' : size === 'lg' ? 'size-24 text-3xl' : 'size-12 text-lg';
  if (src) return <img src={src} alt="" loading="lazy" className={cx(cls, 'shrink-0 rounded-xl bg-bean-100 object-cover')} />;
  return (
    <div className={cx(cls, 'grid shrink-0 place-items-center rounded-xl bg-bean-100 font-bold text-bean-600')} aria-hidden>
      {name.trim().charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Icons (inline SVG, stroke style) ────────────────────────────────────────

const PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  stand: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01',
  sheet: 'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9 13h6M9 17h6',
  cash: 'M3 6h18v12H3zM7 12h.01M17 12h.01M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  more: 'M4 6h16M4 12h16M4 18h16',
  back: 'M15 18l-6-6 6-6',
  close: 'M18 6 6 18M6 6l12 12',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  refill: 'M12 3v12m0 0 4-4m-4 4-4-4M4 21h16',
  cart: 'M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 8H6.2M9 20h.01M17 20h.01',
  wallet: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14h.01',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  cup: 'M5 8h12v6a6 6 0 0 1-12 0zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 2v3M11 2v3M14 2v3',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  chevron: 'M9 6l6 6-6 6',
  check: 'M5 12l5 5L20 7',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  warn: 'M12 3 2 21h20zM12 10v5M12 18h.01',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 6l6 6-6 6',
  tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01',
  tv: 'M3 5h18v12H3zM8 21h8M12 17v4',
  paste: 'M9 4h6v3H9zM9 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-3',
};

export function Icon({ name, className }: { name: keyof typeof PATHS | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx('size-5', className)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}
