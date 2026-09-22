import Link from 'next/link';
export default function MissingVideo() { return <section className="empty"><h1>Запись не найдена</h1><Link href="/dashboard">Вернуться к записям</Link></section>; }
