'use client';

// Маршрут результата — `GET /api/v1/scans/{id}` (RV-source-and-correct-01, слепое ревью
// 2026-09-13). До этой правки `result-screen.tsx` нигде не подключался: маршрута не было,
// кнопки не имели обработчиков. Здесь — единственное место, где `apps/web` делает сетевые
// запросы к `apps/api`: относительным путём `/api/v1/...`, тем же origin, что и сама
// страница (Caddy, профиль `edge`, `handle /api/* { reverse_proxy api:3000 }`) — второго
// адреса заводить незачем и запрещено политикой `connect-src 'self'` (`middleware.ts`).
//
// Поллинг — пока статус не терминален (`queued`); `done`/`failed`/`refused` завершают его.
// После каждого `correct` ответ сервера ЗАМЕНЯЕТ локальное состояние целиком: сервер —
// источник истины (FR-source-and-correct-12, `RenderResultSurface` шаг 5).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { ScanResultScreen, type ReplaceCandidate, type ScanResultResponse } from '../result-screen';
import { buildCorrectRequest, type CorrectAction } from '../correct-request';

type LoadState = { readonly kind: 'loading' } | { readonly kind: 'error'; readonly message: string } | { readonly kind: 'scan'; readonly scan: ScanResultResponse & { readonly status: string; readonly failure_reason: string | null } };

const POLL_MS = 1500;

async function parseJsonOrThrow(response: Response): Promise<{ data: unknown }> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body !== null && typeof body === 'object' && 'error' in body ? JSON.stringify((body as { error: unknown }).error) : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body as { data: unknown };
}

export default function ScanResultPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const scanId = params.id;
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`/api/v1/scans/${scanId}`, { credentials: 'same-origin' });
      const body = await parseJsonOrThrow(response);
      const scan = body.data as ScanResultResponse & { status: string; failure_reason: string | null };
      setState({ kind: 'scan', scan });
      if (scan.status === 'queued') {
        timerRef.current = setTimeout(() => void load(), POLL_MS);
      }
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : 'не удалось получить скан' });
    }
  }, [scanId]);

  useEffect(() => {
    void load();
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [load]);

  const correct = useCallback(
    async (action: CorrectAction): Promise<ScanResultResponse & { status: string; failure_reason: string | null; candidates?: readonly ReplaceCandidate[] }> => {
      const { url, body } = buildCorrectRequest(scanId, action);
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const parsed = await parseJsonOrThrow(response);
      return parsed.data as ScanResultResponse & { status: string; failure_reason: string | null; candidates?: readonly ReplaceCandidate[] };
    },
    [scanId],
  );

  if (state.kind === 'loading') return <p className="result__status">загрузка…</p>;
  if (state.kind === 'error') return <p className="result__status result__status--error">{state.message}</p>;
  if (state.kind === 'scan' && state.scan.status === 'queued') return <p className="result__status">распознаётся…</p>;
  if (state.kind === 'scan' && state.scan.status !== 'done') {
    return <p className="result__status">{state.scan.failure_reason ?? 'блюда нет в базе, уточните ингредиент вручную'}</p>;
  }

  const scan = state.scan;
  return (
    <ScanResultScreen
      scan={scan}
      actions={{
        onSetPortion: async (index, massG) => {
          const updated = await correct({ op: 'set_portion', index, massG });
          setState({ kind: 'scan', scan: updated });
        },
        onDelete: async (index) => {
          const updated = await correct({ op: 'delete_item', index });
          setState({ kind: 'scan', scan: updated });
        },
        onSearchReplace: async (query): Promise<readonly ReplaceCandidate[]> => {
          const updated = await correct({ op: 'replace_item_search', query });
          return updated.candidates ?? [];
        },
        onReplace: async (index, foodItemId) => {
          const updated = await correct({ op: 'replace_item_select', index, foodItemId });
          setState({ kind: 'scan', scan: updated });
        },
        onResolveConflict: async () => {
          const updated = await correct({ op: 'resolve_conflict' });
          setState({ kind: 'scan', scan: updated });
        },
      }}
    />
  );
}
