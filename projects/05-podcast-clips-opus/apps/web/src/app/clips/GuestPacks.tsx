'use client';
import { useState } from 'react';
import type { ClipScreen } from '../../lib/screen-contract';
import { GUEST_CONSENT_TEXT, GUEST_CONSENT_VERSION, type GuestPackSummary } from '../../lib/guest-contract';
import { rpc } from '../../lib/rpc';

export function GuestPacks({ videoId, clips, initialPacks, consentHash }: {
  videoId: string; clips: ClipScreen[]; initialPacks: GuestPackSummary[]; consentHash: string;
}) {
  const [packs, setPacks] = useState(initialPacks), [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState(''), [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const update = (p: GuestPackSummary) => setPacks(old => [{ ...p, url: new URL(p.url, window.location.origin).href }, ...old.filter(v => v.guest_pack_id !== p.guest_pack_id)]);
  async function action(work: () => Promise<void>) {
    setBusy(true); setMessage('');
    try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось выполнить действие'); }
    finally { setBusy(false); }
  }
  async function create() {
    const pack = await rpc<GuestPackSummary>('guest.create', { video_id: videoId, clip_ids: selected, guest_name: name,
      consent_confirmed: consent, consent_version: GUEST_CONSENT_VERSION, consent_text_hash: consentHash }, true);
    update(pack); setSelected([]); setConsent(false);
    setMessage('Пакет создан. Нажмите «Отправить гостю», чтобы включить ссылку на 14 дней.');
  }
  async function send(pack: GuestPackSummary) {
    const sent = await rpc<GuestPackSummary>('guest.send', { guest_pack_id: pack.guest_pack_id, channel: 'copy' }, true);
    update(sent);
    try { await navigator.clipboard.writeText(new URL(sent.url, window.location.origin).href); setMessage('Ссылка скопирована. Отправьте её гостю.'); }
    catch { setMessage('Ссылка включена. Скопируйте её из поля пакета и отправьте гостю.'); }
  }
  return <section aria-labelledby="guest-title" style={{ marginTop: 32 }}>
    <h2 id="guest-title">Клипы для гостя</h2><p>Отметьте моменты с участием гостя. Разрешение на публикацию нужно получить заранее.</p>
    <form onSubmit={event => { event.preventDefault(); void action(create); }}>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
        <label>Имя гостя <input value={name} maxLength={100} required onChange={e => setName(e.target.value)} /></label>
        {clips.filter(c => c.available).map(c => <label key={c.clip_id} className="check">
          <input type="checkbox" checked={selected.includes(c.clip_id)} onChange={e => setSelected(old => e.target.checked ? [...old, c.clip_id] : old.filter(id => id !== c.clip_id))} /> {c.title}
        </label>)}
        {!clips.some(c => c.available) && <p>Для пакета нужны готовые клипы с действующим сроком хранения.</p>}
        <label className="check"><input type="checkbox" checked={consent} required onChange={e => setConsent(e.target.checked)} /> {GUEST_CONSENT_TEXT}</label>
        <button disabled={!consent || !selected.length || !name.trim()}>Создать пакет</button>
      </fieldset>
    </form>
    {message && <p role="status">{message}</p>}
    {packs.map(pack => <article key={pack.guest_pack_id} style={{ marginTop: 20, padding: 16, border: '1px solid #ced6cb', borderRadius: 12 }}>
      <h3>{pack.guest_name}</h3>
      <p>{pack.revoked_at ? 'Пакет отозван' : pack.expires_at ? `Ссылка действует до ${new Date(pack.expires_at).toLocaleString('ru-RU')}` : 'Ещё не отправлен. Ссылка закрыта.'}</p>
      {!pack.revoked_at && <>
        {pack.sent_at ? <label>Ссылка для гостя <input aria-label={`Ссылка для ${pack.guest_name}`} readOnly style={{ width: '100%' }}
          value={pack.url} onFocus={e => e.currentTarget.select()} /></label>
          : <button disabled={busy} onClick={() => void action(() => send(pack))}>Отправить гостю</button>}
        <p>Файлы доступны по сроку хранения клипов; отзыв закрывает гостевой доступ к ним.</p>
        <button className="secondary" disabled={busy} onClick={() => void action(async () => {
          const result = await rpc<{ revoked_at: string }>('guest.revoke', { guest_pack_id: pack.guest_pack_id }, true);
          update({ ...pack, ...result }); setMessage('Пакет отозван. Гостевая страница и файлы закрыты.');
        })}>Отозвать пакет</button>
      </>}
    </article>)}
  </section>;
}
