import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { MovementRow, KIND_LABEL } from '../components/MovementRow';
import { Button, Card, Empty, ErrorBox, Page, Select, Spinner } from '../components/ui';
import { api, type Movement, type MovementKind } from '../lib/api';

export function HistoryPage() {
  const [kind, setKind] = useState<MovementKind | ''>('');
  const q = useInfiniteQuery({
    queryKey: ['movements', 'all', kind],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.get<Movement[]>(`/movements?limit=50${kind ? `&kind=${kind}` : ''}${pageParam ? `&before=${pageParam}` : ''}`),
    getNextPageParam: (last) => (last.length === 50 ? last.at(-1)!.id : undefined),
  });
  const rows = q.data?.pages.flat() ?? [];

  return (
    <Page title="Ombor tarixi" back="/yana">
      <Select value={kind} onChange={(e) => setKind(e.target.value as MovementKind | '')} className="mb-3">
        <option value="">Barcha harakatlar</option>
        {(Object.keys(KIND_LABEL) as MovementKind[]).map((k) => (
          <option key={k} value={k}>
            {KIND_LABEL[k]}
          </option>
        ))}
      </Select>
      {q.isPending ? (
        <Spinner />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : rows.length === 0 ? (
        <Empty>Hali yozuv yoʻq</Empty>
      ) : (
        <>
          <Card className="divide-y divide-bean-100 p-0">
            {rows.map((m) => (
              <MovementRow key={m.id} m={m} />
            ))}
          </Card>
          {q.hasNextPage && (
            <Button variant="secondary" className="mt-3 w-full" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
              Yana yuklash
            </Button>
          )}
        </>
      )}
    </Page>
  );
}
