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
      <section
        style={{
          marginTop: '2rem',
          padding: '2rem',
          borderRadius: 12,
          border: `2px solid ${branding.accent_color}`,
          textAlign: 'center',
        }}
      >
        <p style={{ margin: 0, fontWeight: 600 }}>Спасибо! Отзыв отправлен.</p>
        <p style={{ margin: '0.5rem 0 0', color: '#666' }}>
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
    <form onSubmit={submit} style={{ display: 'grid', gap: '1rem', marginTop: '2rem' }}>
      <label style={{ display: 'grid', gap: '0.35rem' }}>
        <span>Ваше имя</span>
        <input
          required
          minLength={NAME_MIN}
          maxLength={NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
      </label>

      <label style={{ display: 'grid', gap: '0.35rem' }}>
        <span>
          Роль или компания <span style={{ color: '#888' }}>(необязательно)</span>
        </span>
        <input value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle} />
      </label>

      <label style={{ display: 'grid', gap: '0.35rem' }}>
        <span>Отзыв</span>
        <textarea
          required
          minLength={TEXT_MIN}
          maxLength={TEXT_MAX}
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        <small style={{ color: text.length > TEXT_MAX ? '#b00020' : '#888' }}>
          {text.length} / {TEXT_MAX}
        </small>
      </label>

      {errors.length > 0 && (
        <ul style={{ color: '#b00020', margin: 0, paddingLeft: '1.2rem' }}>
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        disabled={sending}
        style={{
          padding: '0.7rem 1rem',
          borderRadius: 8,
          border: 'none',
          background: sending ? '#bbb' : branding.accent_color,
          color: '#fff',
          fontSize: '1rem',
          cursor: sending ? 'not-allowed' : 'pointer',
        }}
      >
        {sending ? 'Отправляем…' : 'Отправить отзыв'}
      </button>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '0.6rem 0.7rem',
  borderRadius: 8,
  border: '1px solid #ccc',
  fontSize: '1rem',
  fontFamily: 'inherit',
};
