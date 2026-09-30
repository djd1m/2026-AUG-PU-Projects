'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LogoutButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => null);
    if (response?.ok) router.push('/login');
    else setError('Не удалось выйти. Повторите.');
  }

  return (
    <div>
      <button type="button" onClick={logout}>Выйти</button>
      {error && <p className="auth-error" role="alert">{error}</p>}
    </div>
  );
}
