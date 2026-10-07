# N7 local recovery lesson

Independent A47 planning and A49 review confirmed: refusing a recovery SELECT does not scope a later UPDATE. All recovery writes must compare the original complete BodyIdentity and claimed/nonterminal state; the existing terminal cancellation still safely disposes its own row. Exact synthetic whole-row regression goes GREEN and removal of only the identity guard returns the same named RED. Source7dee9b9a; local patch accepted only, broader F11 gates remain pending.

A48 control preflight copied an outdated command despite valid raw execution. Preserve historical records; run a new immediate exact-command/source/build/helper preflight for the current regression rather than rewriting the earlier evidence.

Autonomous continuation remains coordinator-owned after errors and bounded attempts. Verify actual successor ACK; a queue entry or local status file does not prove execution or send a chat notification.
