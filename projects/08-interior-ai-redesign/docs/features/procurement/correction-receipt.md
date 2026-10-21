# Procurement correction receipt

Run: `20261013T220722Z-procurement-5834`  
Work unit: `procurement-author-correction-1`  
Independent review: SHA-256 `411d6c1aea34c7355279afbab4baf5f3c52274e642a176ce14c4bf2f1df5f68a`  
Review probe: SHA-256 `548e51d6e22ccc9206c08e62c7e10cce9eb74eebd89b1b92c832b9b4bd5b2257`  
Original implementation receipt preserved: SHA-256 `8d666f9d445da968a31d417cb20117a6102727fd96bf01c486937f78b86ea422`  
Correction launch: `2026-10-13T23:27:44Z`  
Accepted correction snapshot: `2026-10-13T23:34:29Z`  
Measured elapsed to accepted snapshot: `405` seconds  
Terminal status: `completed`

Requested execution was the existing author route. Actual model, token usage and cost metadata remain `null` because the host supplied no counters or model identity. No delegation, paid call, provider fetch, public deployment, migration, shared manifest or root-main edit occurred. The 20-minute checkpoint and 30-minute stop were not reached.

## Finding dispositions

| Finding | Correction | Exact regression evidence |
|---|---|---|
| PR-01 | Calculator and schema parsing use local `Decimal.clone({precision:80})`; global Decimal configuration is untouched. | `PR-01 preserves the accepted positive tail before exact pack ceil` asserts literal inputs `1.000000000001`, `0.000001`, `1.000000010001` produce 2 packs and 320000 minor. |
| PR-02 | Per-line money is capped at 10^12 minor before aggregation; design objects require piece/piece products. | `PR-02 enforces the line-money boundary and piece-only object matrix` covers exact boundary, boundary+10 minor and object+m² rejection. |
| PR-03 | Calculation loads the newest deterministic owned budget history under the project lock even after current-pointer invalidation, persists it as parent, and includes reserve/limit configuration in stable delta keys. | Modified `AC-procurement-1/8/13...` asserts phase edit → recalculation parent/delta; `PR-03 records reserve-only configuration delta` asserts `config:reserve`. |
| PR-04 | Guarded line PATCH supports quantity source, shell, confirmation, base quantity, waste, phase, selection and fit under project and line CAS; preview recalculates from the complete current immutable budget inputs. | `PR-04 confirms and revises quantity through line CAS, preview and immutable recalculation history` covers unknown → confirmed, later quantity revision, preview, parent and delta. |
| PR-05 | Replacement builds and validates one complete next-line state, then clones the requested selection, retained reason, phase and quantity fields into the new draft design. | `PR-05 applies matched selection and combined line fields to the replacement draft`. |
| PR-06 | CSV rows are populated by named columns. Services, delivery and reserve use `amount_rub`; `cost_kind` is explicit; known and scenario total rows preserve immutable totals and unknown state. | `PR-06 places scope and reserve money in amount_rub and exports immutable totals`; the existing formula/newline/quote test remains green. |
| PR-07 | Known coverage must be strictly positive; source-shell ownership is checked before INSERT/UPDATE; replacement checks the 100-entry catalog cap before SQL mutation and returns 409. | `PR-07 rejects foreign shells and zero coverage before writes with typed statuses`; `PR-07 returns catalog capacity conflict before substitution SQL and preserves state`; HTTP `PR-07 maps zero coverage to 422 and foreign source shell to private 404 without mutation`. |
| PR-08 | A phase scenario subtotal remains null after its first unresolved row, independent of stable-ID ordering, while its known subtotal remains visible. | `PR-08 keeps a phase scenario unknown in either stable-id ordering`. |

The optional pure `rubToMinor(value)` export converts controlled native RUB strings with exact Decimal multiplication, accepts at most two fractional digits and rejects negative, fractional-minor and overflow inputs. `PR-UI converts native RUB input to exact minor units` covers this public seam.

## Public correction contract

`PATCH /api/projects/:projectId/lines/:lineId` keeps project `If-Match` and body `expectedLineVersion`. Its body now also accepts optional `quantitySource`, `sourceShellId`, `quantityConfirmed`, `baseQuantity`, `wastePct`, `fit`, `phase`, `selection`, `retainedReason`, `snapshotId`, and confirmed replacement via `confirmReplacement:true`. A non-replacement edit returns `{line, version, phasePreview}`. A replacement returns the new draft line/design plus `approvalRequired:true` and `recalculateRequired:true`.

CSV keeps the private export path and download headers. The corrected header adds `cost_kind`; non-product money is in `amount_rub`; rows with kinds `total_known` and `total_scenario` carry immutable totals. All cells remain quoted and formula-neutralized.

## Verification

| Check | Result |
|---|---|
| Final focused pure/PostgreSQL/HTTP suite | exit 0; 3 files, 30 tests passed; final run started `23:33:32Z`, runner duration 5.05 s |
| Lint | `npm run lint -- --quiet`, exit 0 |
| Typecheck and production build | `npm run build`, exit 0; typecheck and Next compilation/routes completed |
| Precision mutation | local precision 80 → 20 made PR-01 red: expected 2/320000, received 1/160000; exit 1; source restored before final checks |
| 200-line benchmark | 50 warm-up + 1000 measured; p95 8.333744 ms, max 21.849134 ms; 1000/1000 hashes matched |

The benchmark fixture already uses piece/piece for all object rows. Its old and new golden SHA-256 are both `68cc701bbef68ae50b85aee1eaccc0511a3e6f629ccd82f1b8dfee4bacc3108c`. Independent literal fixture arithmetic is: 100 material rows contribute 17,440,000 minor; 100 object rows use `ceil(1 × 1.08)=2` pieces and contribute 50,000,000; work plus delivery contribute 150,000. Therefore known subtotal is 67,590,000, 10% reserve is 6,759,000, scenario total is 74,349,000, unresolved count is 0 and complete is true. The measured implementation output matched each value.

New or materially extended exact test titles:

1. `PR-01 preserves the accepted positive tail before exact pack ceil`
2. `PR-02 enforces the line-money boundary and piece-only object matrix`
3. `PR-03 records reserve-only configuration delta`
4. `AC-procurement-1/8/13 commits exact revisions and reproduces old budget after mutable line changes`
5. `PR-04 confirms and revises quantity through line CAS, preview and immutable recalculation history`
6. `PR-05 applies matched selection and combined line fields to the replacement draft`
7. `PR-06 places scope and reserve money in amount_rub and exports immutable totals`
8. `PR-07 rejects foreign shells and zero coverage before writes with typed statuses`
9. `PR-07 returns catalog capacity conflict before substitution SQL and preserves state`
10. `PR-07 maps zero coverage to 422 and foreign source shell to private 404 without mutation`
11. `PR-08 keeps a phase scenario unknown in either stable-id ordering`
12. `PR-UI converts native RUB input to exact minor units`

## Changed-file manifest

Only the following original owned files changed. The new receipt excludes its own digest to avoid recursion.

| File | Before SHA-256 | Final SHA-256 |
|---|---|---|
| `packages/domain/src/procurement/calculator.ts` | `afe509685c7fc9a5d61b71e8f846b0b6ae4c0d5b42df35cf81c4e5725a3ddf9a` | `a56e8894e98ce2ba019df4f2a38e90d011fae404b2da0793af98a8078cdf43ca` |
| `packages/domain/src/procurement/schemas.ts` | `56b180f29c7aa7252942b458f55a847dba6ac42d4220e701b726a47c61c3bca7` | `17fd91137d70a529ee2df36e0c2d0ae9c3018fab79c6b41baea71473d328dbd4` |
| `packages/domain/src/procurement/csv.ts` | `99555c8a9290b9026ee19fe183d0fb87d3d9b09b151cf3aea1df1587124bbe92` | `7f0c99989be51810bb373845b25f8bda8c369edc8664a9190bac05c7c6b14904` |
| `packages/db/src/procurement/repository.ts` | `d642ce85566e4989c6668e084a5b8c6ce43df90b189f535b77fb10a2f678aeb9` | `18d28c3df683791a4305a61f74e599b9f023a20b9e5f82e12c3ce904c9602ff3` |
| `tests/procurement/calculator.test.ts` | `9019ed2008131957b8aba16e312ef9b3388b07ac566e4c96083ecba743232972` | `fa0be9ed2fd07e62d0f83061dffaa4019ab4b5a7eadf72b19ca5bb29130863b8` |
| `tests/procurement/repository.test.ts` | `981973fb574bac53829c26bedbb8d3005e97fd319192151728817de2f79330db` | `a01ea3966af88841b009ecfef283cd0d4df70f2f6b32bbefa277d7361caadbc9` |
| `tests/procurement/http.test.ts` | `a9bb747720ca0704fe8b69f7fbb8f7c1ebb71a931d344e98daad8f47318b636e` | `3cb14ef50fc3cb73b560de544cdb608474a66337cab7f2b9c2bbc040aaa4896e` |

Independent author-separated closure and root integration remain coordinator work. No commit was created.
