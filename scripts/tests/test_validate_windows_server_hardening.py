"""Unit tests for validate_windows_server_hardening report schema and check structure."""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent.parent
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures" / "bundle_integrity"


def run_validator(artifact_dir: str, output_dir: str) -> str:
    out = subprocess.run(
        [sys.executable, str(SCRIPT_DIR / "validate_windows_server_hardening.py"), artifact_dir, "-o", output_dir],
        capture_output=True,
        text=True,
        cwd=SCRIPT_DIR,
    )
    assert out.returncode == 0, (out.stderr or out.stdout)
    return output_dir


def load_report(output_dir: str) -> dict:
    path = Path(output_dir) / "validation-report-windows-hardening.json"
    assert path.is_file(), f"Report not found: {path}"
    with open(path, encoding="utf-8") as f:
        return json.load(f)


class TestWindowsHardeningReport(unittest.TestCase):
    def test_report_has_validator_block(self):
        with tempfile.TemporaryDirectory() as tmp:
            run_validator(tmp, tmp)
            report = load_report(tmp)
        self.assertIn("validator", report)
        v = report["validator"]
        self.assertEqual(v.get("name"), "validate_windows_server_hardening")
        self.assertEqual(v.get("version"), "1.1.0")
        self.assertIn("sha256", v)
        self.assertIsInstance(v["sha256"], str)
        self.assertEqual(len(v["sha256"]), 64)

    def test_report_has_inputs_array(self):
        with tempfile.TemporaryDirectory() as tmp:
            run_validator(tmp, tmp)
            report = load_report(tmp)
        self.assertIn("inputs", report)
        self.assertIsInstance(report["inputs"], list)

    def test_report_has_checks_array(self):
        with tempfile.TemporaryDirectory() as tmp:
            run_validator(tmp, tmp)
            report = load_report(tmp)
        self.assertIn("checks", report)
        self.assertIsInstance(report["checks"], list)
        self.assertGreater(len(report["checks"]), 0)

    def test_each_check_has_evidence_files_used_present_and_ordered(self):
        with tempfile.TemporaryDirectory() as tmp:
            run_validator(tmp, tmp)
            report = load_report(tmp)
        for c in report["checks"]:
            self.assertIn("evidence_files_used", c, f"Check {c.get('control')} missing evidence_files_used")
            efu = c["evidence_files_used"]
            self.assertIsInstance(efu, list, f"evidence_files_used must be list, got {type(efu)}")
            self.assertEqual(efu, sorted(efu), f"evidence_files_used must be sorted: {efu}")

    def test_provider_or_customer_enum(self):
        with tempfile.TemporaryDirectory() as tmp:
            run_validator(tmp, tmp)
            report = load_report(tmp)
        allowed = {"provider", "customer", "shared"}
        for c in report["checks"]:
            poc = c.get("provider_or_customer")
            self.assertIn(poc, allowed, f"provider_or_customer must be one of {allowed}, got {poc!r}")

    def test_layer_can_be_null_or_string(self):
        with tempfile.TemporaryDirectory() as tmp:
            run_validator(tmp, tmp)
            report = load_report(tmp)
        for c in report["checks"]:
            layer = c.get("layer")
            self.assertTrue(layer is None or isinstance(layer, str), f"layer must be null or string, got {type(layer)!r}")

    def test_check_required_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            run_validator(tmp, tmp)
            report = load_report(tmp)
        required = {"control", "pass", "observed", "expected", "evidence_hint", "evidence_files_used", "provider_or_customer"}
        for c in report["checks"]:
            for key in required:
                self.assertIn(key, c, f"Check missing required field {key}")

    def test_first_check_is_bundle_integrity(self):
        with tempfile.TemporaryDirectory() as tmp:
            run_validator(tmp, tmp)
            report = load_report(tmp)
        self.assertGreater(len(report["checks"]), 0)
        self.assertEqual(report["checks"][0]["control"], "BUNDLE.INTEGRITY")

    def test_bundle_integrity_has_details_keys(self):
        with tempfile.TemporaryDirectory() as tmp:
            run_validator(tmp, tmp)
            report = load_report(tmp)
        first = report["checks"][0]
        self.assertEqual(first["control"], "BUNDLE.INTEGRITY")
        self.assertIn("details", first)
        details = first["details"]
        for key in ("hash_file_path", "manifest_path", "total_hashed_files", "verified_ok", "missing_files", "hash_mismatches"):
            self.assertIn(key, details, f"BUNDLE.INTEGRITY details missing key {key}")

    def test_bundle_integrity_good_fixture_pass(self):
        good_dir = FIXTURES_DIR / "good"
        if not good_dir.is_dir():
            self.skipTest("fixtures/bundle_integrity/good not found")
        with tempfile.TemporaryDirectory() as tmp:
            run_validator(str(good_dir), tmp)
            report = load_report(tmp)
        first = report["checks"][0]
        self.assertEqual(first["control"], "BUNDLE.INTEGRITY")
        self.assertTrue(first["pass"], f"Good fixture should pass: {first.get('observed')}")

    def test_bundle_integrity_missing_file_fixture(self):
        missing_dir = FIXTURES_DIR / "missing_file"
        if not missing_dir.is_dir():
            self.skipTest("fixtures/bundle_integrity/missing_file not found")
        with tempfile.TemporaryDirectory() as tmp:
            run_validator(str(missing_dir), tmp)
            report = load_report(tmp)
        first = report["checks"][0]
        self.assertEqual(first["control"], "BUNDLE.INTEGRITY")
        self.assertFalse(first["pass"])
        self.assertGreater(len(first["details"]["missing_files"]), 0)

    def test_bundle_integrity_mismatch_fixture(self):
        mismatch_dir = FIXTURES_DIR / "mismatch"
        if not mismatch_dir.is_dir():
            self.skipTest("fixtures/bundle_integrity/mismatch not found")
        with tempfile.TemporaryDirectory() as tmp:
            run_validator(str(mismatch_dir), tmp)
            report = load_report(tmp)
        first = report["checks"][0]
        self.assertEqual(first["control"], "BUNDLE.INTEGRITY")
        self.assertFalse(first["pass"])
        self.assertGreater(len(first["details"]["hash_mismatches"]), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
