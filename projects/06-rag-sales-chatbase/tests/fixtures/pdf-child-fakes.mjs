// Подменные дочерние процессы разбора PDF (фича pdf-source): режим — имя файла-ссылки не нужен, режим
// передаётся ПЕРВЫМ байтом stdin ('h' — зависнуть, 'm' — раздувать резидентную память, 'e' — вернуть
// имена переменных окружения). Самоликвидация через 25 с: убитый родителем тест не оставляет сирот.
setTimeout(() => process.exit(3), 25_000).unref();
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const mode = String.fromCharCode(Buffer.concat(chunks)[0] ?? 0);
if (mode === 'h') {
  setInterval(() => {}, 1000); // зависание: ни вывода, ни выхода
} else if (mode === 'm') {
  // Не больше 512 МБ, затем зависание: без предела памяти у родителя (мутация) тест краснеет по таймауту,
  // а не роняет машину.
  const hold = [];
  const grow = setInterval(() => {
    if (hold.length >= 16) { clearInterval(grow); setInterval(() => {}, 1000); return; }
    const b = Buffer.alloc(32 * 1024 * 1024); b.fill(1); hold.push(b);
  }, 10);
} else if (mode === 'e') {
  const names = Object.keys(process.env).join(',');
  process.stdout.write(JSON.stringify({ ok: true, numPages: 1, pages: [`env:${names}`] }) + '\n', () => process.exit(0));
} else {
  process.exit(5);
}
