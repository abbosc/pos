import { useRef, useState } from 'react';
import { useToast } from './toast';
import { Icon, Thumb } from './ui';

/**
 * Photo picker. On phones the file input offers the camera or the gallery.
 * `onPick` receives the file; `onRemove` clears the current image.
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
  const [preview, setPreview] = useState<string | null>(null);
  const toast = useToast();

  async function handle(file: File | undefined) {
    if (!file) return;
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

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <Thumb src={preview ?? src} name={name || '?'} size="lg" />
        {busy && (
          <div className="absolute inset-0 grid place-items-center rounded-xl bg-white/60">
            <div className="size-6 animate-spin rounded-full border-2 border-bean-700 border-t-transparent" />
          </div>
        )}
      </div>
      <div className="flex flex-col items-start gap-1">
        <button type="button" className="flex items-center gap-2 text-sm font-semibold text-bean-800" onClick={() => ref.current?.click()} disabled={busy}>
          <Icon name="camera" className="size-4" /> {src ? 'Rasmni almashtirish' : 'Rasm qoʻshish'}
        </button>
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
