# F07 actual runtime evidence

Raw process logs are gzip archives with deterministic headers; decoding reproduces the original bytes. `../artifact-manifest.json` records stored and decoded SHA256 hashes and byte counts. This preserves original whitespace/progress output without weakening source whitespace checks or rewriting failed logs. JSON reports and screenshot remain directly readable. The original temporary filenames in author/reviewer receipts map to these archives by adding `.gz`.
