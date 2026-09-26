'use client';
// Основное действие первого экрана на узком экране (R9, FIRST_SCREEN_ACTIONS для «/»): ведёт к форме входа.
// Без JS работает как якорь; с JS — прокрутка и фокус в поле почты (якорь сам фокус не ставит).
export function LandingCta() {
  return <a className="landing-cta button" href="#auth" onClick={event => {
    const field = document.getElementById('auth-email');
    if (!(field instanceof HTMLInputElement)) return;
    event.preventDefault();
    field.scrollIntoView({ block: 'center' });
    field.focus({ preventScroll: true });
    history.replaceState(null, '', '#auth');
  }}>Попробовать бесплатно</a>;
}
