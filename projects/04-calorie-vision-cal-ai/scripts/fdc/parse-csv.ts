// Потоковый разбор CSV-дампов FDC (`03_architecture.md`, «Зависимости npm»): дампы —
// сотни мегабайт, читать их целиком в память значит зависеть от размера чужого файла.
// `csv-parse` выбран вместо собственного разбора: кавычки и переводы строк внутри полей —
// источник тихих ошибок у самодельного парсера.

import { createReadStream, existsSync } from 'node:fs';
import { parse } from 'csv-parse';

export async function* streamCsvRows(filePath: string): AsyncGenerator<Record<string, string>> {
  const parser = createReadStream(filePath).pipe(parse({ columns: true, relax_quotes: true, skip_empty_lines: true }));
  for await (const record of parser) {
    yield record as Record<string, string>;
  }
}

export function requireFile(directory: string, fileName: string): string {
  const path = `${directory.replace(/\/$/, '')}/${fileName}`;
  if (!existsSync(path)) {
    throw new Error(`не найден обязательный файл дампа: ${fileName} (ожидался в ${directory})`);
  }
  return path;
}
