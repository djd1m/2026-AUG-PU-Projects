# Swarm File Evidence

## Rule

Every parallel work unit has a named file result. A narrative reply is only a pointer; silence is
neither progress nor completion. The coordinator may aggregate only positive, attributable terminal
receipts from the assigned files.

## Mechanics

1. Before dispatch, allocate a run-unique `RUN_ID` and a unique `WORK_UNIT_ID`. Resolve one absolute
   `TRACE_PATH` per `(RUN_ID, WORK_UNIT_ID)`, record its pre-launch state, and pass both fields to the
   worker. Two workers never share a path.
2. The worker writes a substantive Markdown body to a temporary regular file in the same directory,
   appends exactly `Status: completed` or `Status: failed` as the final line, renames it to
   `TRACE_PATH`, then returns a one-line pointer. The terminal marker is written last.
3. Before merge, synthesis, or completion, the coordinator checks each assigned path: absolute and
   unique; regular and non-symlink; readable and non-whitespace; absent before launch or observably
   changed after launch; final line terminal. It reads the file as the payload and reports
   `valid receipts / required receipts` with every failed `WORK_UNIT_ID` and path.
4. `Status: completed` permits consumption. `Status: failed` is a delivered failure and blocks a
   successful aggregate. Missing, empty, stale, partial, unreadable, duplicate, or probe-error
   evidence is undelivered or inconclusive. A dead PID stops waiting as failure; a live PID may only
   extend waiting. Neither PID state proves delivery.

## Bounded exception

If atomic rename is unavailable, write directly to `TRACE_PATH` and append the terminal marker last;
until that line exists the file is partial. Host-authoritative liveness may extend a deadline, but it
cannot replace the file result or turn missing evidence into success.

## Observable violation → replacement

| Observable violation | Required replacement |
|---|---|
| Task report exists but `TRACE_PATH` does not | Name the unit/path, mark undelivered, and refuse aggregation. |
| File is empty, stale, symlinked, unreadable, or non-terminal | Keep the evidence out of the aggregate and rerun or diagnose that unit. |
| Status says `running` but its recorded PID is dead | Close the unit as failed; do not report continued work from silence. |
| Fewer than all required receipts are terminal-completed | Report the partial ratio and refuse completion. |

## Self-check

For every parallel unit, point to its assignment containing `WORK_UNIT_ID` and absolute `TRACE_PATH`,
then point to the coordinator check performed before aggregation. Exercise missing, empty, stale,
partial, failed, dead-PID, and probe-error traces; only a fresh substantive file ending in
`Status: completed` may satisfy delivery.
