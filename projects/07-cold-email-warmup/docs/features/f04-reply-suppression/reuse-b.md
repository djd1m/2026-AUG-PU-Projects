# F04-B reuse

Accepted baseline c6cbbbfe8250ca37833d397ab1c8aced9e604789, exact F04 spec SHA256 6deaa2f48d531ca66b71abb9f1b90794836cc4ab80eab557076863b92de74a38.

Reuse F03 opaque32byte capability generator/table and renderer; F04a trusted ReplyStore/parser/run identity/immutable H+tailH; global eligibilityTransaction lock FIRST; F02 consent membership withdrawal semantics; F03 final current-state guard/in-flight boundary; recipient HMAC normalization; native HTTP typed errors/no-log policy. New client helpers only combine existing effects into one caller transaction. No copied framework, new dependency or auth/AEAD algorithm change. Old migrations001–007 unchanged.

Requested F04a node_modules directory was absent. Parent control approved actual immutable `/tmp/n7-f03b-sol/projects/07-cold-email-warmup/node_modules`; package-lock SHA256 matches 49b300c360c2c1471596b225ced88d8b509bb57fcc2787a83c0dd5190089eb1a. Reused temporary symlink without modifying/pruning donor. Runtime image installs the identical lock with npm ci. Root and other project sources remain untouched.
