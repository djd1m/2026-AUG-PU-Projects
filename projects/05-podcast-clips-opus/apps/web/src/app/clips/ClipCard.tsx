'use client';
import { ProInterest } from '../dashboard/ProInterest';
import { useState } from 'react';
import { rpc } from '../../lib/rpc';
import type { ClipScreen } from '../../lib/screen-contract';
import { useClipDownload } from './useClipDownload';
export function ClipCard({ clip }: { clip: ClipScreen }) {
  const { download, downloadingId, error } = useClipDownload();
  const [copying, setCopying] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  async function copyLink() {
    setCopying(true); setCopyMessage('');
    try {
      const { url } = await rpc<{ code: string; url: string }>('link.create', { clip_id: clip.clip_id }, true);
      const absolute = new URL(url, window.location.origin).href;
      try { await navigator.clipboard.writeText(absolute); setCopyMessage('Ссылка скопирована'); }
      catch { setCopyMessage(`Скопируйте ссылку вручную: ${absolute}`); }
    } catch (cause) { setCopyMessage(cause instanceof Error ? cause.message : 'Не удалось получить ссылку'); }
    finally { setCopying(false); }
  }
  const expired = !!clip.expires_at && Date.parse(clip.expires_at) <= Date.now();
  return <article className="clip-card">
    <div className="clip-preview">{clip.available ? <video controls playsInline preload="none"
      poster={`/api/clips/${clip.clip_id}/thumbnail`} src={`/api/clips/${clip.clip_id}/file`} aria-label={clip.title} />
      : <p>{expired ? 'Срок хранения истёк' : clip.status === 'failed' ? 'Не удалось собрать клип' : 'Собираем клип…'}</p>}</div>
    <div className="clip-body"><div className="eyebrow">ФРАГМЕНТ {String(clip.index).padStart(2, '0')} · {(clip.duration_seconds == null ? clip.end - clip.start : Number(clip.duration_seconds)).toFixed(1)} с</div>
      <h3>{clip.title}</h3>{clip.score !== undefined && clip.components && clip.explanations ? <section aria-label="Оценка фрагмента">
        <p className="score"><strong>{clip.score}</strong><span> / 99</span></p><dl className="score-details">
          <dt>Цепкость · {clip.components.hook}/33</dt><dd>{clip.explanations.hook}</dd>
          <dt>Самодостаточность · {clip.components.completeness}/33</dt><dd>{clip.explanations.completeness}</dd>
          <dt>Длина · {clip.components.length}/33</dt><dd>{clip.explanations.length}</dd></dl></section> : <p>Без оценки</p>}
      {clip.expires_at && <p className="muted">{expired ? 'Файл больше недоступен' : `Хранится до ${new Date(clip.expires_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК`}</p>}
      <button disabled={!clip.available || downloadingId !== null} onClick={() => void download(clip.clip_id, clip.title)}>
        {downloadingId ? 'Открываем файл…' : clip.available ? '↓ Скачать клип' : expired ? 'Срок хранения истёк' : clip.status === 'failed' ? 'Не удалось собрать' : 'Собираем…'}</button>
      <button className="secondary" disabled={copying} onClick={() => void copyLink()}>
        {copying ? 'Получаем ссылку…' : 'Скопировать ссылку'}</button>
      {copyMessage && <p role="status" className="video-id">{copyMessage}</p>}
      {clip.watermarked && <ProInterest source="clip_card" />}
      {error && <p role="alert">{error}</p>}</div></article>;
}
