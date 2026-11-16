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
      </form>
    </div>
  );
}
