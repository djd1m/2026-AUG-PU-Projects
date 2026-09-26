'use client';
import { useState } from 'react';
import { CTA_CHOICES, CtaError, parseCtaTarget } from '@clipmaker/shared/cta';
import type { CtaKind } from '@clipmaker/shared/enums';
import { rpc } from '../../lib/rpc';
// Выбор призыва в конце клипа (ADR-017, FR-RESULT-006): вид — из закрытого набора, адрес — только https.
// Проверка здесь — подсказка до отправки; решает сервер тем же parseCtaTarget.
export function ctaProblem(kind: CtaKind, url: string): string | null {
  try { parseCtaTarget(kind, kind === 'none' ? null : url.trim()); return null; }
  catch (error) { return error instanceof CtaError ? error.message : 'Проверьте адрес ссылки'; }
}
export function CtaFields({ id, kind, url, disabled, onKind, onUrl }: { id: string; kind: CtaKind; url: string; disabled?: boolean;
  onKind: (kind: CtaKind) => void; onUrl: (url: string) => void }) {
  return <div className="cta-fields">
    <label htmlFor={`${id}-kind`}>Что сделать зрителю в конце</label>
    <select id={`${id}-kind`} value={kind} disabled={disabled} onChange={event => onKind(event.target.value as CtaKind)}>
      {CTA_CHOICES.map(choice => <option key={choice.kind} value={choice.kind}>{choice.label}</option>)}
    </select>
    {kind !== 'none' && <><label htmlFor={`${id}-url`}>Ссылка (https://…)</label>
      <input id={`${id}-url`} type="url" inputMode="url" autoComplete="url" required maxLength={2048} placeholder="https://www.youtube.com/watch?v=…"
        value={url} disabled={disabled} onChange={event => onUrl(event.target.value)} />
      <small className="muted">Кнопка с этой ссылкой появится на странице клипа; домен увидит зритель.</small></>}
  </div>;
}
export function ctaSavedMessage(kind: CtaKind, rerendering: number): string {
  const page = kind === 'none' ? 'Призыв убран со страниц клипов.' : 'Сохранено. Кнопка уже на страницах клипов.';
  return rerendering > 0 ? `${page} Пересобираем клипов: ${rerendering} — в видео изменение появится после сборки.` : page;
}
export function VideoCtaForm({ videoId, initialKind, initialUrl }: { videoId: string; initialKind: CtaKind; initialUrl: string | null }) {
  const [kind, setKind] = useState<CtaKind>(initialKind), [url, setUrl] = useState(initialUrl ?? '');
  const [saved, setSaved] = useState({ kind: initialKind, url: initialUrl ?? '' });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const changed = kind !== saved.kind || (kind !== 'none' && url.trim() !== saved.url);
  async function save() {
    const problem = ctaProblem(kind, url);
    if (problem) { setError(problem); setMessage(''); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await rpc<{ cta_kind: CtaKind; cta_url: string | null; rerendering?: number }>('video.setCta',
        { video_id: videoId, cta_kind: kind, cta_url: kind === 'none' ? null : url.trim() }, true);
      setKind(result.cta_kind); setUrl(result.cta_url ?? ''); setSaved({ kind: result.cta_kind, url: result.cta_url ?? '' });
      setMessage(ctaSavedMessage(result.cta_kind, result.rerendering ?? 0));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить призыв'); }
    finally { setBusy(false); }
  }
  return <section className="cta-panel" aria-labelledby="cta-heading"><h2 id="cta-heading">Призыв в конце</h2>
    <p className="muted">Главная кнопка на странице клипа по короткой ссылке и короткая надпись в последние 2,5 с видео, над адресом.
      Смена вида пересобирает все готовые клипы записи — по одной пересборке на клип из суточного лимита; смена только ссылки — без пересборки.</p>
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <CtaFields id="video-cta" kind={kind} url={url} disabled={busy} onKind={next => { setKind(next); setError(''); setMessage(''); }}
        onUrl={next => { setUrl(next); setError(''); setMessage(''); }} />
      <button type="submit" disabled={busy || !changed}>{busy ? 'Сохраняем…' : 'Сохранить призыв'}</button>
    </form>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
