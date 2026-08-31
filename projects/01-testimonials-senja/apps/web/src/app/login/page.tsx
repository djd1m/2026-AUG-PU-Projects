// GET /login — FR-009.3.
//
// Вёрстка — классами дизайн-системы из globals.css (stage, card, field, input, btn),
// теми же, что на главной. Сырые утилиты со ссылками на переменные здесь были ошибкой:
// половина имён не совпала с реальными токенами (--border вместо --line), поля остались
// без границ, и страница выглядела чужой на своём же сайте.

import type { Metadata } from 'next';
import { LoginForm } from './login-form';
import { ssoConfigured } from '@/lib/sso';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Вход — Proofwall',
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ next?: string; sso?: string }> };

/**
 * Тексты отказов входа через Яндекс.
 *
 * Главный здесь — password_account_exists. Он объясняет ПОЧЕМУ отказано и что делать
 * дальше: без объяснения человек читает отказ как поломку сайта. Формулировка намеренно
 * не говорит «учётка с такой почтой существует» в лоб — это подтверждало бы наличие
 * учётной записи любому, кто вписал чужой адрес в свой яндексовый профиль. Она говорит о
 * ДЕЙСТВИИ («войдите паролем»), которое имеет смысл ровно для владельца.
 */
const SSO_MESSAGES: Record<string, string> = {
  // ЧЕСТНО про то, чего НЕТ. Первая редакция звала «привязать в настройках» — страницы
  // настроек в приложении не существует, привязка к существующей учётке не реализована
  // (FR-016 вынес её из объёма). Сообщение отправляло человека искать несуществующее.
  // Тот же класс, что обещание письма на /forgot при ненастроенной почте: интерфейс
  // обещает действие, которого не построено. Поймано владельцем на живом стенде.
  password_account_exists:
    'Для этой почты уже есть вход по паролю — войдите им. Привязать Яндекс к существующей учётке пока нельзя, это отдельная работа; сейчас вход через Яндекс годится только для новой почты.',
  invalid_state: 'Попытка входа устарела. Нажмите «Войти через Яндекс» ещё раз.',
  provider_unavailable: 'Яндекс сейчас не отвечает. Попробуйте позже или войдите паролем.',
  no_email: 'Яндекс не передал адрес почты. Проверьте, что доступ к почте разрешён.',
  too_many: 'Слишком много попыток. Попробуйте позже.',
  not_configured: 'Вход через Яндекс на этом стенде не настроен.',
};

export default async function LoginPage({ searchParams }: Props) {
  const { next, sso } = await searchParams;
  // 'cancelled' сообщения не имеет намеренно: человек сам нажал «Отказать», и говорить
  // ему об этом — шум.
  const ssoMessage = sso && sso !== 'cancelled' ? SSO_MESSAGES[sso] : undefined;
  const yandexAvailable = ssoConfigured();

  return (
    <main className="stage stage--narrow">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">◆</span>
        Proofwall
      </div>

      <div className="card">
        <h1 className="hero__formTitle">Вход</h1>
        <p className="small muted" style={{ marginTop: 4 }}>
          Почта и пароль, указанные при создании проекта.
        </p>

        {ssoMessage ? (
          <p
            className="small"
            role="status"
            style={{ marginTop: 12, color: 'var(--danger, #b00020)' }}
          >
            {ssoMessage}
          </p>
        ) : null}

        <LoginForm next={next} />

        {yandexAvailable ? (
          <>
            <p className="small muted" style={{ marginTop: 20, textAlign: 'center' }}>
              или
            </p>
            {/* Обычная ссылка, а не форма: маршрут start отвечает редиректом на страницу
                согласия, тела запроса у него нет. */}
            <a
              className="btn btn--ghost"
              href="/api/auth/yandex/start"
              style={{ display: 'block', textAlign: 'center', marginTop: 8 }}
            >
              Войти через Яндекс
            </a>
          </>
        ) : null}

        <p className="small muted" style={{ marginTop: 20 }}>
          Ещё нет проекта? <a href="/">Создать</a> — это займёт минуту.
        </p>
      </div>
    </main>
  );
}
