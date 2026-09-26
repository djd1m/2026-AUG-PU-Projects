// Заглушка next/navigation для ГИДРАЦИИ настоящих клиентских компонентов вне Next (tests/browser/partners.test.ts):
// переход не выполняется, а записывается в window.__nav — тест проверяет, КУДА форма ушла бы.
type NavWindow = Window & { __nav?: string[] };
export function useRouter() {
  const nav = () => ((window as NavWindow).__nav ??= []);
  return { push: (url: string) => { nav().push(url); }, replace: (url: string) => { nav().push(url); }, refresh: () => {} };
}
