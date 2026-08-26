'use client';

// Очередь модерации (FR-004). Переходы отправляются на
// POST /api/testimonials/<id>/moderate — там же и проверка владения, и RLS.

import { useState } from 'react';

export interface Item {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'hidden';
  author_name: string;
  author_role: string | null;
  text: string;
  transcript: string | null;
  has_video: boolean;
  created_at: string;
}

const NEXT_STATES: Record<Item['status'], Item['status'][]> = {
  pending: ['approved', 'rejected'],
  approved: ['rejected', 'hidden'],
  rejected: ['approved', 'hidden'],
  hidden: ['approved', 'rejected'],
};

const LABEL: Record<Item['status'], string> = {
  pending: 'На проверке',
  approved: 'Опубликован',
  rejected: 'Отклонён',
  hidden: 'Скрыт',
};

const COLOR: Record<Item['status'], string> = {
  pending: '#7a5200',
  approved: '#0a7d33',
  rejected: '#b00020',
  hidden: '#666',
};

export function ModerationList({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function move(id: string, status: Item['status']) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/testimonials/${id}/moderate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
        return;
      }
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? `Ошибка ${res.status}`);
    } catch {
      setError('Сеть недоступна');
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return (
      <p style={{ color: '#666', padding: '1.5rem', border: '1px dashed #d0d0d0', borderRadius: 12 }}>
        Отзывов пока нет. Поделитесь ссылкой на форму сбора.
      </p>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {error && <p style={{ color: '#b00020', margin: 0 }}>{error}</p>}
      {items.map((item) => (
        <article key={item.id} style={{ border: '1px solid #e0e0e0', borderRadius: 12, padding: '1rem' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              {/* Всё авторское выводится через {} — React экранирует. Приём хранит
                  разметку побайтово (FR-NFR-SEC-002), безопасным её делает ЭТОТ шаг. */}
              <strong>{item.author_name}</strong>
              {item.author_role && <span style={{ color: '#666' }}> · {item.author_role}</span>}
            </div>
            <span style={{ color: COLOR[item.status], fontSize: '0.9rem' }}>{LABEL[item.status]}</span>
          </header>

          {item.has_video && (
            <p style={{ margin: '0.5rem 0 0', color: '#666', fontSize: '0.9rem' }}>
              🎥 Видео{item.transcript ? ' · расшифровка готова' : ' · расшифровка в очереди'}
            </p>
          )}
          {item.text && <p style={{ margin: '0.75rem 0 0', whiteSpace: 'pre-wrap' }}>{item.text}</p>}
          {item.transcript && (
            <p style={{ margin: '0.5rem 0 0', color: '#444', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
              {item.transcript}
            </p>
          )}

          <footer style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            {NEXT_STATES[item.status].map((next) => (
              <button
                key={next}
                type="button"
                disabled={busy === item.id}
                onClick={() => move(item.id, next)}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: 8,
                  border: '1px solid #ccc',
                  background: busy === item.id ? '#eee' : '#fff',
                  cursor: busy === item.id ? 'wait' : 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                {next === 'approved' ? 'Опубликовать' : next === 'rejected' ? 'Отклонить' : 'Скрыть'}
              </button>
            ))}
          </footer>
        </article>
      ))}
    </div>
  );
}
