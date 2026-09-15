// Проверка адреса источника уведомления ЮKassa — переиспользование N1 + общего снаряжения.
// Слой unit: принадлежность адреса сети есть арифметика над числами, базы здесь не нужно.

import { describe, expect, it } from 'vitest';
import { verifyYooKassaOrigin, YOOKASSA_NETWORKS } from '../../apps/api/src/payments/origin.js';

describe('verifyYooKassaOrigin', () => {
  it('адрес внутри сети провайдера принимается', () => {
    expect(verifyYooKassaOrigin('185.71.76.5')).toEqual({ ok: true, ip: '185.71.76.5' });
    expect(verifyYooKassaOrigin('77.75.156.11')).toEqual({ ok: true, ip: '77.75.156.11' });
  });

  it('адрес со СТРОКОВО похожим префиксом, но вне маски, отвергается', () => {
    // 185.71.76.0/27 покрывает .0–.31; строковый префикс совпадает у обоих, маска — нет.
    expect(verifyYooKassaOrigin('185.71.76.100')).toEqual({ ok: false, reason: 'foreign_ip' });
  });

  it('IPv6 провайдера принимается', () => {
    expect(verifyYooKassaOrigin('2a02:5180:0:1::9').ok).toBe(true);
  });

  it('пустой, отсутствующий и неизвестный адрес — ОТКАЗ, а не «пропустим»', () => {
    for (const bad of ['', '   ', 'unknown', null, undefined]) {
      expect(verifyYooKassaOrigin(bad as string | null | undefined), JSON.stringify(bad)).toEqual({ ok: false, reason: 'no_ip' });
    }
  });

  it('произвольный чужой адрес отвергается', () => {
    for (const bad of ['1.2.3.4', '203.0.113.7', '::1', 'не-адрес', '185.71.76.0/27']) {
      expect(verifyYooKassaOrigin(bad).ok, bad).toBe(false);
    }
  });

  it('список сетей живёт В КОДЕ и непуст: пустой список читался бы как «ограничений нет»', () => {
    expect(YOOKASSA_NETWORKS.length).toBeGreaterThan(0);
  });
});
