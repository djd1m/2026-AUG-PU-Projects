'use client';

// Добавление отзыва, уже существующего на внешней площадке.
//
// ГЛАВНОЕ РЕШЕНИЕ ЭТОЙ ФОРМЫ: от владельца требуется ОДНО действие — вставить снимок или
// ссылку. Всё остальное форма выводит сама либо не требует вовсе:
//
//   · площадка   — из адреса ссылки, без обращения в сеть;
//   · имя автора — не требуется, когда есть снимок: на снимке автор уже виден;
//   · текст      — не требуется, когда есть снимок: снимок И ЕСТЬ содержимое карточки.
//
// Первая редакция требовала шесть полей ради одной картинки, и это была работа, ради
// избавления от которой фича и делалась.
//
// Почему НЕ «вставил ссылку — программа сама прочитала отзыв». Замерено 2026-09-02: Яндекс.
// Карты на серверный запрос отдают КАПЧУ, 2ГИС — пустую оболочку без единого отзыва в разметке,
// а метатеги обеих площадок описывают сервис, а не карточку. Прочитать отзыв с сервера нечем, и
// это не сложность, а защита площадок от ровно такого чтения. Снимок делает браузер ВЛАДЕЛЬЦА,
// где он уже авторизован и никакой капчи нет.

import { useState } from 'react';

export const PLATFORM_OPTIONS = [
  { value: 'yandex_maps', label: 'Яндекс.Карты' },
  { value: 'twogis', label: '2ГИС' },
  { value: 'otzovik', label: 'Отзовик' },
  { value: 'flamp', label: 'Флампе' },
  { value: 'other', label: 'Другой источник' },
] as const;

/** Тот же разбор, что на сервере, — чтобы показать площадку сразу, не дожидаясь ответа. */
const HOSTS: Record<string, string> = {
  'yandex.ru': 'yandex_maps', 'yandex.by': 'yandex_maps', 'yandex.kz': 'yandex_maps',
  'yandex.com': 'yandex_maps', '2gis.ru': 'twogis', '2gis.kz': 'twogis', '2gis.ae': 'twogis',
  '2gis.com': 'twogis', 'otzovik.com': 'otzovik', 'flamp.ru': 'flamp',
};

function detect(raw: string): string | null {
  try {
    const host = new URL(raw.trim()).hostname.toLowerCase();
    for (const [h, key] of Object.entries(HOSTS)) {
      if (host === h || host.endsWith(`.${h}`)) return key;
    }
    return 'other';
  } catch { return null; }
}

export function PlatformForm({ slug }: { slug: string }) {
  const [sourceUrl, setSourceUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [details, setDetails] = useState(false);
  const [platform, setPlatform] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const detected = detect(sourceUrl);
  const effective = platform || detected || '';
  const label = PLATFORM_OPTIONS.find((p) => p.value === effective)?.label ?? null;

  // Без снимка текст обязателен: пустая карточка со ссылкой читателю ничего не сообщает.
  const ready = (file !== null) || (sourceUrl.trim() !== '' && text.trim() !== '');

  // Вставка из буфера — главный сценарий. Владелец нажал «снимок области» в своей системе,
  // картинка уже в буфере; заставлять его сохранять файл и потом искать его в диалоге —
  // три лишних шага там, где хватает Ctrl+V.
  function onPaste(event: React.ClipboardEvent) {
    const img = Array.from(event.clipboardData.files).find((f) => f.type.startsWith('image/'));
    if (img) { setFile(img); setErrors([]); return; }
    const pasted = event.clipboardData.getData('text').trim();
    if (pasted.startsWith('https://')) { setSourceUrl(pasted); setErrors([]); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setErrors([]); setDone(false);
    try {
      const form = new FormData();
      // project_id НЕ отправляется: сервер берёт проект по slug и владельцу из сессии.
      form.set('slug', slug);
      if (effective) form.set('platform', effective);
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
      setSourceUrl(''); setFile(null); setName(''); setRole(''); setText('');
      setPlatform(''); setDetails(false);
    } catch {
      setErrors(['сеть недоступна, попробуйте ещё раз']);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} onPaste={onPaste}>
      <label className="field">
        <span>Снимок отзыва <em>вставьте из буфера — Ctrl+V — или выберите файл</em></span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {file && <p className="ok">Снимок вложен: {file.name || 'из буфера'}</p>}

      <label className="field">
        <span>…или ссылка на отзыв</span>
        <input
          type="url"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://yandex.ru/maps/org/…/reviews/"
        />
      </label>
      {label && <p className="hint">Площадка определена: <strong>{label}</strong></p>}

      {sourceUrl.trim() !== '' && file === null && (
        <label className="field">
          <span>Текст отзыва <em>обязателен, когда нет снимка</em></span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={3} />
        </label>
      )}

      <button type="button" className="linklike" onClick={() => setDetails(!details)}>
        {details ? 'Свернуть' : 'Уточнить детали — имя автора, площадка, подпись'}
      </button>

      {details && (
        <div className="stack">
          <label className="field">
            <span>Имя автора <em>не нужно, если оно видно на снимке</em></span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </label>
          <label className="field">
            <span>Роль или компания</span>
            <input value={role} onChange={(e) => setRole(e.target.value)} maxLength={120} />
          </label>
          <label className="field">
            <span>Площадка <em>обычно определяется по ссылке</em></span>
            <select value={effective} onChange={(e) => setPlatform(e.target.value)}>
              <option value="">— по ссылке —</option>
              {PLATFORM_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
          {file !== null && (
            <label className="field">
              <span>Текст отзыва <em>необязательно: снимок уже показывает его</em></span>
              <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={3} />
            </label>
          )}
        </div>
      )}

      <p className="hint">
        Добавляя чужой отзыв или его снимок, вы подтверждаете, что вправе его опубликовать.
      </p>

      {errors.length > 0 && <ul className="errors">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      {done && <p className="ok">Добавлено. Отзыв ждёт вашего одобрения в списке выше.</p>}

      <button type="submit" disabled={busy || !ready}>
        {busy ? 'Добавляем…' : 'Добавить отзыв'}
      </button>
    </form>
  );
}
