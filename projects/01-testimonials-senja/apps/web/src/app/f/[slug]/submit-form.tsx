'use client';

// Клиентская часть формы сбора (FR-002). Валидация здесь — только для удобства автора;
// авторитетная проверка выполняется на сервере (lib/testimonial.ts), клиенту не доверяем.

import { useEffect, useRef, useState } from 'react';
import type { Branding } from '@/lib/branding';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ACCEPT_PHOTO = 'image/jpeg,image/png,image/webp';

const NAME_MIN = 2;
const NAME_MAX = 80;
const TEXT_MIN = 10;
const TEXT_MAX = 2000;

export function SubmitForm({ slug, branding }: { slug: string; branding: Branding }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Предпросмотр живёт на blob-URL, который надо освобождать: без revoke каждая
  // смена файла оставляет объект в памяти вкладки до её закрытия.
  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function pickPhoto(file: File | null) {
    setErrors([]);
    if (!file) {
      setPhoto(null);
      return;
    }
    // Проверка здесь — только для удобства автора: он узнаёт о проблеме сразу,
    // а не после отправки пяти мегабайт. Авторитетная проверка на сервере.
    if (file.size > MAX_PHOTO_BYTES) {
      setErrors(['Фото больше 5 МБ — выберите файл поменьше']);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setPhoto(file);
  }

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
      // С фото — multipart: base64 в JSON раздул бы запрос на треть и лишил
      // сервер возможности отказать по размеру ДО чтения файла в память.
      let res: Response;
      if (photo) {
        const form = new FormData();
        form.set('slug', slug);
        form.set('type', 'text');
        form.set('name', name);
        form.set('role', role);
        form.set('text', text);
        form.set('photo', photo, photo.name);
        res = await fetch('/api/testimonials', { method: 'POST', body: form });
      } else {
        res = await fetch('/api/testimonials', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slug, type: 'text', name, role, text }),
        });
      }
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

      <div className="field">
        <span>
          Ваше фото <span className="field__hint">необязательно · JPEG, PNG или WebP, до 5 МБ</span>
        </span>
        {preview ? (
          <div className="photoPick">
            {/* eslint-disable-next-line @next/next/no-img-element -- локальный blob-URL,
                файл ещё не отправлен; next/image здесь неприменим. */}
            <img src={preview} alt="Предпросмотр выбранного фото" className="photoPick__thumb" />
            <div className="photoPick__meta">
              <span className="small">{photo?.name}</span>
              <span className="small muted">{Math.round((photo?.size ?? 0) / 1024)} КБ</span>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setPhoto(null);
                if (fileRef.current) fileRef.current.value = '';
              }}
            >
              Убрать
            </button>
          </div>
        ) : (
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT_PHOTO}
            className="input"
            onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
          />
        )}
      </div>

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

