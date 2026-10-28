# Planning addendum: existing graph-order assertion

The accepted fps-before-trim correction also requires updating the existing literal
order expectation in tests/compaction.test.ts. That existing testcase remains mandatory;
change only its expected ordering, preserving all other assertions. This adds one
existing test file to the coding allowlist, not a production change or acceptance waiver.
Original plan SHA7bf903e562290852581a9e1053bf9d17d690de5c5dbbe62ff4889afb47b7584e
and all five AC remain unchanged. Assigned before this test edit.
