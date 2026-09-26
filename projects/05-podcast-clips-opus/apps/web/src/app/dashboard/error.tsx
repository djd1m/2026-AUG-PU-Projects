'use client';
export default function DashboardError({ reset }: { reset: () => void }) {
  return <section className="status-panel failure" role="alert"><h2>Не удалось загрузить данные</h2>
    <p>Проверьте соединение и повторите запрос.</p><button onClick={reset}>Повторить</button></section>;
}
