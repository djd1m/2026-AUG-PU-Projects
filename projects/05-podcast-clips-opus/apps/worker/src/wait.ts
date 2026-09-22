import { loadWorkerConfig, type Environment, type ServiceRole } from '@clipmaker/shared/config';
export function startPlaceholder(role: Exclude<ServiceRole, 'web'>, env: Environment): void {
  loadWorkerConfig(role, env);
  console.info(`${role}: конфигурация проверена; обработка появится в следующей фиче`);
  const timer = setInterval(() => {}, 60_000);
  const stop = () => { clearInterval(timer); process.exitCode = 0; };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
