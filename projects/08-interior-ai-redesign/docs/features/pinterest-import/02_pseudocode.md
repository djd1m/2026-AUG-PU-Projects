# Import algorithms

## DiscoverPinterest
Implements: FR-pinterest-import-1, AC-pinterest-import-1
Validate page URL; DNS resolve public IPv4 and pin connection lookup, TLS hostname verification; GET identity encoding, <=4MiB, total timeout and <=3 safe redirects. Parse own pin og:image or <=8 unique image hashes from public ideas page; return allowlisted HTTPS CDN candidates only.

## ImportOwnedReference
Implements: AC-pinterest-import-2
Authenticate and Origin/version/ownership check before body/network. Read active owned link+rights. Discover again; validate expected image URL membership server-side, download <=10MiB fixedCDN image. Existing uploader validates actual bytes/private hashes, quotas and source version. Create a new image reference with new version, retaining original link. Reply selected reference and version; no auto AI call.

## ReferencePicker
Implements: AC-pinterest-import-3
Link selected -> discover thumbnails -> select candidate (default first visible). Apply -> sequential imports using returned CAS versions -> call existing local palette design with resulting image IDs and final version. Error -> display precise message and optional manual fallback; no silent image substitution.

## VerifyImport
Implements: AC-pinterest-import-4
Offline pure guards+real HTTP fixture boundary tests, hostile URL/DNS/redirect/oversize, integration ownership/CAS; independent review; full regression/build and source-bound real public browser on pin+ideas source; record actual results only.
