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
  photo_url: string | null;
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

const CHIP: Record<Item['status'], string> = {
  pending: 'chip chip--warn',
  approved: 'chip chip--ok',
  rejected: 'chip chip--danger',
  hidden: 'chip',
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
      <div className="empty">
        <p style={{ margin: 0 }}>Отзывов пока нет. Поделитесь ссылкой на форму сбора.</p>
      </div>
    );
  }

  return (
    <div className="stack">
      {error && <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
      {items.map((item) => (
        <article key={item.id} className="modItem">
          <header className="between">
            <div>
              {/* Всё авторское выводится через {} — React экранирует. Приём хранит
                  разметку побайтово (FR-NFR-SEC-002), безопасным её делает ЭТОТ шаг. */}
              <strong>{item.author_name}</strong>
              {item.author_role && <span className="muted"> · {item.author_role}</span>}
            </div>
            <span className={CHIP[item.status]}>{LABEL[item.status]}</span>
          </header>

          {item.has_video && (
            <p className="small muted" style={{ marginTop: 8 }}>
              🎥 Видео{item.transcript ? ' · расшифровка готова' : ' · расшифровка в очереди'}
            </p>
          )}
          {item.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element -- см. комментарий на стене
            <img src={item.photo_url} alt="" className="modItem__photo" loading="lazy" />
          )}
          {item.text && <p className="modItem__text">{item.text}</p>}
          {item.transcript && (
            <p className="modItem__transcript">{item.transcript}</p>
          )}

          <footer className="row" style={{ marginTop: 16 }}>
            {NEXT_STATES[item.status].map((next) => (
              <button
                key={next}
                type="button"
                disabled={busy === item.id}
                onClick={() => move(item.id, next)}
                className={`btn btn--sm ${next === 'approved' ? 'btn--primary' : 'btn--ghost'}`}
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
