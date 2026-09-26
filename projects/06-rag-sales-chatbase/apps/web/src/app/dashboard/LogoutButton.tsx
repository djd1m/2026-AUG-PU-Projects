'use client';
// Выход: POST /api/auth/logout (foundation). Контурная кнопка — вторичное действие шапки.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return <button type="button" className="secondary" disabled={busy} onClick={async () => {
    setBusy(true);
    try { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/'); router.refresh(); } finally { setBusy(false); }
  }}>Выйти</button>;
}
