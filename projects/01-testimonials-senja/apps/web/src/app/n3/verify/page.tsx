'use client';
import { useEffect, useState } from 'react';
export default function VerifyEmail() {
  const [token, setToken] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    setToken(window.location.hash.slice(1)); window.history.replaceState(null, '', '/n3/verify');
  }, []);
  async function verify() {
    setBusy(true);
    try {
      const response = await fetch('/api/n3/proof', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'verify', token }) });
      const result = await response.json();
      setMessage(response.ok ? 'Почта подтверждена. Регистрация передаётся в партнёрскую программу.' : result.error);
      if (response.ok) setToken('');
    } catch { setMessage('Сеть недоступна. Повторите подтверждение.'); } finally { setBusy(false); }
  }
  return <main className="stage"><section className="card"><h1>Подтвердить почту</h1>
    <p>Откройте ссылку в браузере, в котором запрашивали письмо. Подтверждение не выполняет вход в аккаунт.</p>
    <button type="button" className="btn btn--primary" disabled={busy || !token} onClick={verify}>Подтвердить</button>
    <p role="status">{message}</p><a href="/dashboard">Вернуться к проектам</a></section></main>;
}
