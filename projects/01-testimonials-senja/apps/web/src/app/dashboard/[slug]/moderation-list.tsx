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
  /** form | import | demo | platform. */
  source: string;
  source_platform: string | null;
  source_url: string | null;
  screenshot_object_key: string | null;
  created_at: string;
}

/** Подписи площадок для списка модерации. Дублировать таблицу целиком незачем: здесь нужны
 *  только названия, а решение о площадке принимает сервер. */
const PLATFORM_LABEL: Record<string, string> = {
  yandex_maps: 'Яндекс.Карты', twogis: '2ГИС', otzovik: 'Отзовик',
  flamp: 'Флампе', other: 'внешняя площадка',
};

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
              {item.author_name !== ''
                ? <strong>{item.author_name}</strong>
                : <strong className="muted">без имени автора</strong>}
              {item.author_role && <span className="muted"> · {item.author_role}</span>}
            </div>
            <span className={CHIP[item.status]}>{LABEL[item.status]}</span>
          </header>

          {item.has_video && (
            <p className="small muted" style={{ marginTop: 8 }}>
              🎥 Видео{item.transcript ? ' · расшифровка готова' : ' · расшифровка в очереди'}
            </p>
          )}
          {/* Снимок отзыва — ГЛАВНОЕ, что модератор обязан увидеть. Без него у отзыва,
              принесённого снимком, карточка пуста: ни имени, ни текста, и владелец жал бы
              «Опубликовать» вслепую. Модерация, в которой не видно предмета, — не модерация.
              Найдено владельцем на живом стенде. */}
          {item.screenshot_object_key && (
            <a
              href={`/api/photo/${item.screenshot_object_key}`}
              target="_blank"
              rel="noopener noreferrer"
              className="modItem__shot"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- наш роут /api/photo */}
              <img src={`/api/photo/${item.screenshot_object_key}`} alt="Снимок отзыва" loading="lazy" />
            </a>
          )}

          {item.source === 'platform' && (
            <p className="small muted" style={{ marginTop: 8 }}>
              {item.source_url
                ? <a href={item.source_url} target="_blank" rel="nofollow noopener noreferrer">
                    Первоисточник: {PLATFORM_LABEL[item.source_platform ?? ''] ?? 'внешняя площадка'} →
                  </a>
                : <>Перенесён с: {PLATFORM_LABEL[item.source_platform ?? ''] ?? 'внешней площадки'} · ссылки нет</>}
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
