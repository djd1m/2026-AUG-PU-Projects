'use client';

import { useState } from 'react';

export function ForgotForm() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const res = await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: data.get('email') }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'не удалось отправить письмо');
        return;
      }
      // Ответ ОДИН и для существующего адреса, и для несуществующего — здесь мы не знаем,
      // отправилось ли письмо, и знать не должны.
      setDone(true);
    } catch {
      setError('сеть недоступна, попробуйте ещё раз');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="small" role="status" style={{ marginTop: 20 }}>
        Если такой адрес зарегистрирован, письмо со ссылкой отправлено. Ссылка действует час.
        Не пришло — проверьте папку со спамом.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="form" style={{ marginTop: 20 }}>
      <label className="field">
        <span>Email</span>
        <input name="email" type="email" required autoComplete="email" className="input" />
      </label>

      {error ? <ul className="errors" role="alert"><li>{error}</li></ul> : null}

      <button type="submit" disabled={busy} className="btn btn--primary btn--block">
        {busy ? 'Отправляем…' : 'Прислать ссылку'}
      </button>
    </form>
  );
}
