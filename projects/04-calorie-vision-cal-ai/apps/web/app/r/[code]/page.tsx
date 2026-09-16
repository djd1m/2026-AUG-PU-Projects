'use client';

// `/r/{code}` — вход по ссылке блогера. То, что он публикует в своём канале.
//
// Чего здесь НЕТ и почему: ни формы, ни кнопки «применить». Посетитель пришёл по ссылке —
// значит решение уже принято, и просить его нажать ещё раз значит терять людей на ровном
// месте. Код применяется сразу, экран показывает исход и ведёт к съёмке.
//
// Источник — `deeplink`, СЛАБЫЙ (ADR-008): первая ссылка выигрывает у второй, а код, введённый
// руками на экране Pro, выигрывает у обеих. Объявлять себя `explicit` эта страница НЕ имеет
// права — иначе вторая ссылка молча перебивала бы первую, и блогеры воровали бы друг у друга
// уже приведённых людей.
//
// Экран НИКОГДА не показывает пустоту: у применения кода есть четыре исхода, и у каждого свой
// текст (`messageFor`) — «ничего не произошло» здесь означало бы потерянного посетителя.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { applyCode, isValidCodeFormat, messageFor, normalizeCode, type ApplyCodeOutcome } from '../../partner/apply-code-request';

type State = { readonly kind: 'applying' } | { readonly kind: 'done'; readonly outcome: ApplyCodeOutcome };

export default function PartnerLinkPage(): React.JSX.Element {
  const params = useParams<{ code: string }>();
  const raw = typeof params?.code === 'string' ? params.code : '';
  const code = normalizeCode(decodeURIComponent(raw));
  const [state, setState] = useState<State>({ kind: 'applying' });

  useEffect(() => {
    void (async () => {
      setState({ kind: 'done', outcome: await applyCode(code, 'deeplink') });
    })();
  }, [code]);

  const applied = state.kind === 'done' && state.outcome.kind === 'applied';

  return (
    <main className="page">
      <h1>Тарелка</h1>
      <section className="card">
        {state.kind === 'applying' ? (
          <p className="muted">Проверяем код {isValidCodeFormat(code) ? code : ''}…</p>
        ) : (
          <>
            <p>{messageFor(state.outcome, code)}</p>
            <p className="muted">
              Сфотографируйте тарелку — получите состав, калории и БЖУ из открытой базы USDA с
              указанием источника каждого числа. Первые 20 снимков в день бесплатны, регистрация
              не нужна.
            </p>
          </>
        )}
      </section>
      <a className="btn btn--primary btn--wide" href="/">
        {applied ? 'Начать — сфотографировать еду' : 'Всё равно попробовать'}
      </a>
      {applied ? (
        <a className="btn btn--ghost btn--wide" href="/pro">
          Что даёт подписка
        </a>
      ) : null}
    </main>
  );
}
