// Вход и регистрация (форма foundation: POST /api/auth/login|register). Шапка — общая SiteHeader.
import { SiteHeader } from '../SiteHeader';
import { AuthForm } from './AuthForm';
import { requestTheme } from '../theme-server';
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const mode = (await searchParams).mode === 'register' ? 'register' : 'login';
  return <><SiteHeader theme={await requestTheme()} /><main className="center container"><AuthForm initialMode={mode} /></main></>;
}
