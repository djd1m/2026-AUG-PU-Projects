# F07-V01 correction

Only the mandatory mutation paragraph in05_completion.md changed. Production
semantics, spec and algorithms unchanged. The direct send-CAS test now mutates the
actual authorization guard and requires the same transport-count oracle to observe
a second POST; recovery remains a separate race regression. Redundant guard bypass
must be explicit and narrowly reach the same send path. No product code or tests
were run at the design stage. Fresh narrow independent closure pending.

Before SHA256: 90a91240404d9edf7c8bbf042cb5a867dc9e0302691bd15aebcbf931c52a79e4
After SHA256: 91541235061c856f42882e64b047882f8f6fb83b44fcc11708edd510598e491b
