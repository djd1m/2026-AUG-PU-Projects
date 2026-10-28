# Cloud.ru Evolution price evidence — 26 October 2026

Current official PDFs opened and visually checked: Compute261014 effective14October2026 (all 3 pages); S3 260918 effective28September2026 (1 page). All prices include22% VAT. Search snippets sometimes show obsolete20% VAT: use current linked PDFs. Structured sources and inputs: infra-pricing-sources.json.

## Compute

[Current tariff](https://cloud.ru/documents/tariffs/evolution/evolution-compute) / [PDF](https://cdn.cloud.ru/docs/legal/tariffs/evolution/current-version/evolution-compute.pdf). Exact configuration rates rather than invented separate per-vCPU/RAM pricing:

|Resource|RUB/hour inclVAT|
|---|---:|
|2vCPU/4GB|2.9707|
|4vCPU/8GB|5.9414|
|8vCPU/16GB|11.8828|
|SSD NVMe perGB|0.01586|
|PublicIP each|0.2074|
|Public sNAT gateway each|0.2074|

Use100% guaranteed CPU for sustained ffmpeg; [CPU documentation](https://cloud.ru/docs/virtual-machines/ug/topics/concepts__overcommitment) explains full physical-core time availability.10%/30% shared capacity does not provide equivalent processing throughput.

Total/hour=configuration+SSDsize×0.01586+IPs×0.2074. Root disk included in80/120GB; no free disk assumed. Split: app/db/redis2vCPU4GB40GBSSD + worker4vCPU8GB80GBSSD (total6/12/120), two public IPs. It isolates processing CPU from app/database but provides no HA. Minimum is a single4/8/80; optimal candidate single8/16/120 has more ffmpeg capacity. These remain sizing hypotheses until measured.

|Scenario|RUB/hour|RUB/720 hours|RUB/730hours|
|---|---:|---:|---:|
|minimum_4_8_80|7.4176|5340.67|5414.85|
|optimal_8_16_120|13.9934|10075.25|10215.18|
|split_2_4_40_plus_4_8_80|11.2301|8085.67|8197.97|

720 hours=30 days;730 normalized average. October has744 hours. [VM billing](https://cloud.ru/docs/virtual-machines/ug/topics/pricing) uses seconds; stopped compute ceases charges, retained disks/IP continue. [IP billing](https://cloud.ru/docs/public-ip/ug/topics/pricing) models one rental for address lifetime. Base model does not add attachment again despite duplicate tariff labels. One public IP+public sNAT is not automatically cheaper: gateway itself0.2074/hour and assigned address can add rental; using two IPs is the explicit conservative split configuration. Private routing or app-as-NAT was not evaluated.

[VM traffic FAQ](https://cloud.ru/docs/virtual-machines/ug/topics/faq__traffic-tariff) exempts ingress/egress temporarily; [legal rules](https://cloud.ru/documents/promotions/active/evolution-free-tier) clause5.1 exempts ingress/inter-Evolution/Compute egress. Model current VM traffic0; tariff still lists0.00366 RUB/MB outbound. Sensitivity≈3.66 RUB/decimalGB if exemption ends. Keep separate from S3 egress.

## S3

[Current tariff](https://cloud.ru/documents/tariffs/evolution/object-storage) / [PDF](https://cdn.cloud.ru/docs/legal/tariffs/evolution/current-version/object-storage.pdf): STANDARD 1.83915 RUB/GB-month above free 15 GB; SINGLE 1.1346 RUB/GB-month with no free storage/operations. Both GET/HEAD0.03294 RUB/1000; PUT/POST/LIST0.1098 RUB/1000. Internet egress above allowance1.1712 RUB/GB.

Prefer STANDARD for production user media. [Current service terms](https://cloud.ru/documents/contracts/terms-of-service/evolution/object-storage/description-object-storage) describe two copies on separate sites; SINGLE one copy/site becomes inaccessible when site fails. Old snippets claiming three sites were excluded.

[Free-tier documentation](https://cloud.ru/docs/s3e/ug/topics/overview__free-tier) explicitly confirms10TB/month egress for all classes, organization scope across all buckets. STANDARD 15 GB storage,100000 PUT/POST/LIST and1000000 GET/HEAD renew monthly. Never grant each project a separate pool. Egress=1.1712×max(0,organizationTotalGB−10000); unrelated organization consumption reduces available pool. Where eligibility/unused quota is unknown, also show no-allowance sensitivity. Pool operation types together conservatively; exact grouping is unclear.

[Legal eligibility](https://cloud.ru/documents/promotions/active/evolution-free-tier) requires RF registration, accepted contract,≥100RUB/bonus balance, console Free Tier setup, no arrears. Campaign through31 December 2026; product docs and legal clause 5 describe indefinite use, but provider can change/withdraw quotas. Do not promise2027 entitlement. Account eligibility was not accessed.

For steady SGB, STANDARD storage budget=1.83915×max(0,S−availableFreeGB). Actual [billing guide](https://cloud.ru/docs/s3e/ug/topics/pricing?source-platform=Evolution) uses hourly maximum occupied storage; retained versions/unfinished multipart increase volume. Multipart has one PUT per part plus two POST. Monthly economics must use full operation/egress tariffs; some hourly guide examples divide these by month-hours inconsistently with monthly example, so do not reproduce that apparent underpricing.

No generic50% CPU Compute discount verified. [Current offers](https://cloud.ru/offers) advertises50% Data Platform; old GPU-specific offers do not support CPU Compute discount. No bonus/promo deducted.

Requested model gpt-6.1-sol/high; actual model/usage counters unavailable(null). Read-only public research, no signup/account/cloud resource changes. Remaining unknowns are listed in JSON.
