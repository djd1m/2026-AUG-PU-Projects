#!/usr/bin/env python3
"""Read-only structural validator for a project-work-companion record."""

import argparse
import json
import sys
from pathlib import Path

from record_support import (
    Context, DuplicateKey, expect_launch as _expect_launch,
    guard_preflight as _guard_preflight, list_value as _list,
    nonempty as _nonempty, object_value as _dict, read_headers as _headers,
    read_json as _json,
    safe_root as _safe_root, sha256 as _sha256, strings as _strings,
    substantive_receipt_payload as _receipt_payload,
    supported_delivery_uri as _supported_uri, timestamp as _timestamp,
)


STAGES = ("prepare", "plan", "approved", "preflight", "implement", "paused", "delivered")
COVERS = {"plan", "team", "roles", "models", "skills"}


def _effective_stage(record, ctx):
    stage = record.get("stage")
    if stage not in STAGES:
        ctx.error("stage: unsupported value")
        return "prepare"
    if stage != "paused":
        return stage
    pause = record.get("pause")
    if not isinstance(pause, dict) or pause.get("from_stage") not in STAGES[1:6]:
        ctx.error("pause.from_stage: required stage before delivered")
        return "prepare"
    return pause["from_stage"]


def _guard_route(record, ctx):
    routes = _list(record.get("routes"), "routes", ctx)
    by_phase = {}
    for index, route_value in enumerate(routes):
        route = _dict(route_value, f"routes[{index}]", ctx)
        phase = route.get("phase")
        if phase not in ("plan", "implementation") or phase in by_phase:
            ctx.error(f"routes[{index}].phase: expected unique plan/implementation")
            continue
        by_phase[phase] = route
        for key in ("scope_revision", "tier", "rationale"):
            _nonempty(route.get(key), f"routes[{index}].{key}", ctx)
        prepare = record.get("prepare") if isinstance(record.get("prepare"), dict) else {}
        if route.get("scope_revision") != prepare.get("scope_revision"):
            ctx.error(f"routes[{index}].scope_revision: differs from prepared scope")
        script = _dict(route.get("script"), f"routes[{index}].script", ctx)
        _nonempty(script.get("input"), f"routes[{index}].script.input", ctx)
        if type(script.get("exit_code")) is not int or script.get("exit_code") not in (0, 1):
            ctx.error(f"routes[{index}].script.exit_code: must be 0 or 1, never unchecked 2")
    needed = {"plan"}
    effective = _effective_stage(record, ctx)
    if STAGES.index(effective) >= STAGES.index("preflight"):
        needed.add("implementation")
    for phase in needed - set(by_phase):
        ctx.error(f"routes: missing {phase} route for stage")
    return True


def _guard_checkpoint(record, ctx):
    if record.get("stage") != "paused":
        if record.get("pause") is not None:
            ctx.error("pause: only applicable to paused stage")
        return True
    pause = _dict(record.get("pause"), "pause", ctx)
    _nonempty(pause.get("next_allowed_step"), "pause.next_allowed_step", ctx)
    identity = record.get("identity") if isinstance(record.get("identity"), dict) else {}
    source = record.get("source") if isinstance(record.get("source"), dict) else {}
    for key in ("run_id", "work_unit_id"):
        if pause.get(key) != identity.get(key):
            ctx.error(f"pause.{key}: must preserve record identity")
    if pause.get("source_revision") != source.get("current_revision"):
        ctx.error("pause.source_revision: must preserve current source")
    _strings(pause.get("blockers"), "pause.blockers", ctx, allow_empty=True)
    _strings(pause.get("approval_ids"), "pause.approval_ids", ctx, allow_empty=True)
    approval = record.get("approval") if isinstance(record.get("approval"), dict) else {}
    evidence = approval.get("evidence") if isinstance(approval.get("evidence"), dict) else {}
    if approval.get("requirement") == "required" and evidence.get("id") not in pause.get("approval_ids", []):
        ctx.error("pause.approval_ids: applicable approval must be preserved")
    mode = pause.get("continuation_mode")
    checkpoint = _dict(pause.get("checkpoint"), "pause.checkpoint", ctx)
    if mode == "checkpoint":
        path = ctx.pathref(checkpoint.get("path"), "pause.checkpoint.path")
        digest = _nonempty(checkpoint.get("sha256"), "pause.checkpoint.sha256", ctx)
        if path and digest and _sha256(path) != digest:
            ctx.error("pause.checkpoint.sha256: digest mismatch")
    elif mode == "handoff":
        if checkpoint.get("status") != "not_applicable":
            ctx.error("pause.checkpoint.status: handoff requires not_applicable")
        _nonempty(checkpoint.get("reason"), "pause.checkpoint.reason", ctx)
    else:
        ctx.error("pause.continuation_mode: expected checkpoint or handoff")
    return True


def _guard_receipts(record, ctx):
    if record.get("stage") != "delivered":
        if record.get("delivery") is not None or record.get("receipts"):
            ctx.error("delivery/receipts: only applicable to delivered stage")
        return True
    expected = ctx.expected
    for key in ("run_id", "work_unit_id", "source_revision", "build_revision"):
        if not expected.get(key):
            ctx.missing(f"authoritative expectation unavailable: {key}")
    receipts = _list(record.get("receipts"), "receipts", ctx)
    if not receipts:
        ctx.error("receipts: delivered stage requires evidence")
    ids, work_ids, paths = set(), set(), set()
    known_units = {x.get("id") for x in record.get("work_units", []) if isinstance(x, dict) and isinstance(x.get("id"), str)}
    for index, value in enumerate(receipts):
        item = _dict(value, f"receipts[{index}]", ctx)
        rid = _nonempty(item.get("id"), f"receipts[{index}].id", ctx)
        work_id = _nonempty(item.get("work_id"), f"receipts[{index}].work_id", ctx)
        if rid in ids or work_id in work_ids:
            ctx.error(f"receipts[{index}]: duplicate receipt id or work ID")
        if work_id not in known_units:
            ctx.error(f"receipts[{index}]: work ID is not declared in work_units")
        ids.add(rid); work_ids.add(work_id)
        receipt = ctx.pathref(item.get("path"), f"receipts[{index}].path")
        launch = ctx.pathref(item.get("launch_path"), f"receipts[{index}].launch_path")
        for path in (receipt, launch):
            if path and path in paths:
                ctx.error(f"receipts[{index}]: duplicate evidence path")
            paths.add(path)
        receipt_digest = item.get("sha256")
        launch_digest = item.get("launch_sha256")
        if receipt and _nonempty(receipt_digest, f"receipts[{index}].sha256", ctx) and _sha256(receipt) != receipt_digest:
            ctx.error(f"receipts[{index}].sha256: digest mismatch")
        if launch and _nonempty(launch_digest, f"receipts[{index}].launch_sha256", ctx) and _sha256(launch) != launch_digest:
            ctx.error(f"receipts[{index}].launch_sha256: digest mismatch")
        known_launches = expected.get("launches", {})
        if work_id not in known_launches:
            ctx.missing(f"receipts[{index}]: caller-known launch digest unavailable")
        elif known_launches[work_id] != launch_digest:
            ctx.error(f"receipts[{index}]: launch digest differs from caller expectation")
        if not receipt or not launch:
            continue
        try:
            launch_data = _json(launch)
        except (OSError, UnicodeError, json.JSONDecodeError, DuplicateKey) as exc:
            ctx.error(f"receipts[{index}].launch: invalid JSON: {exc}")
            continue
        launch_data = _dict(launch_data, f"receipts[{index}].launch", ctx)
        fields, body = _headers(receipt, ctx, f"receipts[{index}]")
        mappings = {
            "Run-ID": "run_id", "Work-Unit-ID": "work_unit_id", "Attempt-ID": "attempt_id",
            "Source-Revision": "source_revision", "Build-Revision": "build_revision",
        }
        for header, key in mappings.items():
            if fields.get(header) != launch_data.get(key):
                ctx.error(f"receipts[{index}]: {header} does not match launch")
        if fields.get("Launch-SHA256") != launch_digest:
            ctx.error(f"receipts[{index}]: launch digest provenance mismatch")
        if launch_data.get("trace") != item.get("path"):
            ctx.error(f"receipts[{index}]: launch trace path differs from indexed receipt")
        terminal = body.rstrip().splitlines()[-1] if body.strip() else ""
        if len(_receipt_payload(body)) < 20:
            ctx.error(f"receipts[{index}]: receipt has no substantive narrative")
        if fields.get("Verdict") != "pass" or terminal != "Status: completed":
            ctx.error(f"receipts[{index}]: pass verdict and terminal completion are both required")
        started, finished = _timestamp(launch_data.get("launched_at")), _timestamp(fields.get("Finished-At"))
        if not started or not finished or finished < started:
            ctx.error(f"receipts[{index}]: invalid launch/finish freshness")
        if launch_data.get("trace_prelaunch") != {"exists": False, "sha256": None}:
            ctx.error(f"receipts[{index}]: launch does not prove absent pre-launch trace")
        if receipt.stat().st_mtime_ns < launch.stat().st_mtime_ns:
            ctx.error(f"receipts[{index}]: receipt is stale relative to launch")
        if expected.get("run_id") and launch_data.get("run_id") != expected["run_id"]:
            ctx.error(f"receipts[{index}]: run differs from caller expectation")
        if work_id and launch_data.get("work_unit_id") != work_id:
            ctx.error(f"receipts[{index}]: indexed work ID differs from launch")
        if expected.get("source_revision") and launch_data.get("source_revision") != expected["source_revision"]:
            ctx.error(f"receipts[{index}]: source differs from caller expectation")
        if expected.get("build_revision") and launch_data.get("build_revision") != expected["build_revision"]:
            ctx.error(f"receipts[{index}]: build differs from caller expectation")
    _validate_delivery(record, ctx, ids)
    return True


GUARDS = {
    "route": _guard_route,
    "preflight": _guard_preflight,
    "checkpoint": _guard_checkpoint,
    "receipt": _guard_receipts,
}


def _validate_delivery(record, ctx, receipt_ids):
    delivery = _dict(record.get("delivery"), "delivery", ctx)
    uri = _nonempty(delivery.get("uri"), "delivery.uri", ctx)
    if uri and not _supported_uri(uri):
        ctx.error("delivery.uri: supported absolute HTTP(S) URL or URN required")
    scope = _dict(delivery.get("scope"), "delivery.scope", ctx)
    _strings(scope.get("included"), "delivery.scope.included", ctx)
    _strings(scope.get("excluded"), "delivery.scope.excluded", ctx, allow_empty=True)
    build = _dict(delivery.get("build"), "delivery.build", ctx)
    for key in ("source_revision", "build_revision"):
        _nonempty(build.get(key), f"delivery.build.{key}", ctx)
        if ctx.expected.get(key) and build.get(key) != ctx.expected[key]:
            ctx.error(f"delivery.build.{key}: differs from caller expectation")
    evidence = _strings(delivery.get("evidence"), "delivery.evidence", ctx)
    if set(evidence) != receipt_ids:
        ctx.error("delivery.evidence: must name every and only indexed receipt")
    for index, value in enumerate(_list(delivery.get("pending"), "delivery.pending", ctx)):
        item = _dict(value, f"delivery.pending[{index}]", ctx)
        _nonempty(item.get("item"), f"delivery.pending[{index}].item", ctx)
        _nonempty(item.get("reason"), f"delivery.pending[{index}].reason", ctx)
        if item.get("scope") != "out_of_scope":
            ctx.error(f"delivery.pending[{index}]: pending accepted-scope work blocks delivery")
    e2e_claim = delivery.get("e2e_claim")
    if e2e_claim is not None:
        if e2e_claim != "pass":
            ctx.error("delivery.e2e_claim: only an explicit pass claim is supported")
        preflight = record.get("preflight")
        if not isinstance(preflight, dict) or preflight.get("status") != "ready":
            ctx.error("delivery.e2e_claim: ready preflight is required before an E2E claim")


def validate(record, ctx):
    if record.get("schema_version") != 1 or record.get("record_kind") != "project-work-companion/work-record":
        ctx.error("record schema/version unsupported")
    if record.get("roots") != {"project": "."}:
        ctx.error("roots: exactly {'project': '.'} required")
    identity = _dict(record.get("identity"), "identity", ctx)
    for key in ("run_id", "work_unit_id", "current_attempt_id"):
        _nonempty(identity.get(key), f"identity.{key}", ctx)
        if ctx.expected.get(key) and identity.get(key) != ctx.expected[key]:
            ctx.error(f"identity.{key}: differs from caller expectation")
    telemetry = _dict(record.get("telemetry"), "telemetry", ctx)
    ctx.pathref(telemetry.get("run"), "telemetry.run")
    ctx.pathref(telemetry.get("events"), "telemetry.events")
    source = _dict(record.get("source"), "source", ctx)
    for key in ("baseline_revision", "current_revision"):
        _nonempty(source.get(key), f"source.{key}", ctx)
    if source.get("build_revision") is not None:
        _nonempty(source.get("build_revision"), "source.build_revision", ctx)
    for key in ("requirements", "architecture"):
        refs = _list(source.get(key), f"source.{key}", ctx)
        if not refs:
            ctx.error(f"source.{key}: at least one document required")
        for index, ref in enumerate(refs):
            ctx.pathref(ref, f"source.{key}[{index}]")
    continuity = _dict(source.get("continuity"), "source.continuity", ctx)
    expected_revision = _nonempty(continuity.get("expected_revision"), "source.continuity.expected_revision", ctx)
    observed_revision = _nonempty(continuity.get("observed_revision"), "source.continuity.observed_revision", ctx)
    if observed_revision and source.get("current_revision") != observed_revision:
        ctx.error("source.current_revision: must equal continuity observed revision")
    if expected_revision != observed_revision:
        reconciliation = _dict(continuity.get("reconciliation"), "source.continuity.reconciliation", ctx)
        if reconciliation.get("status") != "completed":
            ctx.error("source.continuity.reconciliation: drift requires completed reconciliation")
        for key in ("impact", "decision"):
            _nonempty(reconciliation.get(key), f"source.continuity.reconciliation.{key}", ctx)
        affected = _strings(reconciliation.get("affected_checks"), "source.continuity.reconciliation.affected_checks", ctx)
        rerun = _strings(reconciliation.get("rerun"), "source.continuity.reconciliation.rerun", ctx, allow_empty=True)
        pending = _strings(reconciliation.get("pending"), "source.continuity.reconciliation.pending", ctx, allow_empty=True)
        if record.get("stage") == "delivered" and (set(affected) - set(rerun) or pending):
            ctx.error("source.continuity.reconciliation: delivery requires all affected checks rerun and none pending")
    elif continuity.get("reconciliation") is not None:
        ctx.error("source.continuity.reconciliation: must be null without drift")
    _validate_prepare(record, ctx)
    _validate_approval(record, ctx)
    _validate_attempts_and_units(record, ctx)
    for guard in GUARDS.values():
        guard(record, ctx)
    _validate_checks(record, ctx)


def _validate_prepare(record, ctx):
    prepare = _dict(record.get("prepare"), "prepare", ctx)
    _nonempty(prepare.get("scope_revision"), "prepare.scope_revision", ctx)
    for key in ("scope", "exclusions", "action_limits"):
        _strings(prepare.get(key), f"prepare.{key}", ctx)
    criteria = _list(prepare.get("acceptance_criteria"), "prepare.acceptance_criteria", ctx)
    criterion_ids = []
    for index, value in enumerate(criteria):
        item = _dict(value, f"prepare.acceptance_criteria[{index}]", ctx)
        criterion_ids.append(_nonempty(item.get("id"), f"prepare.acceptance_criteria[{index}].id", ctx))
        if type(item.get("required")) is not bool:
            ctx.error(f"prepare.acceptance_criteria[{index}].required: expected boolean")
    if not criteria or len(set(criterion_ids)) != len(criterion_ids):
        ctx.error("prepare.acceptance_criteria: non-empty unique IDs required")
    donors = _list(prepare.get("donors"), "prepare.donors", ctx)
    if not donors:
        ctx.error("prepare.donors: record at least an explicit no-donor decision")
    for index, value in enumerate(donors):
        donor = _dict(value, f"prepare.donors[{index}]", ctx)
        source = _dict(donor.get("source"), f"prepare.donors[{index}].source", ctx)
        if source.get("kind") == "local":
            ctx.pathref(source.get("path"), f"prepare.donors[{index}].source.path")
        elif source.get("kind") == "none":
            if source.get("path") is not None:
                ctx.error(f"prepare.donors[{index}].source.path: explicit none must be null")
        else:
            ctx.error(f"prepare.donors[{index}].source.kind: expected local or none")
        for key in ("provenance", "useful_fragment", "compatibility", "reason"):
            _nonempty(donor.get(key), f"prepare.donors[{index}].{key}", ctx)
        if donor.get("decision") not in ("use", "adapt", "reject"):
            ctx.error(f"prepare.donors[{index}].decision: unsupported value")
        compatibility = donor.get("compatibility")
        if compatibility not in ("compatible", "partial", "incompatible", "not_applicable"):
            ctx.error(f"prepare.donors[{index}].compatibility: unsupported value")
        if compatibility == "incompatible" and donor.get("decision") != "reject":
            ctx.error(f"prepare.donors[{index}]: incompatible donor must be rejected")
    forecast = _dict(prepare.get("forecast"), "prepare.forecast", ctx)
    if forecast.get("status") not in ("estimated", "insufficient_data"):
        ctx.error("prepare.forecast.status: unsupported value")
    _nonempty(forecast.get("method"), "prepare.forecast.method", ctx)
    if forecast.get("scope_revision") != prepare.get("scope_revision"):
        ctx.error("prepare.forecast.scope_revision: differs from prepared scope")
    for key in ("comparable_run_ids", "exclusions", "external_expectations"):
        _strings(forecast.get(key), f"prepare.forecast.{key}", ctx, allow_empty=True)
    if forecast.get("status") == "insufficient_data" and any(forecast.get(k) is not None for k in ("range", "usage", "cost")):
        ctx.error("prepare.forecast: insufficient data must keep range/usage/cost null")
    calibration = forecast.get("calibration")
    if forecast.get("status") == "insufficient_data" and calibration != "not_applicable":
        ctx.error("prepare.forecast.calibration: insufficient data requires not_applicable")
    if forecast.get("status") == "estimated":
        if calibration not in ("source_backed", "uncalibrated_expert"):
            ctx.error("prepare.forecast.calibration: estimated range must disclose its basis")
        range_value = _dict(forecast.get("range"), "prepare.forecast.range", ctx)
        for key in ("lower", "upper"):
            if type(range_value.get(key)) not in (int, float):
                ctx.error(f"prepare.forecast.range.{key}: expected measured number")
        if all(type(range_value.get(k)) in (int, float) for k in ("lower", "upper")) and range_value["lower"] > range_value["upper"]:
            ctx.error("prepare.forecast.range: lower may not exceed upper")
        _nonempty(range_value.get("unit"), "prepare.forecast.range.unit", ctx)
        if calibration == "source_backed" and not forecast.get("comparable_run_ids"):
            ctx.error("prepare.forecast: source-backed estimate requires comparable RUN_IDs")


def _validate_approval(record, ctx):
    approval = _dict(record.get("approval"), "approval", ctx)
    requirement = approval.get("requirement")
    if requirement not in ("required", "not_required"):
        ctx.error("approval.requirement: expected required or not_required")
    _nonempty(approval.get("reason"), "approval.reason", ctx)
    effective = _effective_stage(record, ctx)
    evidence = approval.get("evidence")
    if requirement == "required" and STAGES.index(effective) >= STAGES.index("approved"):
        evidence = _dict(evidence, "approval.evidence", ctx)
        _nonempty(evidence.get("id"), "approval.evidence.id", ctx)
        if evidence.get("plan_revision") != _dict(record.get("prepare"), "prepare", ctx).get("scope_revision"):
            ctx.error("approval.evidence.plan_revision: does not cover current plan")
        if set(_strings(evidence.get("covers"), "approval.evidence.covers", ctx)) != COVERS:
            ctx.error("approval.evidence.covers: must explicitly cover plan/team/roles/models/skills")
        path = ctx.pathref(evidence.get("path"), "approval.evidence.path")
        digest = _nonempty(evidence.get("sha256"), "approval.evidence.sha256", ctx)
        if path and digest and _sha256(path) != digest:
            ctx.error("approval.evidence.sha256: digest mismatch")
    elif requirement == "not_required" and evidence is not None:
        ctx.error("approval.evidence: omit evidence when explicitly not required")


def _validate_attempts_and_units(record, ctx):
    attempts = _list(record.get("attempts"), "attempts", ctx)
    ids = []
    for index, value in enumerate(attempts):
        item = _dict(value, f"attempts[{index}]", ctx)
        ids.append(_nonempty(item.get("id"), f"attempts[{index}].id", ctx))
        if item.get("status") not in ("active", "paused", "interrupted", "completed", "failed"):
            ctx.error(f"attempts[{index}].status: unsupported value")
    identity = record.get("identity") if isinstance(record.get("identity"), dict) else {}
    if not attempts or len(set(ids)) != len(ids) or identity.get("current_attempt_id") not in ids:
        ctx.error("attempts: unique history must contain current attempt")
    units = _list(record.get("work_units"), "work_units", ctx)
    unit_ids, owned = [], set()
    for index, value in enumerate(units):
        unit = _dict(value, f"work_units[{index}]", ctx)
        unit_ids.append(_nonempty(unit.get("id"), f"work_units[{index}].id", ctx))
        for pindex, ref in enumerate(_list(unit.get("paths"), f"work_units[{index}].paths", ctx)):
            path = ctx.pathref(ref, f"work_units[{index}].paths[{pindex}]", must_exist=False)
            if path in owned:
                ctx.error(f"work_units[{index}].paths[{pindex}]: duplicate owned path")
            owned.add(path)
    if not units or len(set(unit_ids)) != len(unit_ids):
        ctx.error("work_units: non-empty unique work IDs required")


def _validate_checks(record, ctx):
    checks = _list(record.get("checks"), "checks", ctx)
    if record.get("stage") != "delivered":
        return
    criteria = record.get("prepare", {}).get("acceptance_criteria", []) if isinstance(record.get("prepare"), dict) else []
    required = {x.get("id") for x in criteria if isinstance(x, dict) and x.get("required") is True}
    receipt_ids = {x.get("id") for x in record.get("receipts", []) if isinstance(x, dict)}
    seen = set()
    for index, value in enumerate(checks):
        check = _dict(value, f"checks[{index}]", ctx)
        cid = check.get("ac_id"); seen.add(cid)
        if cid in required:
            if check.get("outcome") != "pass" or type(check.get("exit_code")) is not int:
                ctx.error(f"checks[{index}]: required AC must pass with measured exit code")
            for key in ("command", "source_revision", "receipt_id"):
                _nonempty(check.get(key), f"checks[{index}].{key}", ctx)
            if ctx.expected.get("source_revision") and check.get("source_revision") != ctx.expected["source_revision"]:
                ctx.error(f"checks[{index}]: source differs from caller expectation")
            if check.get("receipt_id") not in receipt_ids:
                ctx.error(f"checks[{index}]: receipt not indexed")
        elif check.get("outcome") == "unknown" and check.get("exit_code") is not None:
            ctx.error(f"checks[{index}]: unknown outcome must keep exit_code null")
    if seen != required:
        ctx.error("checks: must map every and only required AC")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True)
    parser.add_argument("--record", required=True)
    parser.add_argument("--expect-run-id")
    parser.add_argument("--expect-work-unit-id")
    parser.add_argument("--expect-source-revision")
    parser.add_argument("--expect-build-revision")
    parser.add_argument("--expect-launch", action="append", default=[])
    args = parser.parse_args(argv)
    try:
        root = _safe_root(args.root)
        record_path = Path(args.record)
        if not record_path.is_absolute():
            record_path = root / record_path
        relative = record_path.relative_to(root)
        bootstrap = Context(root, {})
        checked_record = bootstrap.pathref({"root": "project", "path": relative.as_posix()}, "record")
        if not checked_record:
            for message in bootstrap.errors + bootstrap.unavailable:
                print(message, file=sys.stderr)
            return 1 if bootstrap.errors else 2
        record = _json(checked_record)
        if not isinstance(record, dict):
            raise ValueError("record root must be an object")
        expected = {
            "run_id": args.expect_run_id,
            "work_unit_id": args.expect_work_unit_id,
            "source_revision": args.expect_source_revision,
            "build_revision": args.expect_build_revision,
            "launches": _expect_launch(args.expect_launch),
        }
    except (OSError, UnicodeError) as exc:
        print(f"input unavailable: {exc}", file=sys.stderr)
        return 2
    except (ValueError, json.JSONDecodeError, DuplicateKey) as exc:
        print(f"invalid input: {exc}", file=sys.stderr)
        return 1
    ctx = Context(root, expected)
    try:
        validate(record, ctx)
    except Exception as exc:  # malformed types must fail closed, never expose a traceback
        ctx.error(f"validation failed safely on malformed input: {type(exc).__name__}: {exc}")
    for message in ctx.errors:
        print(f"violation: {message}", file=sys.stderr)
    for message in ctx.unavailable:
        print(f"unavailable: {message}", file=sys.stderr)
    if ctx.errors:
        return 1
    if ctx.unavailable:
        return 2
    print("record structure verified; this is not product acceptance")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
