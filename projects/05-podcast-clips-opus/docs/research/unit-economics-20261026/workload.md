# N5 workload and VM sizing audit — 2026-10-26

Read-only, bounded research; no application/configuration/quota/deployment changes, no model calls, no billing claims. Source revision `732df4cccca8cd03bdaa51eaafe49adac23f01ee`; source-file SHA-256 manifest is `workload-sources.json`. Current worktree source and deployed image identity are separate evidence; byte equality of running code and worktree was not established. All GB below are decimal unless GiB is explicit.

## Decision for the economic model

| Deployment | vCPU | RAM | SSD | Interpretation |
|---|---:|---:|---:|---|
| Practical minimum, one VM | 4 | 8 GiB | 80 GB | Suitable starting envelope for low traffic and controlled 1080p jobs; render stays serial. Conditional engineering estimate, not a proven p95/capacity guarantee. |
| Preferred one VM | 8 | 16 GiB | 120 GB | More headroom for render plus two STT jobs, web/DB/Redis and effects; simplest operations. This is the recommended baseline to price. |
| Split app + worker | 2 + 4 | 4 + 8 GiB | 40 + 80 GB | App/DB/Redis on app VM; STT/select/render on worker. Total6vCPU/12GiB/120GB. Isolates UI/DB from CPU pressure; higher fixed VM/backup/network overhead. Worker4/8 remains an estimate. |

No GPU is required for externally hosted STT/LLM (including the proposed Cloud FM topology). Repository currently uses OpenRouter, not Cloud FM: that migration's API/model compatibility and cost are outside this source audit. The small local YuNet face detector runs on CPU. A 2vCPU/4GiB all-in-one machine is not a defensible production minimum for this workload without a measured constrained test.

These VM sizes assume originals and finished media live in object storage, not persistent VM SSD, no MinIO cohosting, prebuilt images (do not compile on the minimum production VM), bounded logs and backups off-VM. They do not establish user count or jobs/day. No new infrastructure spend is authorized by this recommendation.

## What was actually measured

Historical long recording on2026-09-23:5305.9s (88.43min), about252MB, 30STT chunks,7clips of41–68s (sum386s). STT468s; selection106s; sequential render185s; total ACTIVE stage work759s=12:39, about8.58active minutes/input hour. Clock timestamps21:08:13..21:28:09 span1196s=19:56, including a437s gap between STT and selection. Do not label12:39 measured upload-to-result latency. It is one unloaded-machine observation; p95 is not measured. The hardware/CPU/RAM peak was not recorded. Later face/music/teaser/compaction/CTA additions make this historical sample insufficient to promise current speed.

Read-only PostgreSQL aggregates (two `BEGIN READ ONLY` transactions, statement_timeout5s; no account, title, source URL, media ID, transcript or credential output):

-20video records,7duration-known;11691s=3.2475h total known input,793718581bytes input. Known durations:5under10min,0between10–30,0between30–60,2at least60min. Mean known duration27.84min; max5305.9s. This tiny development/sample dataset is not a customer upload distribution.
-39clips,39done,377045106historical bytes; average9.668MB/clip, positive minimum0.692MB, maximum23.104MB.27have duration; known-duration sum1154.87s, mean42.77s; corresponding307350412bytes implies aggregate2.129Mbit/s including audio.39clip means and27duration means have different denominators.
-Only1clip currently has an object key,38have expiry markers. Historical `bytes` remains after purge;377MB must NOT be billed as current S3 stock. S3 inventory was not queried. Video byte sums likewise describe database metadata, not verified live object size.

Current idle Docker snapshot: web98.04MiB, STT37.42, LLM35.88, video36.99, DB107.6, Redis5.445; total321.375MiB. CPU about0 except Redis0.78%. This excludes host/OS/proxy/cache and all job peaks. `docker inspect` reports Memory=0/NanoCpus=0 for web and3workers, i.e. no container CPU/RAM hard limits. The displayed11.68GiB is shared host capacity, not per-service reserved memory.

## Execution and memory risk

Source: `apps/worker/src/runtime.ts:67,77`, `.../workers/render.ts:117`, `.../render/ffmpeg.ts:95–103`, `.../media/download.ts:29–35`.

STT concurrency2; select concurrency2; render concurrency1. STT chunks are serial inside each job. STT extraction produces64kbit/s mono16kHz MP3:28.8MB/hour (43.2MB/90min);180s chunk about1.44MB. No local Whisper/LLM weights or GPU VRAM are needed.

Render:1080x1920, CPUlibx264 presetfast CRF23, AAC128kbit/s stereo44.1kHz, faststart. Video bitrate is VARIABLE; CRF23 does not fix file bytes. Face pass samples every0.5s using streamed raw source frames, then resizes to640px for CPUYuNet; does not hold the whole movie uncompressed. ASS subtitles, moving face crop/dual view, music loudness analysis/mix, packshot, teaser/title/CTA and pause compaction add unmeasured CPU/memory. The source-duration limit2–90min and2GB upload cap do not bound decoded frame dimensions; a short/high-resolution highly compressed source can exceed the estimate.

FFmpeg has no explicit thread cap;2STT jobs plus1video job can run heavy subprocesses concurrently and consume available cores/memory. Compaction graphs/decoder buffering can raise peaks. Disk guard is3x original before each download, process-local (not a global host-memory or multi-service reservation). At2GB/source,2STT reservations+1render reservation imply18GB of admission headroom on their shared physical SSD; normal live media files occupy less, but this is not a bound on every temporary/cached/write burst.

Engineering planning allocations, NOT RSS measurements: OS/Docker/cache1–2GiB, web/DB/Redis/proxy1–2GiB, one1080p render1–3GiB with several-GiB transient potential, concurrent audio/face tasks0.5–2GiB combined. Hence8GiB is conditional minimum;16GiB is the safer baseline. An8GiB VM may OOM under unrestricted unusual-resolution inputs or concurrent heavy subprocesses. Before purchasing, benchmark current effects on representative2GB/90min1080p input with actual concurrentSTT and render; collect host/cgroup peak RSS, CPU, disk, per-stage elapsed and failures. A small sample does not prove p95.

Operational recommendation only (not applied): preserve render concurrency1; on minimum VM serialize heavy audio extraction and video render if pressure appears, then measure. Reducing STT concurrency2→1 alone does not serialize STT against render; cross-stage scheduling or running only one heavy job is needed. Do not assume a VM resize or quota/product change happened.

SSD80GB planning: OS/runtime/images15–25GB, DB/Redis/logs/backups10–15GB, work/admission allowance18–24GB, remaining15–25GB spare. These are rough budgets, not measured partition sizes.120GB adds log/image-update/work headroom. Database growth/backups need separate monitoring.

## Media size, storage stock and traffic drivers

Compressed historical baseline252MB/88.43min≈0.171GB/input hour (~0.38Mbit/s). A2GB/hour1080p planning scenario is~11.7times larger (~4.44Mbit/s).2GB/hour is an assumption, not an observed typical upload; exact max accepted file is2,000,000,000bytes, so a90min file at2GB/hour (3GB) is rejected. For90min at the size ceiling, average input rate is1.333GB/hour. Input duration and source bytes must be modeled separately.

Historical mean9.67MB/clip supports an illustrative7clip package~68MB. A conservative current planning range for talk-heavy1080x1920 CRF23 is about2–6Mbit/s TOTAL, explicitly an engineering assumption:45s clip11–34MB;7clips79–236MB;3–8clips of20–75s yield60–600output seconds and~15–450MB at that rate. Motion/noise can exceed it; no bitrate ceiling is set. Audio alone128kbit/s=0.96MB/min. Historical output/input duration386/5305.9=7.28%, or262output seconds/input hour;2–6Mbit/s then65.5–196.5MB output/input hour. Small/short input still produces3–8clips, so do not universally scale package bytes linearly with input hours.

Original retention is a major stock variable: inspected `retentionTick` automatically purges expired CLIPS, not source objects. `eraseAccount` deletes`videos/{account}/`; architecture says originals removed with video. No fixed source TTL was established. Do not assume originals disappear after3days or after render. Formula: original storedGB≈monthlyinputhours×sourceGB/hour×retainedmonths, adjusted for deletion. Example100inputh/month:compressed17.1GB/month or2GB/hour200GB/month added; after12months without deletion205GB or2.4TB (illustrations only).

Free clips remain3days after completion; paid while active, then3days after paid expiry (frommax(finished_at,plan_paid_until)); showcased clip is exempt from normal expiry. Renewals can retain old paid clips indefinitely. Required bucket safety lifecycle:incomplete multipart abort1day, only`clips/free/` expiration7days, versioningdisabled. Applied S3 lifecycle and Cloud.ru compatibility are not proved by repository configuration. No blanket paid/source expiration should be assumed. Clip stock≈outputGB/day×retentiondays only under steady ingest and known retention; paid stock instead accumulates across continuous renewals. Add thumbnails, incomplete uploads and object versions if present.

CRITICAL traffic: `renderAttempt` calls`withSource` perCLIP and deletes temp in`finally`; no cross-clip source cache. ForCclips on a normal first successful video, S3→worker original GET bytes≈(1+C)×sourcebytes:oneSTT download plusCfull-originalrender downloads. Seven clips:8reads,2.02GB for252MBrecording;16GB for2GBfile. Atcompressedhour rate,~1.37GB worker-read/inputh; at2GB/hour,16GB/inputh. Each rerender addsonefull sourceGET; retries/restarts can add more. Network transfer classification/cost depends on placement/tariff and is not inferred here. S3GET operation counts are also(1+C), excludingprobes/multipartmetadata/etc.

Browser uploads original directly toS3 via signed multipart URLs; downloads/views also go directly toS3 after redirect/signing. Hence do not bill all media as app-VM egress, but include object-storage egress and requests. Client output egress≈outputbytes×full-download-equivalentplays, plus thumbnails/seeking/partial-range overhead. Example7×9.67MB package≈68MB perfull-view/download;10equivalents≈680MB.7clip package atplanning79–236MB gives0.79–2.36GB for10equivalents. Avoid counting provider audio upload as original-video size: extracted audio~28.8MB/inputh pluschunkoverlaps/retries; LLM receives transcriptsegments, notvideo.

## Pricing correction and scope limits

990RUB is30days subscription;270minutes isPERDAY (`UpgradeScreen.tsx:52`), notmonthlyincludedminutes. Current allowlisted web env:paid270/day,free900/day,uploads6/day,LLM6/day,globalminutes2000/day,globalLLM20/day,rerenders20/day,paymentsmodeoff. Nominal paid loose maximum135inputh/30days; current6uploads/6LLM and90min/file are not tighter than4.5h/day. Canonical2uploads/2LLM would cap first-success videos at3h/day=90h/30days, before retries/globalsharedlimits. These are loose mathematical caps, not guaranteed usable throughput or promised revenue.

990/4.5=220RUB/inputh is ONLY a scenario with4.5h total monthly usage. At15h/month66RUB/h;30h33RUB/h;90h11RUB/h;135h7.33RUB/h before tax/payment fees/refunds/free users. Current offmode does not prove any real payments. No current monetary tariff quotes or external API/model prices were researched by this subtask; coordinator owns vendor-rate verification and economic scenarios.

Validation:read-only source inspection, two successful DBREADONLY transactions and a point-in-time stats/cgroup inspection; no workload replay, paid model call, test suite or production change. E2Epreflight:not_applicable(read-onlyresearch). Requested executor:gpt-6.1-sol/high; actual provider/model metadata unavailable to this worker, tokens/costnull. This is engineering workload planning, not a measured infrastructure benchmark, customer distribution, p95, or supplier invoice.
