import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <main>
      <h1>Сделайте такого для своего сайта</h1>
      <p>Бот отвечает по вашим страницам и PDF, показывает источник и честно говорит «не знаю».</p>
      <p><Link href="/register">Зарегистрироваться</Link> · <Link href="/login">Войти</Link></p>
    </main>
  );
}
