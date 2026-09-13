// Локальная (НЕ авторитетная) подсказка о решении согласия — для ОДНОГО отображения: экран дня
// показывает явное «согласия нет» вместо пустого списка (задача N4, пункт 4). Источник истины —
// сервер (`consent` таблица), и КАЖДАЯ запись/удаление дневника уже защищена им независимо от
// этой подсказки (`enforce-before-diary-write.ts`) — `localStorage` здесь ничего не открывает и
// ничего не запрещает, только выбирает, какой ТЕКСТ показать. GET /api/v1/diary не сообщает
// статус согласия (маршрут 4 канона его не проверяет вовсе, пустой список неотличим от «никогда
// не спрашивали»), а отдельного маршрута статуса согласия в каноне нет — задача прямо запрещает
// вводить новые серверные маршруты, так что честная альтернатива — ТОЛЬКО признать это суждение
// клиента неавторитетным и не выдавать его за факт с сервера.
//
// Значение живёт ТОЛЬКО в этом браузере: другое устройство того же владельца ничего о нём не
// знает и покажет дневник как обычно — это узкий, названный предел подсказки, не дефект.

const KEY = 'n4_consent_status';

export type LocalConsentStatus = 'granted' | 'declined' | 'unknown';

function hasLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    // Приватный режим некоторых браузеров бросает при самом обращении к `localStorage`.
    return false;
  }
}

export function readLocalConsentStatus(): LocalConsentStatus {
  if (!hasLocalStorage()) return 'unknown';
  try {
    const value = window.localStorage.getItem(KEY);
    return value === 'granted' || value === 'declined' ? value : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function writeLocalConsentStatus(status: 'granted' | 'declined'): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(KEY, status);
  } catch {
    // Недоступность хранилища не должна ронять переход после решения — подсказка необязательна.
  }
}
