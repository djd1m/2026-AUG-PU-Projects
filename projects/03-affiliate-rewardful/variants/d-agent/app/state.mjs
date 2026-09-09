export const roles = {
  merchant: { label:'Владелец', kind:'registry', actions:['registry.prepare','registry.read'], goal:'Подготовить реестр за август', detail:'Собрать суммы и объяснить исключения. Утверждение остаётся за вами.' },
  partner: { label:'Партнёр', kind:'partner', actions:['partner.read'], goal:'Узнать статус моего вознаграждения', detail:'Получить собственный баланс, удержания и ориентир выплаты.' },
  customer: { label:'Клиент', kind:'credit', actions:['credit.read'], goal:'Проверить мой бонус подписки', detail:'Узнать доступную сумму и условия применения к следующему счёту.' },
};
export const exact = artifact => ({ artifactId:artifact.artifactId, revision:artifact.revision, hash:artifact.hash });
export function logicalTask(role, artifactId, key) {
  if (!roles[role]) throw new Error('Неизвестная роль');
  return { key, input:{ kind:roles[role].kind, input:role === 'merchant' ? { period:'2026-08', ...(artifactId ? {artifactId} : {}) } : {} } };
}
// A response belongs to both its captured request generation and selected task.
export function acceptsTask(selectedId, generation, response, capturedGeneration) {
  return generation === capturedGeneration && selectedId === response.taskId;
}
export function storedState(storage, key) {
  const raw = storage.getItem(key);
  if (!raw) return {};
  try {
    const state = JSON.parse(raw);
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error();
    return state;
  } catch { throw new Error('Локальная запись задачи повреждена. Начните новый демосеанс.'); }
}
