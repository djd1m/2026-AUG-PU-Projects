# N8 browser attempt4 — failed

RUN_ID: n8-20261002-1740
WORK_UNIT_ID: n8-ui-e2e-4
Source: d05b458d56ec1752e405f1c6646e52f24a76536a
Build: 0aaeeb56fd9cc1995cabc3c9547fc1bbc2bff48f0c2dd26c224e494fd1a259f0
Launch-SHA256: 2d02ba8b96148b0c3b74c8a689c03402bebf90b4d8c3329a72020a9880fc8c88

Companion validator exit0 checked before actual browser. Started02:33:34.203869Z; finished02:36:03.625858Z;149422ms; exit1. The main scenario reached R4 delayed real401 case, then logout click timed out because button was already hidden. No complete results.json; desktop screenshot retained, no aggregate E2E PASS.

Source inspection shows previous delete scenario waits result:hidden, but app delete handler hides result before awaiting actual DELETE, loadUploads, balance and gallery. The subsequent direct logout invalidates the session while those authentic requests may remain in flight; an unheld401 can reset UI before the designated old401 is released. This is a concrete fixture synchronization hypothesis to verify with bounded regression and corrected real-browser ordering, not a fabricated product pass.

Next scope: wait for real delete operation and its refresh chain before invalidating session, preserving actual click/HTTP/owner deletion and real held401 across newlogin. No production edit unless independent evidence confirms a product defect. Cleanup exit0; shared browser preserved. All earlier failed attempts remain immutable. Geometry pending, usage/cost null.

Status: failed
