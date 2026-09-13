// Страж по исходнику AC-partner-codes-and-cabinet-17: код кабинета партнёра разрешается
// ИСКЛЮЧИТЕЛЬНО из `accountId` аутентифицированной сессии — маршрут не читает код из
// `request.query`/`request.body`/`request.params`, и `queryPartnerDashboard` не принимает
// параметра кода вовсе. Испытан внедрённым дефектом (`guard-must-be-able-to-fail.md`):
// квитанция — `05_completion.md`, «Испытание стражей».
//
// Внедряемый дефект (описан в `04_refinement.md`): заменить `partner.id` вызывающего на
// `request.query.code ?? partner.id` в обработчике маршрута — страж обязан покраснеть.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ROUTE_FILE = path.join('apps', 'api', 'src', 'routes', 'partner.ts');
const QUERY_FILE = path.join('apps', 'api', 'src', 'partner', 'dashboard-query.ts');

describe('страж AC-partner-codes-and-cabinet-17: код кабинета берётся только с сервера', () => {
  it('routes/partner.ts не читает code из query/body/params ни в каком виде', async () => {
    const code = await readFile(path.join(ROOT, ROUTE_FILE), 'utf8');
    expect(code).not.toMatch(/request\.query\.code/);
    expect(code).not.toMatch(/request\.body\.code/);
    expect(code).not.toMatch(/request\.params\.code/);
    expect(code).not.toMatch(/\.code\s*\?\?/); // форма внедряемого дефекта: `request.query.code ?? partner.id`
  });

  it('queryPartnerDashboard принимает единственный вход, разрешающий код: accountId — параметра code/partnerCodeId нет', async () => {
    const code = await readFile(path.join(ROOT, QUERY_FILE), 'utf8');
    // Сигнатура функции — `input: { accountId, window, now? }`, без поля кода.
    expect(code).toMatch(/accountId:\s*string/);
    expect(code).not.toMatch(/partnerCodeId/);
    expect(code).not.toMatch(/input\.code\b/);
  });

  it('routes/partner.ts вызывает queryPartnerDashboard только с { accountId, window }', async () => {
    const code = await readFile(path.join(ROOT, ROUTE_FILE), 'utf8');
    const call = /queryPartnerDashboard\(\s*pool\s*,\s*\{([^}]*)\}\s*\)/.exec(code);
    expect(call).not.toBeNull();
    const args = call?.[1] ?? '';
    expect(args).toMatch(/accountId/);
    expect(args).not.toMatch(/code\s*:/);
  });
});
