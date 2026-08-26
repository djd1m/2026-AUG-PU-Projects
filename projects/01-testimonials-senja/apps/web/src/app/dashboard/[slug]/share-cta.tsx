'use client';

// Share-CTA (FR-GROWTH-001). Показывается на КАЖДЫЙ новый домен, где отрендерился виджет.
//
// @security сценарий: «без подтверждения не отправляется ни одного запроса к внешней сети».
// Поэтому здесь НЕТ ни одного вызова fetch/navigator.share до нажатия кнопки подтверждения
// в диалоге — ни предзагрузки, ни аналитики «показали CTA» с клиента (событие invite_shown
// пишет сервер в момент установки виджета, а не браузер владельца).

import { useState } from 'react';

export interface Install {
  domain: string;
  first_seen_at: string;
}

export function ShareCta({ slug, wallUrl, installs }: { slug: string; wallUrl: string; installs: Install[] }) {
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (installs.length === 0) {
    // CTA не показывается на онбординге и когда виджет ещё нигде не стоял (@edge-case).
    return null;
  }

  const latest = installs[0]!;

  // Вызывается ТОЛЬКО из обработчика кнопки «Поделиться» в открытом диалоге.
  async function confirmShare() {
    setError(null);
    try {
      // Сначала фиксируем намерение у себя, затем отдаём системному диалогу.
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, domain: latest.domain }),
      });
      if (!res.ok) {
        setError('Не удалось отметить публикацию');
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.share) {
        // Системный диалог сам спрашивает, куда публиковать. Мы ничего не публикуем за владельца.
        await navigator.share({ title: 'Отзывы о нас', url: wallUrl }).catch(() => undefined);
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(wallUrl).catch(() => undefined);
      }
      setSent(true);
      setConfirming(false);
    } catch {
      setError('Сеть недоступна');
    }
  }

  return (
    <section
      style={{
        marginTop: '2rem',
        padding: '1.25rem',
        borderRadius: 12,
        border: '2px solid #0a7d33',
        background: '#f3fbf5',
      }}
    >
      <p style={{ margin: 0, fontWeight: 600 }}>
        Виджет заработал на {installs.length === 1 ? 'новом сайте' : `${installs.length} сайтах`}
      </p>
      <p style={{ margin: '0.35rem 0 0', color: '#444' }}>
        Последний: <code>{latest.domain}</code>
      </p>

      {sent ? (
        <p style={{ margin: '0.75rem 0 0', color: '#0a7d33' }}>Ссылка на стену готова к публикации.</p>
      ) : confirming ? (
        <div style={{ marginTop: '0.9rem' }}>
          <p style={{ margin: '0 0 0.6rem' }}>
            Опубликовать ссылку <code>{wallUrl}</code>? Ничего не отправится, пока вы не подтвердите.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={confirmShare} style={primary}>
              Поделиться
            </button>
            <button type="button" onClick={() => setConfirming(false)} style={secondary}>
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} style={{ ...primary, marginTop: '0.9rem' }}>
          Поделиться стеной отзывов
        </button>
      )}

      {error && <p style={{ color: '#b00020', margin: '0.6rem 0 0' }}>{error}</p>}
    </section>
  );
}

const primary: React.CSSProperties = {
  padding: '0.55rem 1rem',
  borderRadius: 8,
  border: 'none',
  background: '#0a7d33',
  color: '#fff',
  fontSize: '0.95rem',
  cursor: 'pointer',
};

const secondary: React.CSSProperties = {
  padding: '0.55rem 1rem',
  borderRadius: 8,
  border: '1px solid #ccc',
  background: '#fff',
  fontSize: '0.95rem',
  cursor: 'pointer',
};
