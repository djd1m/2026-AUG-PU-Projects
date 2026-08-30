// FR-015.5 — «забыли пароль».

import { ForgotForm } from './forgot-form';

export const dynamic = 'force-dynamic';

export default function ForgotPage() {
  return (
    <main className="stage stage--narrow">
      <div className="card">
        <h1>Восстановление доступа</h1>
        <p className="small muted" style={{ marginTop: 8 }}>
          Укажите адрес, которым вы регистрировались. Если он у нас есть, придёт письмо со
          ссылкой — она действует час.
        </p>
        <ForgotForm />
      </div>
    </main>
  );
}
