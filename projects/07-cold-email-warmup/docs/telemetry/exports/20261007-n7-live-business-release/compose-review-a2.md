# Focused CONFIG-R1 correction review

Verdict: **ACCEPT_CONFIG_SLICE**. CONFIG-R1 resolved; no new must-fix findings.
Source:d1ee7483de4fa17b3aed4e9e9206fa36bdad9515; baselinea31029c375b8a973f8a554ee18c66a1fec0ada28. Exact delta is docs/live-billing-runtime.md only. Prior native Compose7-case/merged-service checks remain applicable to unchanged Compose/env files; no repeat needed.

The documentation retains operator-owned parent mode700 and explicitly limits chown/chmod600 to the two new merchant files. UID/GID are obtained from the existing source/image-verified candidate, with configured USERnode and default-versus-node identity verification before changing ownership. The prior current public UID1000:1000 is context, not permission to treat an unverified deployment as the candidate. Existing AEAD/session/hash/DB keys and global permissions stay untouched.

The mounted-file preflight explicitly runs as USERnode and checks fs.accessSync(R_OK); it emits only the two filenames plus readable/unreadable, never contents or values, rejects root execution and requires exit0. It occurs only after separately authorized candidate/mount setup. A missing verified candidate/mount is recorded pending; rendering is not claimed to prove access. The instructions themselves start no container and claim no actual activation/payment.

Independent checks: all three shell examples pass bash-n in review-owned scratch; frozen git diff --check exit0; source and immutable launch hash exact. These syntax checks execute none of the documented operator commands. No author receipt/messages/reasoning read. No new starts, secret reads, ownership/mode changes, provider calls, installation or product edits. Actual runtime readability is still a future release preflight, not a result of this review.

Requested Sol6.1 HIGH; actual host model/usage/cost:null. Profile: focused independent CONFIG correction review. Elapsed from recorded launch: 61.697seconds.

Status: completed
