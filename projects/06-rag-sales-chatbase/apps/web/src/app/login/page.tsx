// Вход и регистрация (форма foundation: POST /api/auth/login|register). Шапка — общая SiteHeader.
import { SiteHeader } from '../SiteHeader';
import { AuthForm } from './AuthForm';
import { requestTheme } from '../theme-server';
import { safeNextPath } from '../../lib/payment-return';
// next — только оформление платного плана (tariffs-and-interest AC-14): любой другой адрес игнорируется, открытого редиректа нет.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string; next?: string }> }) {
  const params = await searchParams;
  const mode = params.mode === 'register' ? 'register' : 'login';
  return <><SiteHeader theme={await requestTheme()} /><main className="center container"><AuthForm initialMode={mode} next={safeNextPath(params.next)} /></main></>;
}
