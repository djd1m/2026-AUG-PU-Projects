// ValidateModelAnswer (ADR-003 Confirmation, Refinement «8 форм мусорного ответа модели», SC-US-006-4):
// всё, что не «answered + текст + цитаты только из выданных меток», — unknown.
import { describe, expect, it } from 'vitest';
import { ANSWER_TEXT_MAX_CHARS, validateModelAnswer } from '../packages/rag/src/index';

const LABELS = ['F1', 'F2', 'F3', 'F4'];
const FOREIGN_UUID = '3f1c2b1a-0000-4000-8000-00000000abcd';

describe('ValidateModelAnswer: мусор и выдумка → unknown', () => {
  const garbage: Array<[string, unknown]> = [
    ['не JSON (строка)', 'Доставка бесплатная!'],
    ['null', null],
    ['undefined', undefined],
    ['массив', [{ status: 'answered', text: 'x', citations: ['F1'] }]],
    ['нет status', { text: 'Доставка 350 ₽', citations: ['F1'] }],
    ['status не строка', { status: 1, text: 'x', citations: ['F1'] }],
    ['неизвестный status', { status: 'ANSWERED', text: 'x', citations: ['F1'] }],
    ['not_found', { status: 'not_found', text: 'Не знаю', citations: [] }],
    ['пустые цитаты', { status: 'answered', text: 'Скидка 90 %', citations: [] }],
    ['цитат нет вовсе', { status: 'answered', text: 'Скидка 90 %' }],
    ['цитаты не массив', { status: 'answered', text: 'x', citations: 'F1' }],
    ['F9 вне контекста', { status: 'answered', text: 'x', citations: ['F9'] }],
    ['своя и чужая метка', { status: 'answered', text: 'x', citations: ['F1', 'F9'] }],
    ['выдуманный id (UUID чужого фрагмента)', { status: 'answered', text: 'x', citations: [FOREIGN_UUID] }],
    ['метка с пробелом', { status: 'answered', text: 'x', citations: ['F1 '] }],
    ['метка в нижнем регистре', { status: 'answered', text: 'x', citations: ['f1'] }],
    ['метка не строка', { status: 'answered', text: 'x', citations: [1] }],
    ['пустой текст', { status: 'answered', text: '   ', citations: ['F1'] }],
    ['текст не строка', { status: 'answered', text: null, citations: ['F1'] }],
  ];
  it.each(garbage)('%s → unknown', (_name, raw) => {
    expect(validateModelAnswer(raw, LABELS).status).toBe('unknown');
  });
  it('цитата F9 называется чужой, а не «нет цитат»', () => {
    expect(validateModelAnswer({ status: 'answered', text: 'x', citations: ['F9'] }, LABELS)).toEqual({ status: 'unknown', why: 'foreign_citation' });
    expect(validateModelAnswer({ status: 'answered', text: 'x', citations: [] }, LABELS)).toEqual({ status: 'unknown', why: 'no_citations' });
  });
  it('метки только выданного контекста: при k = 2 метка F3 чужая', () => {
    expect(validateModelAnswer({ status: 'answered', text: 'x', citations: ['F3'] }, ['F1', 'F2']).status).toBe('unknown');
  });
});

describe('ValidateModelAnswer: верный ответ', () => {
  it('answered с цитатами из контекста проходит; дубли меток схлопываются', () => {
    expect(validateModelAnswer({ status: 'answered', text: ' Доставка от 350 ₽. ', citations: ['F2', 'F1', 'F2'] }, LABELS))
      .toEqual({ status: 'answered', text: 'Доставка от 350 ₽.', citations: ['F2', 'F1'] });
  });
  it('текст обрезается до 1200 символов (кодовых точек), суррогаты целы', () => {
    const r = validateModelAnswer({ status: 'answered', text: '😀'.repeat(5000), citations: ['F1'] }, LABELS);
    expect(r.status).toBe('answered');
    if (r.status !== 'answered') return;
    expect(Array.from(r.text)).toHaveLength(ANSWER_TEXT_MAX_CHARS);
    expect(r.text).toBe('😀'.repeat(ANSWER_TEXT_MAX_CHARS));
  });
});
