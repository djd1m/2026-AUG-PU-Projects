// Adapted from independent review's actual-component SSR reproducer.
import { expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

function render(file: string, name: string, props = {}, memberFixture: unknown[] = []) {
  const require = createRequire(import.meta.url);
  const cache = new Map<string, { exports: Record<string, React.ComponentType<object>> }>();
  function load(filename: string) {
    if (cache.has(filename)) return cache.get(filename)!.exports;
    const module = { exports: {} as Record<string, React.ComponentType<object>> }; cache.set(filename, module);
    const js = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    let state = 0;
    function localRequire(id: string): unknown {
      if (id === 'next/navigation') return { useRouter: () => ({ push() {}, refresh() {} }) };
      if (id === 'next/link') return { __esModule: true, default: ({ children, ...attributes }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement('a', attributes, children) };
      if (id === 'react' && filename.endsWith('/member-list.tsx')) return { ...React, useEffect() {},
        useState(value: unknown) { return [state++ === 0 ? memberFixture : value, () => {}]; } };
      if (id.startsWith('.')) {
        const base = path.resolve(path.dirname(filename), id);
        const target = ['.ts', '.tsx', ''].map((suffix) => base + suffix).find(existsSync);
        if (!target) throw new Error('missing_test_module');
        return load(target);
      }
      return require(id);
    }
    vm.runInThisContext('(function(require,module,exports){' + js + '\n})', { filename })(localRequire, module, module.exports);
    return module.exports;
  }
  const component = load(path.resolve('apps/web/src/components/onboarding', file))[name]!;
  return renderToStaticMarkup(React.createElement(component, props));
}
it('AC10 actual sensitive forms default to POST even without JavaScript or hydration', () => {
  for (const [file, name, props] of [
    ['login-form.tsx', 'LoginForm', {}], ['join-form.tsx', 'JoinForm', {}],
    ['invite-form.tsx', 'InviteForm', { programId: 'synthetic', canIssue: true }],
    ['policy-form.tsx', 'PolicyForm', { program: { id: 'synthetic', current_policy: null, latest_version: 0 }, onSaved: async () => {} }],
  ] as const) {
    const html = render(file, name, props);
    const forms = html.match(/<form\b[^>]*>/g) ?? [];
    expect(forms.length).toBe(1); expect(forms[0]).toContain('method="post"');
  }
});
it('AC8 owner can reactivate a suspended partner whose membership projection is revoked', () => {
  const html = render('member-list.tsx', 'MemberList', { programId: 'synthetic' }, [{
    id: 'member', role: 'partner', partner_id: 'partner', status: 'revoked', partner_status: 'suspended', scopes: ['read'],
  }]);
  expect(html).toContain('Возобновить'); expect(html).toContain('Приостановлен');
  expect(html).not.toContain('>Приостановить<');
});
it('AC11 shared draft status makes no assertion that unconsented assets exist', () => {
  const html = render('shell.tsx', 'ProgramState', { status: 'draft' });
  expect(html).toContain('черновик'); expect(html).not.toContain('уже выданы');
});
