"""Behavior, mutation, and portability tests for the read-only validator."""

import copy
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


SKILL = Path(__file__).resolve().parents[1]
VALIDATOR = SKILL / "scripts" / "validate_record.py"
PROBE_GUARD = os.environ.get("PWC_GUARD")
PROBE_VALIDATOR = Path(os.environ.get("PWC_VALIDATOR", VALIDATOR))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rooted(path):
    return {"root": "project", "path": path}


class Fixture:
    def __init__(self, base=None):
        self.temp = tempfile.TemporaryDirectory()
        parent = Path(self.temp.name)
        self.root = parent / (base or "project")
        self.root.mkdir(parents=True)
        for relative, body in (
            ("telemetry/run.json", "{}\n"),
            ("telemetry/events.jsonl", "{}\n"),
            ("docs/requirements.md", "# Requirements\n"),
            ("docs/architecture.md", "# Architecture\n"),
            ("donors/source.md", "# Donor fragment\n"),
            ("evidence/approval.md", "Approved plan-r1, team, roles, models, skills.\n"),
        ):
            path = self.root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(body, encoding="utf-8")
        self.record = self._record()
        self.record_path = self.root / "work" / "record.json"
        self.record_path.parent.mkdir()
        self.save()

    def cleanup(self):
        self.temp.cleanup()

    def _record(self):
        approval = self.root / "evidence" / "approval.md"
        launch_path = self.root / "evidence" / "launch.json"
        receipt_path = self.root / "evidence" / "receipt.md"
        launch = {
            "schema": "project-work-companion/launch-v1",
            "run_id": "run-1", "work_unit_id": "unit-1", "attempt_id": "attempt-1",
            "source_revision": "source-r1", "build_revision": "build-r1",
            "trace": rooted("evidence/receipt.md"),
            "trace_prelaunch": {"exists": False, "sha256": None},
            "launched_at": "2026-09-10T10:00:00Z",
        }
        launch_path.write_text(json.dumps(launch, indent=2) + "\n", encoding="utf-8")
        launch_digest = digest(launch_path)
        receipt_path.write_text(
            "Implementation evidence\n"
            "Run-ID: run-1\nWork-Unit-ID: unit-1\nAttempt-ID: attempt-1\n"
            "Source-Revision: source-r1\nBuild-Revision: build-r1\n"
            f"Launch-SHA256: {launch_digest}\n"
            "Finished-At: 2026-09-10T10:01:00Z\nVerdict: pass\n"
            "All scoped checks finished and evidence is indexed.\nStatus: completed\n",
            encoding="utf-8",
        )
        return {
            "schema_version": 1,
            "record_kind": "project-work-companion/work-record",
            "stage": "delivered",
            "roots": {"project": "."},
            "identity": {"run_id": "run-1", "work_unit_id": "unit-1", "current_attempt_id": "attempt-1"},
            "telemetry": {"run": rooted("telemetry/run.json"), "events": rooted("telemetry/events.jsonl")},
            "source": {
                "baseline_revision": "base-r1", "current_revision": "source-r1", "build_revision": "build-r1",
                "requirements": [rooted("docs/requirements.md")],
                "architecture": [rooted("docs/architecture.md")],
                "continuity": {"expected_revision": "source-r1", "observed_revision": "source-r1", "reconciliation": None},
            },
            "prepare": {
                "scope_revision": "plan-r1", "scope": ["implement companion"],
                "exclusions": ["product code"], "action_limits": ["read-only validation"],
                "acceptance_criteria": [{"id": "AC-01", "required": True}],
                "donors": [{"source": {"kind": "local", "path": rooted("donors/source.md")},
                            "provenance": "base-r1", "useful_fragment": "receipt contract",
                            "compatibility": "partial", "decision": "adapt", "reason": "portable roots"}],
                "forecast": {"status": "insufficient_data", "method": "project-telemetry: no comparable runs",
                             "scope_revision": "plan-r1", "calibration": "not_applicable",
                             "comparable_run_ids": [], "exclusions": ["unrelated runs"],
                             "external_expectations": [], "range": None, "usage": None, "cost": None},
            },
            "routes": [
                {"phase": "plan", "scope_revision": "plan-r1", "tier": "M", "rationale": "approval and evidence risk",
                 "script": {"input": "approved file allowlist", "exit_code": 0}},
                {"phase": "implementation", "scope_revision": "plan-r1", "tier": "M", "rationale": "substantive tier retained",
                 "script": {"input": "approved scope and seven files", "exit_code": 0}},
            ],
            "approval": {"requirement": "required", "reason": "user required plan approval",
                         "evidence": {"id": "approval-1", "plan_revision": "plan-r1",
                                      "covers": ["plan", "team", "roles", "models", "skills"],
                                      "path": rooted("evidence/approval.md"), "sha256": digest(approval)}},
            "preflight": {"status": "ready", "source_revision": "source-r1", "build_revision": "build-r1",
                          "environment": "isolated local test", "environment_available": True,
                          "test_command": "python3 -m unittest", "inputs": [{"name": "fixture", "available": True}],
                          "expected_effects": ["local reads only"], "evidence_root": rooted("evidence/output"),
                          "external_actions_executed": False, "e2e_claim": None},
            "attempts": [{"id": "attempt-1", "status": "completed"}],
            "work_units": [{"id": "unit-1", "paths": [rooted("src/output.txt")]}],
            "pause": None,
            "checks": [{"ac_id": "AC-01", "outcome": "pass", "command": "python3 -m unittest",
                        "exit_code": 0, "source_revision": "source-r1", "receipt_id": "receipt-1"}],
            "receipts": [{"id": "receipt-1", "work_id": "unit-1", "path": rooted("evidence/receipt.md"),
                          "sha256": digest(receipt_path), "launch_path": rooted("evidence/launch.json"),
                          "launch_sha256": launch_digest}],
            "delivery": {"uri": "urn:pwc:run-1:unit-1",
                         "scope": {"included": ["companion skill"], "excluded": ["product code"]},
                         "build": {"source_revision": "source-r1", "build_revision": "build-r1"},
                         "evidence": ["receipt-1"], "pending": []},
        }

    def save(self):
        self.record_path.write_text(json.dumps(self.record, indent=2) + "\n", encoding="utf-8")

    def command(self, validator=VALIDATOR, expectations=True):
        command = [sys.executable, "-B", str(validator), "--root", str(self.root), "--record", str(self.record_path)]
        if expectations:
            command += ["--expect-run-id", "run-1", "--expect-work-unit-id", "unit-1",
                        "--expect-source-revision", self.record["source"]["current_revision"],
                        "--expect-build-revision", self.record["source"]["build_revision"],
                        "--expect-launch", f"unit-1={self.record['receipts'][0]['launch_sha256']}"]
        return command

    def run(self, validator=VALIDATOR, expectations=True, cwd=None):
        self.save()
        return subprocess.run(self.command(validator, expectations), cwd=cwd, text=True, capture_output=True)

    def pause(self, checkpoint_valid=True):
        self.record["stage"] = "paused"
        self.record["attempts"] = [{"id": "attempt-0", "status": "interrupted"}, {"id": "attempt-1", "status": "paused"}]
        self.record["receipts"] = []
        self.record["delivery"] = None
        self.record["checks"] = []
        self.record["pause"] = {
            "from_stage": "implement", "run_id": "run-1", "work_unit_id": "unit-1",
            "source_revision": "source-r1", "next_allowed_step": "resume implementation",
            "blockers": [], "approval_ids": ["approval-1"], "continuation_mode": "handoff",
            "checkpoint": {"status": "not_applicable" if checkpoint_valid else "required",
                           "reason": "caller provides no native checkpoint"},
        }

    def rebind_source(self, revision):
        launch_path = self.root / "evidence" / "launch.json"
        launch = json.loads(launch_path.read_text())
        launch["source_revision"] = revision
        launch_path.write_text(json.dumps(launch, indent=2) + "\n")
        launch_digest = digest(launch_path)
        receipt_path = self.root / "evidence" / "receipt.md"
        receipt = receipt_path.read_text().replace("Source-Revision: source-r1", f"Source-Revision: {revision}")
        old_launch = self.record["receipts"][0]["launch_sha256"]
        receipt_path.write_text(receipt.replace(f"Launch-SHA256: {old_launch}", f"Launch-SHA256: {launch_digest}"))
        self.record["receipts"][0]["launch_sha256"] = launch_digest
        self.record["receipts"][0]["sha256"] = digest(receipt_path)
        self.record["source"]["current_revision"] = revision
        self.record["preflight"]["source_revision"] = revision
        self.record["checks"][0]["source_revision"] = revision
        self.record["delivery"]["build"]["source_revision"] = revision


class ValidatorTests(unittest.TestCase):
    def setUp(self):
        self.fixture = Fixture()
        self.addCleanup(self.fixture.cleanup)

    def assertCode(self, code, result):
        self.assertEqual(code, result.returncode, result.stderr)

    def test_valid_source_bound_delivery_passes(self):
        result = self.fixture.run()
        self.assertCode(0, result)
        self.assertIn("not product acceptance", result.stdout)

    def test_delivery_without_authoritative_expectations_is_unavailable(self):
        self.assertCode(2, self.fixture.run(expectations=False))

    def test_external_source_expectation_cannot_be_self_reported_away(self):
        command = self.fixture.command()
        command[command.index("source-r1")] = "caller-source-r2"
        result = subprocess.run(command, text=True, capture_output=True)
        self.assertCode(1, result)

    def test_frozen_cli_rejects_stale_record_source_and_build(self):
        command = self.fixture.command()
        self.fixture.record["source"].update(current_revision="source-old", build_revision="build-old")
        self.fixture.record["source"]["continuity"].update(expected_revision="source-old", observed_revision="source-old")
        self.fixture.record["preflight"].update(source_revision="source-old", build_revision="build-old")
        self.fixture.record["delivery"]["e2e_claim"] = "pass"
        self.fixture.save()
        self.assertCode(1, subprocess.run(command, text=True, capture_output=True))

    def test_frozen_cli_rejects_stale_record_source_only(self):
        command = self.fixture.command()
        self.fixture.record["source"].update(current_revision="source-old")
        self.fixture.record["source"]["continuity"].update(expected_revision="source-old", observed_revision="source-old")
        self.fixture.record["preflight"].update(source_revision="source-old")
        self.fixture.save()
        self.assertCode(1, subprocess.run(command, text=True, capture_output=True))

    def test_frozen_cli_rejects_stale_record_build_only(self):
        command = self.fixture.command()
        self.fixture.record["source"].update(build_revision="build-old")
        self.fixture.record["preflight"].update(build_revision="build-old")
        self.fixture.save()
        self.assertCode(1, subprocess.run(command, text=True, capture_output=True))

    def test_external_launch_digest_mismatch_is_a_violation(self):
        command = self.fixture.command()
        command[-1] = "unit-1=" + ("0" * 64)
        self.assertCode(1, subprocess.run(command, text=True, capture_output=True))

    def test_stale_receipt_is_rejected(self):
        launch = self.fixture.root / "evidence" / "launch.json"
        receipt = self.fixture.root / "evidence" / "receipt.md"
        launch_time = launch.stat().st_mtime
        os.utime(receipt, (launch_time - 10, launch_time - 10))
        self.assertCode(1, self.fixture.run())

    def test_partial_receipt_without_exact_terminal_marker_is_rejected(self):
        receipt = self.fixture.root / "evidence" / "receipt.md"
        receipt.write_text(receipt.read_text().replace("Status: completed\n", "Status: running\n"))
        self.fixture.record["receipts"][0]["sha256"] = digest(receipt)
        self.assertCode(1, self.fixture.run())

    def test_header_only_receipt_is_not_substantive(self):
        receipt = self.fixture.root / "evidence" / "receipt.md"
        receipt.write_text(receipt.read_text().replace(
            "All scoped checks finished and evidence is indexed.\n", ""))
        self.fixture.record["receipts"][0]["sha256"] = digest(receipt)
        self.assertCode(1, self.fixture.run())

    def test_fresh_path_adapter_rejects_preexisting_trace(self):
        launch_path = self.fixture.root / "evidence" / "launch.json"
        launch = json.loads(launch_path.read_text())
        launch["trace_prelaunch"] = {"exists": True, "sha256": "0" * 64}
        launch_path.write_text(json.dumps(launch, indent=2) + "\n")
        launch_digest = digest(launch_path)
        receipt = self.fixture.root / "evidence" / "receipt.md"
        old_digest = self.fixture.record["receipts"][0]["launch_sha256"]
        receipt.write_text(receipt.read_text().replace(old_digest, launch_digest))
        self.fixture.record["receipts"][0]["launch_sha256"] = launch_digest
        self.fixture.record["receipts"][0]["sha256"] = digest(receipt)
        self.assertCode(1, self.fixture.run())

    def test_malformed_types_fail_without_traceback(self):
        self.fixture.record["identity"] = []
        result = self.fixture.run()
        self.assertCode(1, result)
        self.assertNotIn("Traceback", result.stderr)

    def test_duplicate_json_keys_are_rejected(self):
        self.fixture.record_path.write_text('{"schema_version":1,"schema_version":1}\n')
        result = subprocess.run(self.fixture.command(), text=True, capture_output=True)
        self.assertCode(1, result)
        self.assertIn("duplicate JSON key", result.stderr)

    def test_path_escape_and_symlink_are_rejected(self):
        self.fixture.record["source"]["requirements"] = [rooted("../outside.md")]
        self.assertCode(1, self.fixture.run())
        self.fixture.record = self.fixture._record()
        target = self.fixture.root / "evidence" / "receipt.md"
        link = self.fixture.root / "evidence" / "linked-receipt.md"
        link.symlink_to(target)
        self.fixture.record["receipts"][0]["path"] = rooted("evidence/linked-receipt.md")
        self.fixture.record["receipts"][0]["sha256"] = digest(target)
        self.assertCode(1, self.fixture.run())

    def test_duplicate_work_ids_and_owned_paths_are_rejected(self):
        self.fixture.record["work_units"].append(copy.deepcopy(self.fixture.record["work_units"][0]))
        self.assertCode(1, self.fixture.run())

    def test_incompatible_donor_cannot_be_adapted(self):
        self.fixture.record["prepare"]["donors"][0]["compatibility"] = "incompatible"
        self.assertCode(1, self.fixture.run())

    def test_insufficient_forecast_cannot_invent_a_range_or_zero_cost(self):
        forecast = self.fixture.record["prepare"]["forecast"]
        forecast["range"] = {"lower": 0, "upper": 0, "unit": "hours"}
        forecast["cost"] = 0
        self.assertCode(1, self.fixture.run())

    def test_handoff_checkpoint_is_optional_and_history_preserved(self):
        self.fixture.pause()
        self.assertCode(0, self.fixture.run(expectations=False))

    def test_pause_does_not_require_reapproval(self):
        self.fixture.pause()
        self.fixture.record["approval"] = {"requirement": "not_required", "reason": "caller contract does not require it", "evidence": None}
        self.fixture.record["pause"]["approval_ids"] = []
        self.assertCode(0, self.fixture.run(expectations=False))

    def test_paused_plan_may_wait_for_required_approval(self):
        self.fixture.pause()
        self.fixture.record["pause"].update(from_stage="plan", approval_ids=[], blockers=["waiting for owner approval"],
                                            next_allowed_step="obtain plan approval")
        self.fixture.record["approval"]["evidence"] = None
        self.fixture.record["preflight"] = None
        self.fixture.record["routes"] = self.fixture.record["routes"][:1]
        self.assertCode(0, self.fixture.run(expectations=False))

    def test_paused_implementation_still_requires_approval(self):
        self.fixture.pause()
        self.fixture.record["approval"]["evidence"] = None
        self.fixture.record["pause"]["approval_ids"] = []
        self.assertCode(1, self.fixture.run(expectations=False))

    def test_not_required_approval_does_not_block_delivery(self):
        self.fixture.record["approval"] = {"requirement": "not_required", "reason": "no caller or rule requirement", "evidence": None}
        self.assertCode(0, self.fixture.run())

    def test_required_approval_reference_survives_pause(self):
        self.fixture.pause()
        self.fixture.record["pause"]["approval_ids"] = []
        self.assertCode(1, self.fixture.run(expectations=False))

    def test_required_approval_must_cover_current_plan(self):
        self.fixture.record["approval"]["evidence"]["plan_revision"] = "stale-plan"
        self.assertCode(1, self.fixture.run())

    def test_implementation_before_build_allows_reasoned_non_e2e(self):
        self.fixture.record["stage"] = "implement"
        self.fixture.record["source"]["build_revision"] = None
        self.fixture.record["preflight"] = {
            "status": "not_applicable", "reason": "build does not exist; E2E is not planned in this stage",
            "external_actions_executed": False, "e2e_claim": None,
        }
        self.fixture.record["receipts"] = []
        self.fixture.record["delivery"] = None
        self.fixture.record["checks"] = []
        self.assertCode(0, self.fixture.run(expectations=False))

    def test_non_e2e_preflight_requires_a_reason(self):
        self.fixture.record["stage"] = "implement"
        self.fixture.record["preflight"] = {
            "status": "not_applicable", "external_actions_executed": False, "e2e_claim": None,
        }
        self.fixture.record["receipts"] = []
        self.fixture.record["delivery"] = None
        self.fixture.record["checks"] = []
        self.assertCode(1, self.fixture.run(expectations=False))

    def test_e2e_claim_without_ready_preflight_is_rejected(self):
        self.fixture.record["preflight"] = {
            "status": "not_applicable", "reason": "docs-only delivery",
            "external_actions_executed": False, "e2e_claim": None,
        }
        self.fixture.record["delivery"]["e2e_claim"] = "pass"
        self.assertCode(1, self.fixture.run())

    def test_blocked_preflight_may_precede_a_build(self):
        self.fixture.record["stage"] = "implement"
        self.fixture.record["source"]["build_revision"] = None
        self.fixture.record["preflight"] = {
            "status": "blocked", "reason": "build has not been created",
            "source_revision": "source-r1", "build_revision": None,
            "environment": None, "environment_available": False, "test_command": None,
            "inputs": [], "expected_effects": [], "evidence_root": None,
            "external_actions_executed": False, "e2e_claim": None,
        }
        self.fixture.record["receipts"] = []
        self.fixture.record["delivery"] = None
        self.fixture.record["checks"] = []
        self.assertCode(0, self.fixture.run(expectations=False))

    def test_pending_explicitly_out_of_scope_is_disclosed_without_blocking(self):
        self.fixture.record["delivery"]["pending"] = [{
            "item": "commercial rollout", "scope": "out_of_scope", "reason": "excluded by approved scope",
        }]
        self.assertCode(0, self.fixture.run())

    def test_pending_accepted_scope_still_blocks_delivery(self):
        self.fixture.record["delivery"]["pending"] = [{
            "item": "mandatory AC follow-up", "scope": "accepted_scope", "reason": "not finished",
        }]
        self.assertCode(1, self.fixture.run())

    def test_delivery_uri_requires_supported_full_form(self):
        for invalid in ("https:broken", "custom:opaque", "file:///tmp/result"):
            with self.subTest(uri=invalid):
                self.fixture.record["delivery"]["uri"] = invalid
                self.assertCode(1, self.fixture.run())
        self.fixture.record["delivery"]["uri"] = "https://example.test/delivery/run-1"
        self.assertCode(0, self.fixture.run())

    def test_source_drift_requires_reconciliation_not_repair(self):
        self.fixture.record["source"]["continuity"]["observed_revision"] = "source-r2"
        self.fixture.record["source"]["current_revision"] = "source-r2"
        result = self.fixture.run()
        self.assertCode(1, result)
        self.assertIn("reconciliation", result.stderr)

    def test_reconciled_source_drift_can_deliver_after_affected_rerun(self):
        self.fixture.rebind_source("source-r2")
        self.fixture.record["source"]["continuity"] = {
            "expected_revision": "source-r1", "observed_revision": "source-r2",
            "reconciliation": {"status": "completed", "impact": "AC-01 affected",
                               "decision": "retain change and rerun", "affected_checks": ["AC-01"],
                               "rerun": ["AC-01"], "pending": []},
        }
        self.assertCode(0, self.fixture.run())

    def test_template_is_clearly_nonpassing(self):
        template = json.loads((SKILL / "assets" / "work-record.json").read_text())
        self.assertIn("intentionally non-passing", template["_notice"])
        target = self.fixture.root / "work" / "template.json"
        target.write_text(json.dumps(template))
        command = [sys.executable, "-B", str(VALIDATOR), "--root", str(self.fixture.root), "--record", str(target)]
        self.assertNotEqual(0, subprocess.run(command, capture_output=True).returncode)

    def test_portable_copy_with_spaces_and_different_cwd(self):
        portable_parent = Path(self.fixture.temp.name) / "portable repo with spaces" / ".claude" / "skills"
        copied = portable_parent / "project-work-companion"
        portable_parent.mkdir(parents=True)
        shutil.copytree(SKILL, copied)
        result = self.fixture.run(copied / "scripts" / "validate_record.py", cwd=Path(self.fixture.temp.name))
        self.assertCode(0, result)

    def test_portable_dependency_and_alpha_contract_are_explicit(self):
        skill = (SKILL / "SKILL.md").read_text()
        self.assertIn("maturity: experimental", skill)
        self.assertIn("stability: alpha", skill)
        self.assertIn("SKILL_DIR/../project-telemetry/SKILL.md", skill)
        self.assertIn("block diagnosis", skill)
        self.assertIn("Independent authorized work may continue", skill)
        self.assertIn("Never auto-install", skill)


class GuardProbeTests(unittest.TestCase):
    @unittest.skipUnless(PROBE_GUARD, "mutation probe only")
    def test_guard_rejects_mutation_fixture(self):
        fixture = Fixture("mutation fixture")
        self.addCleanup(fixture.cleanup)
        if PROBE_GUARD == "route":
            fixture.record["routes"] = fixture.record["routes"][:1]
        elif PROBE_GUARD == "preflight":
            del fixture.record["preflight"]["environment"]
        elif PROBE_GUARD == "checkpoint":
            fixture.pause(checkpoint_valid=False)
        elif PROBE_GUARD == "receipt":
            receipt = fixture.root / "evidence" / "receipt.md"
            receipt.write_text(receipt.read_text().replace("Verdict: pass", "Verdict: fail"))
            fixture.record["receipts"][0]["sha256"] = digest(receipt)
        else:
            self.fail(f"unknown probe guard {PROBE_GUARD}")
        self.assertEqual(1, fixture.run(PROBE_VALIDATOR, expectations=PROBE_GUARD != "checkpoint").returncode)


class MutationKillTests(unittest.TestCase):
    MUTATIONS = {
        "route": ('"route": _guard_route,', '"route": lambda record, ctx: True,'),
        "preflight": ('"preflight": _guard_preflight,', '"preflight": lambda record, ctx: True,'),
        "checkpoint": ('"checkpoint": _guard_checkpoint,', '"checkpoint": lambda record, ctx: True,'),
        "receipt": ('"receipt": _guard_receipts,', '"receipt": lambda record, ctx: True,'),
    }

    def test_four_real_guard_mutations_are_killed(self):
        with tempfile.TemporaryDirectory() as temp:
            copied = Path(temp) / "mutated skill"
            shutil.copytree(SKILL, copied)
            target = copied / "scripts" / "validate_record.py"
            original = target.read_bytes()
            test_name = f"{__name__}.GuardProbeTests.test_guard_rejects_mutation_fixture"
            for guard, (needle, replacement) in self.MUTATIONS.items():
                target.write_bytes(original)
                env = os.environ.copy()
                env.update({"PWC_GUARD": guard, "PWC_VALIDATOR": str(VALIDATOR)})
                fixed = subprocess.run([sys.executable, "-B", "-m", "unittest", test_name],
                                       cwd=Path(__file__).parent, env=env, capture_output=True)
                self.assertEqual(0, fixed.returncode, fixed.stderr.decode())
                changed = original.replace(needle.encode(), replacement.encode())
                self.assertNotEqual(original, changed, f"{guard} mutation did not change bytes")
                target.write_bytes(changed)
                env["PWC_VALIDATOR"] = str(target)
                killed = subprocess.run([sys.executable, "-B", "-m", "unittest", test_name],
                                        cwd=Path(__file__).parent, env=env, capture_output=True)
                self.assertNotEqual(0, killed.returncode, f"{guard} mutation survived")


if __name__ == "__main__":
    unittest.main()
