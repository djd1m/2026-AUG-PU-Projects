# Bounded independent review
Run: 20261014T183500Z-journey-controls-52d1
Work unit: review-1
Requested model: gpt-6-astra
Actual model: null (no execution metadata exposed)
Launch SHA256: 93ebe57bd1c86a4ccc6a591553ead389d8a009d16cb12a8912c79f7ccf6a3c92
Verdict: changes_requested

Finding P1: DesignPanel reference editing and save remain enabled while currentDesignId exists but the asynchronous designs list has not hydrated. The initial activeKey ends in loading and installs blank scene / empty referenceIds. An edit during that window is silently discarded by hydration; Save or JobsCard can submit empty/wrong selected references. Disable editing/save/JobsCard until the current revision has hydrated, and cover delayed hydration. This extends an existing scene hydration weakness to the new per-design reference selection.

Static deletion review: account then project lock and CAS serialize createShell/delete; all shell history usage is checked; asset ownership precedes deletion, GLB-only restriction is inside transaction, physical unlink occurs after commit. No blocking deletion finding in inspected scope.

No tests rerun per assignment. Full suite/build owned by coordinator. Review limited to listed sources plus route export and adjacent createShell/createReference guards; not a complete security audit.

Source hashes:
{
  "packages/db/src/space.ts": "f161055124247195380dfe6cc567730cd1b91d943fbf02223b1251fb620aa937",
  "apps/web/src/server/space.ts": "91bf78d9bee6c0f9d7a57ed8dc3f47825f132a9a0b996d7e3039e85cacba2a74",
  "apps/web/src/components/GlbFiles.tsx": "124029854cdeb150a5d2e64d94c8accedc79c224916ab93381f0ed82d03e3a1d",
  "apps/web/src/components/NextStepHint.tsx": "5e7bd04c11f55da4f5d0d738cd68680cc46c0de1d9d24d29f8adf85df5f45fb3",
  "apps/web/src/components/DesignPanel.tsx": "d1870cd165eb02a62985c8fd3ff7d61c68b9559dc6a91e5539aabb15b6e0d058",
  "apps/web/src/components/JobsCard.tsx": "2a52f1357bd13f8867118abe5469c6f2c2e493c885fb7f82f055ebfa1c784b3c",
  "apps/web/src/components/RoomEditor.tsx": "7f92c427c15472baaf121b365684031c7ec2665b4fb412adc633b1a0d81ba377"
}
Finished: 2026-10-14T18:38:25.150547+00:00
finalStatus: completed
Status: completed
