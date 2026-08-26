// tests/setup.ts
//
// jsdom не реализует `navigator.sendBeacon` — минимальный стаб, достаточный для проверки того,
// что src/api.ts вызывает его с ожидаемыми аргументами (badge-click тесты). Не имитирует реальную
// сетевую отправку — это не задача unit-уровня этого пакета.
if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon !== 'function') {
  Object.defineProperty(navigator, 'sendBeacon', {
    value: () => true,
    writable: true,
    configurable: true,
  });
}
