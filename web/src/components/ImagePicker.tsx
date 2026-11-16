import { useEffect, useRef, useState } from 'react';
import { useToast } from './toast';
import { Icon, Thumb, cx } from './ui';

function imageFromList(items: DataTransferItemList | undefined | null): File | null {
  if (!items) return null;
  for (const item of Array.from(items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  return null;
}

const canReadClipboard = typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function';

/**
 * Photo picker. Ways to add a photo:
 *  - "Rasm qoʻshish": camera or gallery (phones) / file dialog (computers)
 *  - Ctrl+V anywhere while the picker is on screen, or the "Joylash" button
 *  - drag and drop onto the picture
 */
export function ImagePicker({
  src,
  name,
  onPick,
  onRemove,
}: {
  src: string | null;
  name: string;
  onPick: (file: File) => Promise<unknown>;
  onRemove?: () => Promise<unknown>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const toast = useToast();
  const handleRef = useRef<(file: File | null | undefined) => void>(() => {});

  async function handle(file: File | null | undefined) {
    if (!file || busy) return;
    if (!file.type.startsWith('image/')) {
      toast('Bu fayl rasm emas', 'error');
      return;
    }
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      await onPick(file);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
      setPreview(null);
      if (ref.current) ref.current.value = '';
    }
  }
  handleRef.current = handle;

  // Ctrl+V / Cmd+V with an image in the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFromList(e.clipboardData?.items);
      if (!file) return; // plain text paste into an input stays untouched
      e.preventDefault();
      handleRef.current(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  async function pasteFromButton() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) {
          const blob = await item.getType(type);
          await handle(new File([blob], `pasted.${type.split('/')[1] ?? 'png'}`, { type }));
          return;
        }
      }
      toast('Buferda rasm yoʻq. Avval rasmni nusxalang.', 'error');
    } catch {
      toast('Buferni oʻqib boʻlmadi. Ctrl+V bosib koʻring yoki brauzerga ruxsat bering.', 'error');
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div
        className={cx('relative rounded-xl', dragOver && 'ring-2 ring-bean-500 ring-offset-2')}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handle(e.dataTransfer.files?.[0] ?? imageFromList(e.dataTransfer.items));
        }}
      >
        <button type="button" onClick={() => ref.current?.click()} disabled={busy} aria-label="Rasm tanlash">
          <Thumb src={preview ?? src} name={name || '?'} size="lg" />
        </button>
        {busy && (
          <div className="absolute inset-0 grid place-items-center rounded-xl bg-white/60">
            <div className="size-6 animate-spin rounded-full border-2 border-bean-700 border-t-transparent" />
          </div>
        )}
      </div>
      <div className="flex flex-col items-start gap-1.5">
        <button type="button" className="flex items-center gap-2 text-sm font-semibold text-bean-800" onClick={() => ref.current?.click()} disabled={busy}>
          <Icon name="camera" className="size-4" /> {src ? 'Rasmni almashtirish' : 'Rasm qoʻshish'}
        </button>
        {canReadClipboard && (
          <button type="button" className="flex items-center gap-2 text-sm font-semibold text-bean-800" onClick={pasteFromButton} disabled={busy}>
            <Icon name="paste" className="size-4" /> Joylash
          </button>
        )}
        <span className="text-xs text-stone-500">yoki rasmni nusxalab, Ctrl+V bosing</span>
        {src && onRemove && (
          <button
            type="button"
            className="text-sm text-stone-500"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onRemove();
              } finally {
                setBusy(false);
              }
            }}
          >
            Rasmni olib tashlash
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => handle(e.target.files?.[0])} />
    </div>
  );
}
