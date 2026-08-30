// FR-015.5 — «забыли пароль».

import { ForgotForm } from './forgot-form';
import { mailConfigured } from '@/lib/email';

export const dynamic = 'force-dynamic';

export default function ForgotPage() {
  return (
    <main className="stage stage--narrow">
      <div className="card">
        <h1>Восстановление доступа</h1>
        {mailConfigured() ? (
          <>
            <p className="small muted" style={{ marginTop: 8 }}>
              Укажите адрес, которым вы регистрировались. Если он у нас есть, придёт письмо
              со ссылкой — она действует час.
            </p>
            <ForgotForm />
          </>
        ) : (
          /* Форма НЕ показывается, когда письма всё равно не уйдут. Показать её значило бы
             принять у человека адрес и ответить «письмо отправлено», ничего не отправив, —
             ровно это и происходило на стенде 2026-08-30. Честный текст дешевле и точнее. */
          <p className="small" style={{ marginTop: 8 }}>
            Восстановление по почте на этом стенде пока не настроено. Если вы потеряли
            доступ, напишите нам — вернуть его можно вручную.
          </p>
        )}
      </div>
    </main>
  );
}
