import { CabinetEmpty } from './CabinetEmpty';
// Итог сохранения предпросмотра при регистрации/входе (preview-flow, SC-US-003-1/2). Список ботов — фича bot-cabinet.
const NOTICES: Readonly<Record<string, string>> = {
  saved: 'Бот из предпросмотра сохранён в ваш аккаунт и включён. Сайт заново не читался. Список ботов и код установки появятся здесь в следующем обновлении кабинета.',
  expired: 'Предпросмотр истёк (он живёт 24 часа) — создайте бота заново: это займёт пару минут.',
  plan_limit: 'Бот из предпросмотра не сохранён: на бесплатном плане — один бот.',
  unavailable: 'Бот из предпросмотра сохранить не удалось — сервис временно недоступен. Откройте предпросмотр и нажмите «Сохранить» ещё раз.',
};
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ saved?: string; preview?: string }> }) {
  const query = await searchParams;
  const key = query.saved === '1' ? 'saved' : typeof query.preview === 'string' ? query.preview : '';
  const notice = NOTICES[key];
  // Сохранённый бот — не «ботов пока нет»: пустое состояние после сохранения было бы ложью (CFG-I7).
  if (key === 'saved') return <><div className="cabinet-head"><h1>Мои боты</h1></div><p role="status" className="notice">{notice}</p></>;
  return <>{notice && <p role="status" className="notice cabinet-notice">{notice}</p>}<CabinetEmpty /></>;
}
