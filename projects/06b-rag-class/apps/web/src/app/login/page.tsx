import Link from 'next/link';
import { AuthForm } from '../auth-form';

export const metadata = { title: 'Вход — RAG-бот для сайта' };

export default function LoginPage() {
  return (
    <main className="auth-page">
      <h1>Вход</h1>
      <AuthForm action="login" />
      <p>Нет аккаунта? <Link href="/register">Зарегистрироваться</Link></p>
    </main>
  );
}
