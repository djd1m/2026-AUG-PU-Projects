// Пункт 5: выгрузка движений. Формат проверяется по тому, ЧЕМ файл открывают (русский Excel),
// а не по тому, что «это же просто CSV».
import { describe, expect, it } from 'vitest';
import { CSV_BOM, csvCell, csvDocument, exportFileName, moscowDateCell, rublesCell } from '../../apps/api/src/export/csv.js';

describe('экранирование ячеек (RFC 4180 + разделитель «;»)', () => {
  it('обычный текст не трогается', () => {
    expect(csvCell('Иван Петров')).toBe('Иван Петров');
  });
  it('разделитель, кавычка и перевод строки — в кавычки, кавычка удваивается', () => {
    expect(csvCell('ООО "Ромашка"; отдел')).toBe('"ООО ""Ромашка""; отдел"');
    expect(csvCell('строка\nвторая')).toBe('"строка\nвторая"');
  });
  it('пусто и undefined — пустая ячейка, а не «undefined» словом', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
});

describe('деньги: копейки → рубли с ЗАПЯТОЙ', () => {
  it('целые и дробные', () => {
    expect(rublesCell(47865)).toBe('478,65');
    expect(rublesCell(100000)).toBe('1000,00');
    expect(rublesCell(5)).toBe('0,05');
  });
  it('отрицательные (возвраты) сохраняют знак', () => {
    expect(rublesCell(-47865)).toBe('-478,65');
  });
  it('ИСПЫТАНИЕ: с точкой вместо запятой русский Excel считает значение текстом — формат обязан давать запятую', () => {
    expect(rublesCell(47865)).not.toContain('.');
    expect(rublesCell(47865)).toContain(',');
  });
});

describe('документ целиком', () => {
  it('начинается с BOM и разделяет строки CRLF', () => {
    const doc = csvDocument(['А', 'Б'], [['1', '2']]);
    expect(doc.startsWith(CSV_BOM)).toBe(true);
    expect(doc).toContain('\r\n');
    expect(doc).toContain('А;Б');
  });
  it('пустой список движений — заголовок всё равно есть (файл не пустой)', () => {
    const doc = csvDocument(['Дата', 'Сумма'], []);
    expect(doc.replace(CSV_BOM, '')).toBe('Дата;Сумма\r\n');
  });
});

describe('дата и имя файла', () => {
  it('дата в формате, который Excel читает как дату', () => {
    expect(moscowDateCell(new Date('2026-10-05T10:00:00Z'))).toBe('05.10.2026');
  });
  it('нечитаемая дата — пустая ячейка, а не «Invalid Date»', () => {
    expect(moscowDateCell('не дата')).toBe('');
  });
  it('в имени файла есть дата — иначе в «Загрузках» копятся одинаковые', () => {
    expect(exportFileName('tarelka-nachisleniya', new Date('2026-10-05T10:00:00Z'))).toBe('tarelka-nachisleniya-2026-10-05.csv');
  });
});
