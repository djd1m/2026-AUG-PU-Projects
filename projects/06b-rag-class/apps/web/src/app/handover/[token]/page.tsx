import { HandoverForm } from './handover-form';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = { title: 'Принять аккаунт — RAG-бот для сайта', robots: { index: false, follow: false } };
export default async function HandoverPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <main><h1>Принять аккаунт</h1>
    <p>Вы получите отдельный аккаунт с ботами и источниками. Код вставки на сайте сохранится.</p>
    <p>Если у вас уже есть аккаунт N6b, укажите другой e-mail. Ссылка действует 7 дней и используется один раз.</p>
    <HandoverForm token={token} />
  </main>;
}
