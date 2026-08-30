'use client';

// FR-014 — импорт отзывов из CSV.
//
// Два шага РАЗДЕЛЕНЫ намеренно: предпросмотр показывает, что будет импортировано и что
// отклонено, и только отдельное действие пишет. Владелец должен иметь возможность передумать,
// увидев, что половина файла отклонена.

import { useState } from 'react';

interface Rejected { line: number; errors: string[] }
interface Preview { accepted: number; rejected: Rejected[]; sample: { name: string; text: string }[] }

export function ImportForm({ slug }: { slug: string }) {
  const [csv, setCsv] = useState('');
  const [mapping, setMapping] = useState({ name: 0, text: 1, role: 2 });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<{ inserted: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(mode: 'preview' | 'commit') {
    setBusy(true); setError(null);
    if (mode === 'preview') { setPreview(null); setDone(null); }
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // project_id НЕ отправляется: сервер берёт проект по slug И по владельцу из сессии.
        body: JSON.stringify({ slug, csv, mode, mapping }),
      });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) { setError((body?.error as string) ?? 'не удалось обработать файл'); return; }
      if (mode === 'preview') setPreview(body as unknown as Preview);
      else { setDone(body as unknown as { inserted: number; skipped: number }); setPreview(null); }
    } catch {
      setError('сеть недоступна, попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsv(await file.text());
    setPreview(null); setDone(null); setError(null);
  }

  return (
    <div className="form" style={{ marginTop: 12 }}>
      <label className="field">
        <span>Файл CSV</span>
        <input type="file" accept=".csv,text/csv" onChange={onFile} className="input" />
      </label>

      <div className="between">
        {(['name', 'text', 'role'] as const).map((k) => (
          <label className="field" key={k} style={{ maxWidth: 160 }}>
            <span>{k === 'name' ? 'Колонка имени' : k === 'text' ? 'Колонка текста' : 'Колонка роли'}</span>
            <input
              type="number" min={0} max={99} className="input"
              value={mapping[k]}
              onChange={(e) => setMapping({ ...mapping, [k]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>

      {error ? <ul className="errors" role="alert"><li>{error}</li></ul> : null}

      {preview ? (
        <div className="card" style={{ marginTop: 12 }}>
          <p><strong>Будет импортировано: {preview.accepted}</strong></p>
          {preview.rejected.length > 0 ? (
            <>
              <p className="small muted">Отклонено строк: {preview.rejected.length}</p>
              <ul className="small muted">
                {preview.rejected.slice(0, 10).map((r) => (
                  <li key={r.line}>строка {r.line}: {r.errors.join('; ')}</li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="small muted">
            Импортированные отзывы попадут в очередь на проверку — как и присланные через форму.
          </p>
        </div>
      ) : null}

      {done ? (
        <p className="small" role="status">
          Импортировано: {done.inserted}. Пропущено как уже существующие: {done.skipped}.
        </p>
      ) : null}

      <div className="between" style={{ marginTop: 12 }}>
        <button type="button" className="btn" disabled={busy || !csv} onClick={() => send('preview')}>
          {busy ? 'Считаем…' : 'Предпросмотр'}
        </button>
        <button
          type="button" className="btn btn--primary"
          disabled={busy || !preview || preview.accepted === 0}
          onClick={() => send('commit')}
        >
          Импортировать{preview ? ` (${preview.accepted})` : ''}
        </button>
      </div>
    </div>
  );
}
