// Consumed by the existing source-isolated mutation runner; no second mutation engine.
export const onboardingExperiments = [
  { name: 'http-in-flight-bound', file: 'apps/web/src/lib/http/admission.ts',
    from: 'HTTP_IN_FLIGHT = 16', to: 'HTTP_IN_FLIGHT = 17', test: 'apps/web/tests/onboarding-http.test.ts' },
  { name: 'csrf-context-binding', file: 'apps/web/src/lib/http/csrf.ts',
    from: ".update(binding).update(':')", to: ".update('unbound').update(':')", test: 'apps/web/tests/onboarding-http.test.ts' },
  { name: 'csrf-exact-origin', file: 'apps/web/src/lib/http/csrf.ts',
    from: "request.headers.get('origin') !== origin || !binding", to: '!binding', test: 'apps/web/tests/onboarding-http.test.ts' },
  { name: 'http-body-actual-bytes', file: 'apps/web/src/lib/http/body.ts',
    from: 'if (total > max)', to: 'if (false)', test: 'apps/web/tests/onboarding-http.test.ts' },
  { name: 'forwarding-header-bypass', file: 'apps/web/src/lib/http/handler.ts',
    from: 'await runtime.admission.source();', to: "if (!request.headers.has('x-forwarded-for')) await runtime.admission.source();", test: 'apps/web/tests/onboarding-http-routes.test.ts' },
];
