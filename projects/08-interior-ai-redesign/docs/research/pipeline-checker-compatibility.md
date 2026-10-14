# Pipeline checker 1.13.2 compatibility receipt

The published `@dzhechkov/p-replicator@1.13.2` completion check does not reach the project completion document with this repository layout. Its project branch overwrites the basename variable `PROJECT_COMPLETION` with the already joined path `$DOCS_ROOT/$PROJECT_COMPLETION`. `process_completion_contour` then applies its documented path contract, `completion_file="$directory/$completion_target"`, and joins `DOCS_ROOT` a second time. The unchanged tool therefore reports the real file as the duplicated, unreadable path `projects/08-interior-ai-redesign/docs/projects/08-interior-ai-redesign/docs/Completion.md`. This is a tool-path failure, not a project completion PASS.

The retained compatibility patch is [scripts/pipeline-checker-completion.patch](../../scripts/pipeline-checker-completion.patch). It changes exactly two lines: the existence probe uses a new `PROJECT_COMPLETION_FILE` variable, while the call continues to pass the unchanged basename `PROJECT_COMPLETION` to `process_completion_contour`. No validator rule, feature input, contour, or installed/vendor file is changed. `pipeline-checker-compatibility-1.json` records original SHA-256 `06e3dae22c533a81732b9870ae42d6b80b6e8419b3c90e11e1910e2a46888be8`, temporary patched SHA-256 `635390797a395f63a3b40119b271a13eeb92d261dd2156af6019bc69fa1e03db`, and the exact diff.

To reproduce without modifying the installed package, set `CHECKER` to its published script and write a private temporary copy:

```sh
CHECKER=/tmp/n8-pipeline-tools/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh
patch -o /tmp/n8-pipeline-completion-fix.sh "$CHECKER" < scripts/pipeline-checker-completion.patch
chmod 700 /tmp/n8-pipeline-completion-fix.sh
/tmp/n8-pipeline-completion-fix.sh --project-root . --traceability --completion --report-revision --criterion-scenarios
```

The project uses the published three-column completion wire format, `| Criterion | Test file | Test title |`, with project-root-relative `tests/...` and `scripts/...` paths. The temporary patched run in `final-pipeline-completion-patched-2.txt` reports four explicit PASS verdicts: traceability, completion, report revision, and criterion scenarios, each over seven features with zero gaps and zero inconclusive results. Completion covers all 65 feature criteria. The project-level `Completion.md` has no AC table by design and is not treated as feature acceptance. An unmodified 1.13.2 run must continue to be reported as `NOT-ESTABLISHED` for the project completion path until the upstream variable-shadowing defect is fixed.
