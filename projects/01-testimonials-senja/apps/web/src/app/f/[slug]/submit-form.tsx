'use client';

// Клиентская часть формы сбора (FR-002). Валидация здесь — только для удобства автора;
// авторитетная проверка выполняется на сервере (lib/testimonial.ts), клиенту не доверяем.

import { useState } from 'react';
import type { Branding } from '@/lib/branding';

const NAME_MIN = 2;
const NAME_MAX = 80;
const TEXT_MIN = 10;
const TEXT_MAX = 2000;

export function SubmitForm({ slug, branding }: { slug: string; branding: Branding }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <section className="thanks" style={{ borderColor: branding.accent_color }}>
        <span className="thanks__mark" style={{ background: branding.accent_color }}>✓</span>
        <p className="thanks__title">Спасибо! Отзыв отправлен.</p>
        <p className="muted small" style={{ marginTop: 6 }}>
          Он появится на странице после проверки владельцем.
        </p>
      </section>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors([]);
    setSending(true);
    try {
      const res = await fetch('/api/testimonials', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, type: 'text', name, role, text }),
      });
      if (res.status === 201) {
        setDone(true);
        return;
      }
      if (res.status === 429) {
        setErrors(['Слишком много отправок с этого адреса. Попробуйте позже.']);
        return;
      }
      const data = (await res.json()) as { errors?: string[]; error?: string };
      setErrors(data.errors ?? [data.error ?? `Ошибка ${res.status}`]);
    } catch {
      setErrors(['Сеть недоступна — попробуйте ещё раз']);
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} className="form" style={{ marginTop: 22 }}>
      <label className="field">
        <span>Ваше имя</span>
        <input
          required
          minLength={NAME_MIN}
          maxLength={NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input"
        />
      </label>

      <label className="field">
        <span>
          Роль или компания <span style={{ color: '#888' }}>(необязательно)</span>
        </span>
        <input value={role} onChange={(e) => setRole(e.target.value)} className="input" />
      </label>

      <label className="field">
        <span>Отзыв</span>
        <textarea
          required
          minLength={TEXT_MIN}
          maxLength={TEXT_MAX}
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="textarea"
        />
        <small className="counter" style={text.length > TEXT_MAX ? { color: 'var(--danger)' } : undefined}>
          {text.length} / {TEXT_MAX}
        </small>
      </label>

      {errors.length > 0 && (
        <ul className="errors">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        disabled={sending}
        className="btn btn--primary btn--block"
        style={sending ? undefined : { background: branding.accent_color }}
      >
        {sending ? 'Отправляем…' : 'Отправить отзыв'}
      </button>
    </form>
  );
}

