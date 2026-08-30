// FR-011.3 — дверь партнёрского кабинета.
//
// Форма, а не адрес с токеном: тело POST не попадает ни в Referer, ни в историю браузера,
// ни в журналы прокси.

import { PartnerLoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default function PartnerEntryPage() {
  return (
    <main className="stage stage--narrow">
      <div className="card">
        <h1>Партнёрский кабинет</h1>
        <p className="small muted" style={{ marginTop: 8 }}>
          Введите ключ доступа, который вы получили вместе с партнёрским кодом.
          Это не сам код: код вы раздаёте аудитории, а ключ — только ваш.
        </p>
        <PartnerLoginForm />
      </div>
    </main>
  );
}
