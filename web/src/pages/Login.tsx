import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Field, TextInput } from '../components/ui';
import { api } from '../lib/api';

export function LoginPage() {
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/login', { password });
      qc.setQueryData(['me'], { loggedIn: true });
      await qc.invalidateQueries();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bean-900 px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
        <img src="/icon.svg" alt="" className="mx-auto size-16" />
        <h1 className="mt-3 text-center text-xl font-bold text-bean-900">Sodiq Coffee</h1>
        <p className="mb-6 text-center text-sm text-stone-500">Savdo, ombor va kassa hisobi</p>
        <Field label="Parol">
          <TextInput type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        <Button type="submit" size="lg" className="mt-4 w-full" loading={loading} disabled={!password}>
          Kirish
        </Button>
        <a
          href="/menyu"
          className="mt-3 flex h-13 w-full items-center justify-center gap-2 rounded-xl border border-bean-200 text-base font-semibold text-bean-900 hover:bg-bean-50"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 5h18v12H3zM8 21h8M12 17v4" />
          </svg>
          Menyu (TV uchun)
        </a>
        <p className="mt-2 text-center text-xs text-stone-500">Parolsiz ochiladi — televizor brauzerida oching</p>
      </form>
    </div>
  );
}
