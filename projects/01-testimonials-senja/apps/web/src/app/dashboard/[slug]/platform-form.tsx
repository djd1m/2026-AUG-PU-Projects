'use client';

// Добавление отзыва, уже существующего на внешней площадке.
//
// Форма отправляется как multipart, а не JSON: снимок экрана — файл, и превращать его в
// base64 ради JSON значило бы раздуть тело на треть и держать его в памяти дважды.
//
// Список площадок ПОВТОРЯЕТ серверный, но не заменяет его: здесь он нужен, чтобы показать
// выпадающий список, а решение принимает сервер. Совпадение проверяется тестом — расхождение
// иначе всплыло бы у владельца как «выбрал площадку, получил отказ».

import { useState } from 'react';

export const PLATFORM_OPTIONS = [
  { value: 'yandex_maps', label: 'Яндекс.Карты' },
  { value: 'twogis', label: '2ГИС' },
  { value: 'otzovik', label: 'Отзовик' },
  { value: 'flamp', label: 'Флампе' },
  { value: 'other', label: 'Другой источник' },
] as const;

export function PlatformForm({ slug }: { slug: string }) {
  const [platform, setPlatform] = useState<string>('yandex_maps');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [text, setText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  // Подсказка о нехватке доказательства показывается ДО отправки: узнать об этом из ответа
  // сервера после заполнения всех полей — лишний круг, который владелец пройдёт зря.
  const noProof = sourceUrl.trim() === '' && file === null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setErrors([]); setDone(false);
    try {
      const form = new FormData();
      // project_id НЕ отправляется: сервер берёт проект по slug И по владельцу из сессии.
      form.set('slug', slug);
      form.set('platform', platform);
      form.set('name', name);
      form.set('role', role);
      form.set('text', text);
      form.set('source_url', sourceUrl);
      if (file) form.set('screenshot', file);

      const res = await fetch('/api/testimonials/platform', { method: 'POST', body: form });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        const list = Array.isArray(body?.errors) ? (body.errors as string[]) : null;
        setErrors(list ?? [(body?.error as string) ?? 'не удалось добавить отзыв']);
        return;
      }
      setDone(true);
      setName(''); setRole(''); setText(''); setSourceUrl(''); setFile(null);
    } catch {
      setErrors(['сеть недоступна, попробуйте ещё раз']);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span>Площадка</span>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
          {PLATFORM_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Имя автора</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} />
      </label>

      <label className="field">
        <span>Роль или компания <em>необязательно</em></span>
        <input value={role} onChange={(e) => setRole(e.target.value)} maxLength={120} />
      </label>

      <label className="field">
        <span>Текст отзыва</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} required minLength={2} maxLength={2000} rows={4} />
      </label>

      <label className="field">
        <span>Ссылка на отзыв у площадки</span>
        <input
          type="url"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://yandex.ru/maps/org/…/reviews/"
        />
      </label>

      <label className="field">
        <span>Снимок экрана <em>JPEG, PNG или WebP, до 5 МБ</em></span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>

      {noProof && (
        <p className="hint">
          Нужна ссылка на отзыв или его снимок — хотя бы одно. Без этого получится просто текст,
          набранный вами, а на карточке будет стоять пометка «отзыв с площадки», которую читателю
          нечем проверить.
        </p>
      )}

      <p className="hint">
        Добавляя чужой отзыв или его снимок, вы подтверждаете, что вправе его опубликовать.
      </p>

      {errors.length > 0 && (
        <ul className="errors">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      {done && <p className="ok">Добавлено. Отзыв ждёт вашего одобрения в списке выше.</p>}

      <button type="submit" disabled={busy || noProof}>
        {busy ? 'Добавляем…' : 'Добавить отзыв'}
      </button>
    </form>
  );
}
