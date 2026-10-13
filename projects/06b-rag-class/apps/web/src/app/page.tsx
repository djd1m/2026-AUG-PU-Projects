// Лендинг — фича badge-referral; кабинет — следующие фичи. Здесь только точка входа приложения.
import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <h1>RAG-бот для сайта</h1>
      <p>Бот отвечает по вашим страницам и PDF, показывает источник и честно говорит «не знаю».</p>
      <p><Link href="/register">Зарегистрироваться</Link> · <Link href="/login">Войти</Link></p>
    </main>
  );
}
