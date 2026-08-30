// FR-015.5 — «задать новый пароль».
//
// Токен приходит query-параметром и передаётся форме. Сессию эта страница НЕ получает:
// после успеха человек идёт на форму входа и входит новым паролем.

import { ResetForm } from './reset-form';

export const dynamic = 'force-dynamic';

export default async function ResetPage(
  { searchParams }: { searchParams: Promise<{ token?: string }> },
) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <main className="stage stage--narrow">
        <div className="card">
          <h1>Ссылка неполная</h1>
          <p className="small muted" style={{ marginTop: 8 }}>
            В адресе нет ключа. Откройте ссылку из письма целиком или{' '}
            <a href="/forgot">запросите новую</a>.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="stage stage--narrow">
      <div className="card">
        <h1>Новый пароль</h1>
        <p className="small muted" style={{ marginTop: 8 }}>
          После сохранения все устройства выйдут из аккаунта — это защищает, если доступом
          пользовался кто-то ещё.
        </p>
        <ResetForm token={token} />
      </div>
    </main>
  );
}
