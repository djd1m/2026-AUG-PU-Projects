# N5 thin runtime packaging: measured read-only result

RUN_ID: 20261028-n5-cloudru-s3-live
WORK_UNIT_ID: runtime-packaging-plan
Source: cc6e66e57bd47e7a403612a4964dae059da66195
Launch reference: 60cc87b7a6cd9ca99fecc21bc67f0fb048190fa0aeac8bd1962f88a7fa7217f5 (parent-supplied original planner launch; no new launch digest provided)
Started-At: 2026-10-28T06:55:05Z (first observed inspection time; not claimed exact agent start)
Finished-At: 2026-10-28T07:01:01.148680+00:00
Requested model/effort: Sol/high; actual model/effort/usage/cost null: host metadata/counters unavailable.

Conclusion: source-bound copy payload fits far below1GiB: **42405254 bytes for four candidate app images combined**. This is measured payload, not measured Docker build high-water. No image/container was built, started or changed. Minimal reproducible thin candidate is feasible using exact current image bases and only the listed JS/runtime files; root must still verify actual candidate packaging/startup before rollout. Current measured filesystem availability2994659328 bytes, floor2147483648, headroom847175680 bytes. Image build temporary space/backup/render size remain a separate operational gate.

## Exact immutable bases and dependencies

- web: `sha256:7b89eb3a496a3f4ebd33e2dc5ec18dc224e63a133c7cb8e684e918f53c6903b3`
- worker-stt: `sha256:17c1c29d64804adfaa6bebb1a5fb8cac6c368cce9c73aa1622947e770655befa`
- worker-llm: `sha256:d7585e22f9732520da2fdbc380807edb21557290c85a10e61164cc00ee10fa13`
- worker-video: `sha256:a7bffb36c95063b96163d570d2c9872818534b0b524e86b500c891d8b5d14174`

Targeted read-only docker exec inspected package.json names/versions and resolution only; no env or secret content. Recursive inventory includes **94 packages per app container**, five workspace packages and89 third-party entries including one nested entry. Every third-party entry's exact lock path/version matches current accepted package-lock.json; mismatch0, unknown-path0 in all four containers. Earlier top-level count was88 third-party entries; recursive count89 supersedes it.

Inventories: /tmp/n5-runtime-web-packages-20261028.json, /tmp/n5-runtime-worker-stt-packages-20261028.json, /tmp/n5-runtime-worker-llm-packages-20261028.json, /tmp/n5-runtime-worker-video-packages-20261028.json. Version matching does not prove identical installed file contents or archive integrity; this is disclosed, not called a full supply-chain attestation.

Web+STT directly confirmed missing @grpc/grpc-js, @grpc/proto-loader and nodemailer. Existing bcrypt, next and @aws-sdk/client-s3 resolve successfully. Node v22.22.3, linux/x64, modules ABI127 observed in web+STT. Keep all existing native bcrypt/sharp/SWC/msgpackr/existing native dependencies from their exact base; copy **zero host native binaries**. Native load is not yet tested in a candidate. Workers have18 source asset files each; all18 hashes match current accepted apps/worker/assets in all three live containers. Therefore **copy no worker assets** (54008356 bytes reused, not additional delta).

## Concrete source-bound manifest

Manifest: /tmp/n5-runtime-packaging-manifest-20261028.json
Manifest SHA256: 9656b631414affacf4597e848a543d4393695115f5206c59c0514cf0737e6450
Accepted lock SHA256: a8f74dbe5391a4ede63cb181188fd3ff37ee81dca39f5dc6045999462a244cfd
The manifest contains1777 individually SHA256-bound regular files, source→absolute image destination mappings, groups, closure names, immutable bases and byte totals. It rejects symlinks within selected source trees. It is a concrete pre-build content snapshot; changes require regeneration/review. BUILD_ID observed: 1fd6AEs1ou568VDuf1v9u. Git source stayed cc6e66e57; only parent telemetry directory was untracked, outside copied allowlist.

| Candidate | Files | Exact copied payload | File-header/padded tar estimate* |
|---|---:|---:|---:|
| web | 550 | 12083816 | 12519936 |
| each worker | 1336 | 10107146 | 11153920 |
| web+3workers | 4558 | 42405254 | 45981696 |

*Tar count includes one512-byte file header per regular file and512-byte file data padding plus1024 end bytes; directory/PAX headers and Docker metadata are not measured, so this is not a complete exact tar size. Payload bytes are measured exactly. All unique manifest content is21912947 bytes; copying staging content, four image layers and several small metadata layers should be well below available847MB, but actual engine high-water is unmeasured. Root should use a hard disk floor check before/after each bounded build and avoid parallel builds.

Common copy: root package.json; four packages/{shared,db,s3,queue} package.json+dist (including JSON assets); all24 db migration files (33659 bytes, hash-bound). This is the current full migration directory, not a hardcoded “23 files” assumption. No source/tests/docs/.env/cache outside .next or whole monorepo COPY. Web: full existing built .next7161132 bytes (includes preflight), public2890067 bytes, apps/web/package.json, nodemailer10.2.1 (1753946 bytes). Worker: compiled apps/worker/dist204186 bytes **mapped to /app/dist/apps/worker** plus apps/worker/package.json, gRPC closure. Shared dist102355, db117281, S316650, queue5543 bytes. Web .next contains absolute original-build paths as Next client-reference identity strings and required-server-files metadata; these are not automatically filesystem imports. Candidate Next rendering/browser test remains mandatory; do not rewrite compiled files speculatively.

The complete declared dependency closure is34 packages, all pure JS/data/type declarations; 11378382 bytes. This is deliberately complete declared closure, not an unsafe runtime-only tree shake. Main @grpc/grpc-js1.14.6, @grpc/proto-loader0.8.1, protobufjs7.6.6 and their transitive JS dependencies come from /tmp/n5-yandex-speechkit-probe-20261027/node_modules. Nodemailer10.2.1 comes from /tmp/n5-support-backend-20261028/projects/05-podcast-clips-opus/node_modules/nodemailer. Probe @types/node26.6.5 and undici-types8.9.0 do NOT match accepted lock; manifest correctly substitutes current accepted workspace donors @types/node22.20.4 and undici-types6.21.0. Every selected package version now equals main lock. Closure donor scan found no .node/.so/.a/.dll/.exe or binding.gyp files. Full installed file hashes are bound in manifest; npm tarball integrity was not re-downloaded or independently revalidated.

Exact closure names: @grpc/grpc-js, @grpc/proto-loader, lodash.camelcase, long, protobufjs, @protobufjs/aspromise, @protobufjs/base64, @protobufjs/codegen, @protobufjs/eventemitter, @protobufjs/fetch, @protobufjs/float, @protobufjs/path, @protobufjs/pool, @protobufjs/utf8, @types/node, undici-types, yargs, cliui, string-width, emoji-regex, is-fullwidth-code-point, strip-ansi, ansi-regex, wrap-ansi, ansi-styles, color-convert, color-name, escalade, get-caller-file, require-directory, y18n, yargs-parser, @js-sdsl/ordered-map, nodemailer.

## Root execution recipe (data only)

1. Stage only manifest-selected regular files under a new private context, recreate package directory layout under /app/node_modules (dereference donor root symlinks; manifest files themselves are regular), and rehash against manifest. Do not copy workspace symlinks from host: existing base @clipmaker links remain, and /app/packages is updated in place. No npm install, network, FROM tag resolution or COPY entire repo.
2. Create four tiny Dockerfiles, each FROM its exact local image ID; root can safely tag these exact IDs locally and verify tag→ID if builder requires a tag. No `--pull`, base fetch or shared cleanup. For web replace /app/apps/web/.next and /app/apps/web/public; for workers replace /app/dist/apps/worker; replace four package dist directories. Remove old compiled directories in candidate filesystem before COPY so obsolete routes/modules cannot survive merged trees. These operations occur only in candidate build context/image, never in running containers.
3. COPY each candidate's manifest subset to exact destinations. Keep original CMD/WORKDIR/OS/native modules/assets. Web includes nodemailer only; worker includes full grpc closure only. In all candidates update common packages+migrations+manifests. Worker base IDs are distinct; do not assume identical images or rebuild a shared FROM without identity verification. Build sequentially with no RUN package-manager/install/network operation, hard disk floor checks, immutable source label cc6e66e57 and manifest hash label. Root still requires applicable start/port readiness before any container test/start.
4. Before production replacement, use candidate isolated runtime packaging verification: resolve new deps from actual deployed entrypoint directories, require compiled db/S3/shared/queue and gRPC protocol without starting workers or paid calls; native bcrypt hash/compare and ffmpeg/ffprobe/OpenCV capabilities remain actual-image checks. Confirm migration assets and preflight path, Next startup/representative page rendering, fonts/music/protocol assets, source labels and image IDs. No paid call is needed for packaging. Existing source tests/build do not substitute for these checks.
5. After root's separate S3/CORS, backup, migration, permissions and rollout gates, carry exact candidate image IDs into app-only compose override and resume current-server actual browser journey. Current bucket HEAD200 is only reachability and CORS absent is still a separate real browser blocker. New source has logout UI while old production lacks it; candidate browser test must verify signout then sign-in. No new account/credit/support/payment operation is authorized by packaging work alone.

Remaining evidence gaps: Docker build high-water and actual resultant layer size; candidate image module/native/media capability checks; actual Next rendering given recorded build path identities; cryptographic upstream archive integrity of installed donor files. These are specific next gates; measured small content delta removes the earlier assumption that a full npm/Next rebuild is necessary. Root continues immediately; ending this bounded read-only step does not end or pause parent task.

Verdict: completed read-only packaging plan and concrete hashed manifest; **candidate runtime/deployment not yet accepted**.
Status: completed
