'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearSupportIdentity, loadSupportWidget, supportRequest, type PublicSupport, type SupportAccount, type SafeContext } from '../../lib/support-client';
export function SupportPanel({ support, account, videoId }: { support: PublicSupport; account: SupportAccount; videoId?: string }) {
  const router = useRouter(), epoch = useRef(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [context, setContext] = useState<SafeContext | null>(null), [consent, setConsent] = useState(false), [identify, setIdentify] = useState(false);
  useEffect(() => {
    const cleared = () => { epoch.current++; setContext(null); setConsent(false); setIdentify(false); setMessage(''); };
    const refresh = () => { if (document.visibilityState === 'hidden') return; clearSupportIdentity(); router.refresh(); };
    window.addEventListener('n5:support-clear', cleared); window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('n5:support-clear', cleared); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); epoch.current++; clearSupportIdentity(); };
  }, [router]);
  useEffect(() => { clearSupportIdentity(); }, [account?.id, account?.verified]);
  const disabled = support.mode === 'disabled';
  async function open(identified: boolean) {
    if (busy || disabled) return; setBusy(true); setError(''); setMessage(''); const version = epoch.current;
    try {
      const widget = await loadSupportWidget(support);
      if (epoch.current !== version) return;
      if (identified) {
        const response = await supportRequest<{ mode: 'anonymous' | 'verified'; jwt?: string }>('/api/support/session', {});
        if (epoch.current !== version) return;
        if (response.mode !== 'verified' || !response.jwt) { clearSupportIdentity(); throw new Error('Для представления аккаунта нужна подтверждённая почта и действующий вход.'); }
        widget.setUser(response.jwt); setMessage('Аккаунт представлен в чате.');
      } else setMessage('Чат открыт без передачи почты аккаунта.');
      widget.show();
    } catch (cause) { clearSupportIdentity(); setError(cause instanceof Error ? cause.message : 'Чат временно недоступен.'); }
    finally { setBusy(false); }
  }
  return <section className="auth-card support-card" aria-label="Чат поддержки">
    <h2>Написать в поддержку</h2>
    {support.synthetic && <p role="status">СИНТЕТИЧЕСКИЙ СТЕНД: тестовый чат, сообщения не уходят реальной поддержке.</p>}
    {disabled ? <p role="status">Чат поддержки пока не подключён.</p> : <><p>Чат можно открыть анонимно. Почта аккаунта передаётся только по вашему отдельному согласию.</p>
      <button disabled={busy} onClick={() => void open(false)}>{busy ? 'Подождите…' : 'Открыть анонимный чат'}</button>
      {account?.verified && support.identifiedEnabled ? <><label className="support-check"><input type="checkbox" checked={identify} onChange={e => setIdentify(e.target.checked)} disabled={busy} /> Разрешаю представить мой аккаунт и почту в чате</label>
        <button className="secondary" disabled={busy || !identify} onClick={() => void open(true)}>Представить аккаунт в чате</button></> : <p>Представление аккаунта {support.identifiedEnabled ? 'доступно после входа и подтверждения почты.' : 'сейчас отключено.'}</p>}
    </>}
    {support.contactEmail ? <p>Почта поддержки: <a href={`mailto:${support.contactEmail}`}>{support.contactEmail}</a></p> : <p>Адрес поддержки пока не настроен. Можно воспользоваться восстановлением доступа ниже.</p>}
    <p className="muted">Сеанс чата у поставщика независим от КлипМейкера: срок бездействия по умолчанию — 10 часов. Выход здесь не гарантирует завершение удалённого сеанса или удаление истории.</p>
    <h3>Контекст обращения</h3><p>Сначала покажем только безопасные идентификаторы, состояние и время. Видео, расшифровка и журналы не передаются.</p>
    <button className="secondary" disabled={busy} onClick={async () => {
      setBusy(true); setError(''); setConsent(false); const version = epoch.current;
      try { const result = await supportRequest<{ context: SafeContext }>('/api/support/context', videoId ? { videoId } : {}); if (version === epoch.current) setContext(result.context); }
      catch (cause) { setContext(null); setError(cause instanceof Error ? cause.message : 'Контекст недоступен.'); } finally { setBusy(false); }
    }}>Показать контекст</button>
    {context && <><pre className="support-preview">{JSON.stringify(context, null, 2)}</pre><label className="support-check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> Разрешаю скопировать этот контекст для обращения</label>
      <button disabled={!consent || busy} onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify(context, null, 2)); setMessage('Контекст скопирован. При желании вставьте его в обращение.'); } catch { setError('Не удалось скопировать. Выделите текст контекста и скопируйте вручную после согласия.'); } }}>Скопировать контекст</button></>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}
