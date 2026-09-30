import Link from 'next/link';
import { AuthForm } from '../auth-form';

export const metadata = { title: 'Регистрация — RAG-бот для сайта' };

export default function RegisterPage() {
  return (
    <main className="auth-page">
      <h1>Регистрация</h1>
      <p>Пароль — от 10 символов. План Free, карта не нужна.</p>
      <AuthForm action="register" />
      <p>Уже есть аккаунт? <Link href="/login">Войти</Link></p>
    </main>
  );
}
