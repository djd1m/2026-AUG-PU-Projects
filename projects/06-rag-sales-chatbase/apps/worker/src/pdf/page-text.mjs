// Текст страницы PDF из элементов pdfjs getTextContent (ExtractPdf п.2). Чистый модуль: вынесен из extract-child.mjs,
// который исполняется при импорте, чтобы склейку можно было проверить тестом. Сборка воркера копирует его в dist/pdf
// рядом с extract-child.mjs (apps/worker/package.json; страж — tests/extract-text-separators.test.ts).
//
// Разделитель между элементами — из ГЕОМЕТРИИ (extract-text-separators, дефект стенда 26.09): pdfjs отдаёт строку
// кусками (смена шрифта, ячейки таблицы, колонки), и склейка «как есть» слепляла соседние слова, а перевод строки
// появлялся только по hasEOL. Правило: сменилась строка (сдвиг по вертикали больше половины высоты шрифта) —
// перевод строки; на той же строке зазор больше десятой доли высоты шрифта — пробел; стык или перекрытие — без
// разделителя (кернинг внутри слова). Элемент без геометрии склеивается как прежде.

const SAME_LINE_SHARE = 0.5;   // доля высоты шрифта: вертикальный сдвиг больше — новая строка
const WORD_GAP_SHARE = 0.1;    // доля высоты шрифта: горизонтальный зазор больше — граница слов

function geometry(item) {
  const t = item.transform;
  if (!Array.isArray(t) || t.length < 6 || !t.every(Number.isFinite) || !Number.isFinite(item.width) || item.width < 0) return null;
  const size = Math.hypot(t[2], t[3]) || (Number.isFinite(item.height) ? item.height : 0);
  return size > 0 ? { x: t[4], y: t[5], width: item.width, size } : null;
}

// Регэкспы — одиночные классы символов с квантификатором, без вложенности: линейны.
export function pageText(items) {
  let text = '';
  let previous = null; // { g, eol } последнего НЕПУСТОГО элемента
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    if (item.str === '') {
      // Пустой элемент pdfjs несёт только конец строки; сам он не граница слов.
      if (item.hasEOL) { text += '\n'; if (previous) previous.eol = true; }
      continue;
    }
    const g = geometry(item);
    if (previous && !previous.eol && previous.g && g) {
      const size = Math.max(previous.g.size, g.size);
      if (Math.abs(g.y - previous.g.y) > size * SAME_LINE_SHARE) text += '\n';
      else if (g.x - (previous.g.x + previous.g.width) > size * WORD_GAP_SHARE && !/\s$/.test(text) && !/^\s/.test(item.str)) text += ' ';
    }
    text += item.str;
    if (item.hasEOL) text += '\n';
    previous = { g, eol: Boolean(item.hasEOL) };
  }
  return text.replace(/[ \t \f\v]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
