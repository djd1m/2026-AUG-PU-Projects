#!/usr/bin/env python3
"""Quote-provenance tests, including the ADR-001 red-first A1 fixture."""

import sys

sys.dont_write_bytecode = True

import hashlib
import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout

import check_report_evidence as gate
import evidence_fetch as evidence_fetch
import quote_provenance as quote_provenance


def _record(body, content_type="text/plain; charset=utf-8"):
    return evidence_fetch.FetchRecord(
        url="https://example.test/source",
        final_url="https://example.test/source",
        status=200,
        sha256_body=hashlib.sha256(body).hexdigest(),
        bytes_len=len(body),
        fetched_at="2026-09-02T00:00:00Z",
        content_type=content_type,
        witness=evidence_fetch._FETCH_WITNESS,
    )


def _fact(quote, body_hash, acquisition="raw-fetch", excerpt_id="excerpt.json"):
    return {
        "claim": quote,
        "source_url": "https://example.test/source",
        "evidence_class": "FETCH_VERIFIED",
        "schema_version": 4,
        "quote": quote,
        "acquisition": acquisition,
        "sha256_body": body_hash,
        "locator": "paragraph 1",
        "excerpt_id": excerpt_id,
    }


def _excerpt(text, body_hash, content_type="text/plain; charset=utf-8"):
    return {
        "sha256_body": body_hash,
        "fetched_at": "2026-09-02T00:00:00Z",
        "source_url": "https://example.test/source",
        "excerpt": text,
        "excerpt_offset": 0,
        "radius_chars": 500,
        "encoding": "utf-8",
        "content_type": content_type,
        "sha256_excerpt": hashlib.sha256(text.encode("utf-8")).hexdigest(),
    }


class QuoteGateRedFirstTests(unittest.TestCase):
    def test_report_quote_absent_from_source_body_is_named_violation(self):
        body = b"The preserved source discusses iron status and recovery."
        excerpt = body.decode("utf-8")
        body_hash = hashlib.sha256(body).hexdigest()
        excerpt_id = "a1.json"
        quote = "The source explicitly recommends immediate supplementation"
        fact = _fact(quote, body_hash, excerpt_id=excerpt_id)
        report = (
            'The source states "The source explicitly recommends immediate '
            'supplementation" in its recommendation.'
        )

        with tempfile.TemporaryDirectory() as tmp:
            with open(os.path.join(tmp, excerpt_id), "w", encoding="utf-8") as handle:
                json.dump(
                    _excerpt(excerpt, body_hash),
                    handle,
                )
            findings, _ = gate.evaluate_quotes(report, [fact], tmp)

            report_path = os.path.join(tmp, "report.md")
            facts_path = os.path.join(tmp, "facts.json")
            with open(report_path, "w", encoding="utf-8") as handle:
                handle.write(report)
            with open(facts_path, "w", encoding="utf-8") as handle:
                json.dump([fact], handle)
            output = io.StringIO()
            with redirect_stdout(output):
                exit_code = gate.main([
                    "--report", report_path,
                    "--facts", facts_path,
                    "--excerpts", tmp,
                    "--json",
                ])

        self.assertEqual([finding.kind for finding in findings], ["QUOTE_NOT_IN_SOURCE"])
        self.assertIn(fact["quote"], findings[0].detail)
        self.assertEqual(exit_code, 1)
        payload = json.loads(output.getvalue())
        self.assertIn("QUOTE_NOT_IN_SOURCE", [finding["kind"] for finding in payload["findings"]])
        self.assertEqual(payload["counts"]["quote-not-in-excerpt"], 1)

    def test_present_control_and_tool_summary_ceiling(self):
        quote = "The source explicitly recommends gradual refeeding"
        body = quote.encode("utf-8")
        body_hash = hashlib.sha256(body).hexdigest()
        excerpt = _excerpt(quote, body_hash)
        with tempfile.TemporaryDirectory() as tmp:
            for excerpt_id in ("present.json", "summary.json"):
                with open(os.path.join(tmp, excerpt_id), "w", encoding="utf-8") as handle:
                    json.dump(excerpt, handle)
            present_findings, present_counts = gate.evaluate_quotes(
                f'The report says "{quote}".',
                [_fact(quote, body_hash, excerpt_id="present.json")],
                tmp,
            )
            summary_findings, _ = gate.evaluate_quotes(
                f'The report says "{quote}".',
                [_fact(quote, body_hash, acquisition="tool-summary", excerpt_id="summary.json")],
                tmp,
            )
        self.assertEqual(present_findings, [])
        self.assertEqual(present_counts["quote-verbatim-confirmed"], 1)
        self.assertEqual([finding.kind for finding in summary_findings], ["QUOTE_METHOD_INELIGIBLE"])
        self.assertIn("tool-summary", summary_findings[0].detail)


class QuoteRecordTests(unittest.TestCase):
    def test_closed_acquisition_vocabulary_and_no_writable_verdict(self):
        fields = quote_provenance.QuoteRecord.__dataclass_fields__
        self.assertNotIn("verbatim_status", fields)
        with self.assertRaisesRegex(ValueError, "closed set"):
            quote_provenance.QuoteRecord("valid quote", "Raw-Download", "u", "a" * 64)
        with self.assertRaisesRegex(ValueError, "closed set"):
            quote_provenance.QuoteRecord("valid quote", "webfetch", "u", "a" * 64)
        with self.assertRaisesRegex(ValueError, "non-blank"):
            quote_provenance.QuoteRecord("  ", "raw-fetch", "u", "a" * 64)

    def test_unknown_or_absent_method_is_honest_fifth_read_state(self):
        for value in (None, "Raw-Fetch", "webfetch", ""):
            with self.subTest(value=value):
                self.assertEqual(quote_provenance.read_acquisition(value), "method-unknown")

    def test_legacy_quote_is_denied_without_regrading_other_trust_fields(self):
        quote = "A legacy quoted phrase long enough for the gate"
        legacy = {
            "claim": quote,
            "source_url": "https://example.test/legacy",
            "evidence_class": "FETCH_VERIFIED",
            "trust_class": "SELF_ATTESTED",
            "confidence": 0.4,
            "schema_version": 3,
            "quote": quote,
        }
        trust_before = {key: legacy[key] for key in ("evidence_class", "trust_class", "confidence")}
        findings, counts = gate.evaluate_quotes(f'The report says "{quote}".', [legacy], "unused")
        self.assertEqual([finding.kind for finding in findings], ["QUOTE_NO_EXCERPT"])
        self.assertIn("unverified", findings[0].detail)
        self.assertEqual(counts["quote-method-unknown"], 1)
        self.assertEqual(
            {key: legacy[key] for key in ("evidence_class", "trust_class", "confidence")},
            trust_before,
        )


class VerbatimPolicyTests(unittest.TestCase):
    def setUp(self):
        self.text = 'The source says “iron\u00a0status & recovery” — exactly.'
        self.body_hash = hashlib.sha256(self.text.encode("utf-8")).hexdigest()
        self.excerpt = _excerpt(self.text, self.body_hash, "text/html; charset=utf-8")

    def fact(self, **overrides):
        fact = _fact('iron status &amp; recovery" - exactly', self.body_hash, excerpt_id="x.json")
        fact.update(overrides)
        return fact

    def test_closed_verdict_set_and_normalized_exact_match(self):
        self.assertEqual(
            quote_provenance.VERBATIM_VERDICTS,
            ("verbatim-confirmed", "not-in-excerpt", "no-excerpt", "method-ineligible",
             "hash-mismatch", "method-unknown"),
        )
        verdict = quote_provenance.verify_verbatim(
            'iron status &amp; recovery" - exactly', self.excerpt, self.fact()
        )
        self.assertEqual(verdict, "verbatim-confirmed")

    def test_overlap_paraphrase_does_not_count_as_verbatim(self):
        verdict = quote_provenance.verify_verbatim(
            "iron status recovery was described exactly", self.excerpt, self.fact()
        )
        self.assertEqual(verdict, "not-in-excerpt")

    def test_search_listing_and_manual_need_the_same_reconciliation(self):
        span = 'iron status &amp; recovery" - exactly'
        for acquisition in ("search-listing", "manual"):
            with self.subTest(acquisition=acquisition):
                self.assertEqual(
                    quote_provenance.verify_verbatim(
                        span, self.excerpt, self.fact(acquisition=acquisition)
                    ),
                    "verbatim-confirmed",
                )
                self.assertEqual(
                    quote_provenance.verify_verbatim(span, None, self.fact(acquisition=acquisition)),
                    "no-excerpt",
                )

    def test_every_refusal_verdict_is_reachable(self):
        cases = (
            (None, self.fact(), "no-excerpt"),
            (self.excerpt, self.fact(acquisition="tool-summary"), "method-ineligible"),
            (dict(self.excerpt, sha256_excerpt="0" * 64), self.fact(), "hash-mismatch"),
            (self.excerpt, self.fact(acquisition=None), "method-unknown"),
        )
        for excerpt, fact, expected in cases:
            with self.subTest(expected=expected):
                self.assertEqual(quote_provenance.verify_verbatim("anything at all", excerpt, fact), expected)

    def test_quote_found_only_across_join_of_two_excerpts_is_rejected(self):
        leaves = [
            _excerpt("boundary phrase begins", self.body_hash),
            _excerpt(" and ends here", self.body_hash),
        ]
        verdict = quote_provenance.verify_verbatim(
            "phrase begins and ends", leaves, self.fact()
        )
        self.assertEqual(verdict, "not-in-excerpt", "a JOIN of excerpt leaves is never searched")


class CaptureTests(unittest.TestCase):
    def test_capture_round_trip_is_bounded_and_self_ignoring(self):
        quote = "bounded phrase copied exactly from source bytes"
        body = (("prefix " * 500) + quote + (" suffix" * 500)).encode("utf-8")
        record = _record(body)
        captured = quote_provenance.capture_excerpt(body, quote, record)
        self.assertLessEqual(len(captured["excerpt"]), quote_provenance.EXCERPT_MAX_CHARS)
        self.assertNotEqual(captured["excerpt"].encode("utf-8"), body)
        fact = _fact(quote, record.sha256_body, excerpt_id=captured["excerpt_id"])
        with tempfile.TemporaryDirectory() as tmp:
            path = quote_provenance.write_excerpt(tmp, captured)
            loaded = quote_provenance.load_excerpt(tmp, captured["excerpt_id"])
            self.assertTrue(os.path.exists(os.path.join(tmp, ".gitignore")))
            with open(os.path.join(tmp, ".gitignore"), encoding="utf-8") as handle:
                self.assertEqual(handle.read(), "*\n")
            self.assertEqual(path, os.path.join(tmp, captured["excerpt_id"]))
        self.assertEqual(quote_provenance.verify_verbatim(quote, loaded, fact), "verbatim-confirmed")

    def test_forged_excerpt_and_wrong_source_body_are_refused(self):
        quote = "captured phrase"
        body = quote.encode("utf-8")
        record = _record(body)
        with self.assertRaisesRegex(quote_provenance.ExcerptCaptureRefused, "hash-mismatch"):
            quote_provenance.capture_excerpt(body + b" forged", quote, record)
        captured = quote_provenance.capture_excerpt(body, quote, record)
        captured["excerpt"] = "author supplied captured phrase"
        fact = _fact(quote, record.sha256_body, excerpt_id=captured["excerpt_id"])
        self.assertEqual(quote_provenance.verify_verbatim(quote, captured, fact), "hash-mismatch")

    def test_non_text_and_undecodable_bodies_refuse_by_name(self):
        pdf = b"%PDF-1.7 quoted phrase"
        with self.assertRaisesRegex(quote_provenance.ExcerptCaptureRefused, "non-text"):
            quote_provenance.capture_excerpt(pdf, "quoted phrase", _record(pdf, "application/pdf"))
        invalid = b"quoted phrase \xff"
        with self.assertRaisesRegex(quote_provenance.ExcerptCaptureRefused, "undecodable"):
            quote_provenance.capture_excerpt(
                invalid, "quoted phrase", _record(invalid, "text/plain; charset=ascii")
            )


if __name__ == "__main__":
    unittest.main()
