# Fixed citation membership guard mutation

Production file: `packages/rag/src/citations.ts`, function `citationRefusal`.
Disable exactly this statement (one occurrence), leaving the test unchanged:

```ts
  if (out.cited_ids.some((id) => !allowed.has(id))) return 'invalid_citation';
```

Replace it temporarily with `  // Mutation: membership guard temporarily disabled.`.
From the project root execute:

```sh
/tmp/n6b-f06-node22/bin/node node_modules/vitest/vitest.mjs run --config vitest.config.ts packages/rag/tests/unit/answer-citations.test.ts -t 'citation guard rejects every ID outside the above-threshold retrieval'
```

The unchanged test submits one allowed and one foreign/below-threshold ID. Expected red assertion:
`expected null to be 'invalid_citation'`; exit 1. Restore the exact statement and rerun the same command;
expected 1 passing test, 8 skipped, exit 0. This is a semantic test of the guard, not a text/source assertion.

Actually executed locally: mutant exit 1, restored exit 0. Restoration was byte-for-byte and SHA-256 matched;
see citation-mutation.json and the two raw test outputs. This local evidence does not replace coordinator full
PostgreSQL integration, browser checks or independent review.
