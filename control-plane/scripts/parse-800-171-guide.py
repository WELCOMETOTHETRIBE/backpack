#!/usr/bin/env python3
"""
Re-parse the CMMC Assessment Guide PDF into per-control blocks with clean
pagination handling. The original TypeScript parser drifted across page
boundaries because its control-id regex matched the TOC and the headers on
EVERY page, causing control blocks to be stitched from the wrong starting
points.

This parser:
  1. Extracts text PAGE BY PAGE (not as one concatenated blob)
  2. Strips per-page header + footer lines deterministically
  3. Finds the FIRST content page for each control by looking for
     "AC.L2-<id>" or "<id>" as a standalone heading near the top of a page,
     BUT only when followed by "ASSESSMENT OBJECTIVE" or a NIST requirement
     statement — NOT the TOC entries
  4. Walks forward page-by-page until the next control id heading is found
  5. Writes { controlId: { title, nist_exact_text, assessment_objectives,
     assessment_methods, discussion, further_discussion, examples,
     key_references } } as a dict to JSON

Run:
  python3 scripts/parse-800-171-guide.py
  → writes docs/control-mapping-parsed-clean.json
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path

try:
    from pypdf import PdfReader
except ModuleNotFoundError:
    print("Install pypdf first: python3 -m pip install --user --break-system-packages pypdf", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "docs" / "AssessmentGuideL2v2 (1).pdf"
OUT = ROOT / "docs" / "control-mapping-parsed-clean.json"

# All 110 NIST 800-171 rev 2 control ids
ALL_IDS = [
    # 3.1 — Access Control (22)
    *(f"3.1.{i}" for i in range(1, 23)),
    # 3.2 — Awareness and Training (3)
    *(f"3.2.{i}" for i in range(1, 4)),
    # 3.3 — Audit and Accountability (9)
    *(f"3.3.{i}" for i in range(1, 10)),
    # 3.4 — Configuration Management (9)
    *(f"3.4.{i}" for i in range(1, 10)),
    # 3.5 — Identification and Authentication (11)
    *(f"3.5.{i}" for i in range(1, 12)),
    # 3.6 — Incident Response (3)
    *(f"3.6.{i}" for i in range(1, 4)),
    # 3.7 — Maintenance (6)
    *(f"3.7.{i}" for i in range(1, 7)),
    # 3.8 — Media Protection (9)
    *(f"3.8.{i}" for i in range(1, 10)),
    # 3.9 — Personnel Security (2)
    *(f"3.9.{i}" for i in range(1, 3)),
    # 3.10 — Physical Protection (6)
    *(f"3.10.{i}" for i in range(1, 7)),
    # 3.11 — Risk Assessment (3)
    *(f"3.11.{i}" for i in range(1, 4)),
    # 3.12 — Security Assessment (4)
    *(f"3.12.{i}" for i in range(1, 5)),
    # 3.13 — System and Communications Protection (16)
    *(f"3.13.{i}" for i in range(1, 17)),
    # 3.14 — System and Information Integrity (7)
    *(f"3.14.{i}" for i in range(1, 8)),
]
assert len(ALL_IDS) == 110, f"expected 110 ids, got {len(ALL_IDS)}"

# Family prefix by control — AC, AT, AU, CM, IA, IR, MA, MP, PS, PE, RA, CA, SC, SI
FAMILY = {
    "3.1": "AC", "3.2": "AT", "3.3": "AU", "3.4": "CM", "3.5": "IA",
    "3.6": "IR", "3.7": "MA", "3.8": "MP", "3.9": "PS", "3.10": "PE",
    "3.11": "RA", "3.12": "CA", "3.13": "SC", "3.14": "SI",
}

PAGE_HEADER = re.compile(r"^\s*CMMC Assessment Guide\s*[–-]\s*Level 2.*$", re.I)
PAGE_FOOTER_PAGE_NUM = re.compile(r"^\s*\d+\s*$")
VERSION_LINE = re.compile(r"^\s*Version\s+[\d.]+\s*$", re.I)
TOC_DOTS = re.compile(r"\.{4,}\s*\d+\s*$")
CONTROL_HEADING = re.compile(r"^\s*([A-Z]{2})\.L2-(\d+\.\d+\.\d+)\s*[–-]?\s*(.*)$")


def strip_page_chrome(page_text: str) -> list[str]:
    """Drop header/footer/page-number/TOC lines from a single page."""
    out = []
    for raw in page_text.splitlines():
        line = raw.rstrip()
        if not line.strip():
            out.append("")
            continue
        if PAGE_HEADER.match(line):
            continue
        if VERSION_LINE.match(line):
            continue
        if PAGE_FOOTER_PAGE_NUM.match(line):
            continue
        if TOC_DOTS.search(line):
            continue
        out.append(line)
    # Collapse runs of blank lines
    dedup = []
    prev_blank = False
    for ln in out:
        if not ln.strip():
            if prev_blank:
                continue
            prev_blank = True
        else:
            prev_blank = False
        dedup.append(ln)
    return dedup


def find_control_heading(lines: list[str]) -> tuple[int, str, str] | None:
    """Return (line_index, control_id, family_prefix) for the first
    AC.L2-style heading in this page's cleaned lines, or None."""
    for i, line in enumerate(lines):
        m = CONTROL_HEADING.match(line.strip())
        if not m:
            continue
        family, cid, _ = m.group(1), m.group(2), m.group(3)
        if cid not in ALL_IDS:
            continue
        expected_family = FAMILY.get(cid.rsplit(".", 1)[0])
        if expected_family != family:
            continue
        return i, cid, family
    return None


def parse_control_block(lines: list[str]) -> dict:
    """Given the CLEANED lines of a single control's block (starts with
    "AC.L2-3.1.1 – …" heading line, ends before the next heading), return
    structured fields."""
    text = "\n".join(lines).strip()

    sections = {
        "heading": None,
        "nist_exact_text": "",
        "assessment_objectives": "",
        "assessment_methods": "",
        "discussion": "",
        "further_discussion": "",
        "examples": "",
        "potential_assessment_considerations": "",
        "key_references": "",
    }

    # The heading line itself
    first_line = lines[0] if lines else ""
    m = CONTROL_HEADING.match(first_line.strip())
    if m:
        sections["heading"] = first_line.strip()

    # Section boundary markers — these all appear as standalone lines
    boundaries = [
        ("nist_exact_text", None),  # content before ASSESSMENT OBJECTIVES = requirement
        ("assessment_objectives", re.compile(r"^\s*ASSESSMENT\s+OBJECTIVES\s*\[NIST\s+SP\s+800-171A\].*", re.I)),
        ("assessment_methods", re.compile(r"^\s*POTENTIAL\s+ASSESSMENT\s+METHODS\s+AND\s+OBJECTS\s*\[NIST\s+SP\s+800-171A\].*", re.I)),
        ("discussion", re.compile(r"^\s*DISCUSSION\s*\[NIST\s+SP\s+800-171\s+REV\.?\s*2\].*", re.I)),
        ("further_discussion", re.compile(r"^\s*FURTHER\s+DISCUSSION\s*$", re.I)),
        ("examples", re.compile(r"^\s*Example\s+\d+\s*$", re.I)),
        ("potential_assessment_considerations", re.compile(r"^\s*Potential\s+Assessment\s+Considerations\s*$", re.I)),
        ("key_references", re.compile(r"^\s*KEY\s+REFERENCES?\s*$", re.I)),
    ]

    # Walk lines and partition by section markers
    current = "nist_exact_text"
    skip_first_heading = True
    buf: dict[str, list[str]] = {k: [] for k, _ in boundaries}
    for line in lines:
        if skip_first_heading:
            skip_first_heading = False
            continue  # drop the AC.L2-... heading line from requirement
        matched = None
        for name, pat in boundaries:
            if pat is not None and pat.match(line):
                matched = name
                break
        if matched:
            # Special case: "Example 2", "Example 3" etc. go to examples
            if matched == "examples" and buf["examples"]:
                buf["examples"].append("")  # separator between examples
            current = matched
            continue
        buf[current].append(line)

    for name, lst in buf.items():
        val = "\n".join(lst).strip()
        val = re.sub(r"\n{3,}", "\n\n", val)
        sections[name] = val

    # Build a combined nist_discussion_guidance blob compatible with the
    # existing parseAssessmentGuideSections regex in the app — it looks for
    # section headers like "ASSESSMENT OBJECTIVES [NIST SP 800-171A]" etc.
    combined_parts = []
    if sections["assessment_objectives"]:
        combined_parts.append("ASSESSMENT OBJECTIVES [NIST SP 800-171A]\n" + sections["assessment_objectives"])
    if sections["assessment_methods"]:
        combined_parts.append("POTENTIAL ASSESSMENT METHODS AND OBJECTS [NIST SP 800-171A]\n" + sections["assessment_methods"])
    if sections["discussion"]:
        combined_parts.append("DISCUSSION [NIST SP 800-171 REV. 2]\n" + sections["discussion"])
    if sections["further_discussion"]:
        combined_parts.append("FURTHER DISCUSSION\n" + sections["further_discussion"])
    if sections["examples"]:
        # Keep Example N headings — regex re-scans for them
        combined_parts.append("Example 1\n" + sections["examples"])
    if sections["potential_assessment_considerations"]:
        combined_parts.append("Potential Assessment Considerations\n" + sections["potential_assessment_considerations"])
    if sections["key_references"]:
        combined_parts.append("KEY REFERENCES\n" + sections["key_references"])
    sections["nist_discussion_guidance"] = "\n\n".join(combined_parts).strip() or None

    return sections


def main() -> int:
    print(f"Reading {PDF}")
    if not PDF.exists():
        print(f"ERROR: PDF not found at {PDF}", file=sys.stderr)
        return 1

    reader = PdfReader(str(PDF))
    print(f"Pages: {len(reader.pages)}")

    # Extract each page separately and strip chrome
    pages_clean: list[list[str]] = []
    for i, page in enumerate(reader.pages):
        try:
            raw = page.extract_text() or ""
        except Exception as e:
            print(f"  page {i+1}: extraction error: {e}", file=sys.stderr)
            raw = ""
        pages_clean.append(strip_page_chrome(raw))

    # Find every page that STARTS a control (first non-blank lines contain the heading)
    # Multiple controls can start on the same page.
    heading_occurrences: list[tuple[int, int, str]] = []  # (page_idx, line_idx, control_id)
    for pi, lines in enumerate(pages_clean):
        for li, line in enumerate(lines):
            m = CONTROL_HEADING.match(line.strip())
            if not m:
                continue
            family, cid = m.group(1), m.group(2)
            if cid not in ALL_IDS:
                continue
            expected_family = FAMILY.get(cid.rsplit(".", 1)[0])
            if expected_family != family:
                continue
            # Skip if this looks like a TOC entry (very short line, dots after, page number on next line)
            stripped = line.strip()
            if TOC_DOTS.search(stripped):
                continue
            heading_occurrences.append((pi, li, cid))

    print(f"Found {len(heading_occurrences)} control heading occurrences")

    # For each control, pick its FIRST real occurrence (not TOC — but we've
    # already filtered TOC via the dot-leader check). If a control appears
    # multiple times (heading + continued page), the FIRST instance starts
    # its block.
    seen: set[str] = set()
    ordered: list[tuple[int, int, str]] = []
    for occ in heading_occurrences:
        _, _, cid = occ
        if cid in seen:
            continue
        seen.add(cid)
        ordered.append(occ)

    print(f"Unique control starting points: {len(ordered)}")
    missing = [cid for cid in ALL_IDS if cid not in seen]
    if missing:
        print(f"WARNING: {len(missing)} controls not found in PDF: {missing[:10]}...")

    # For each control, gather lines from its start up to the next control's start
    parsed: dict[str, dict] = {}
    for idx, (pi, li, cid) in enumerate(ordered):
        end_pi, end_li = (ordered[idx + 1][0], ordered[idx + 1][1]) if idx + 1 < len(ordered) else (len(pages_clean), 0)

        block_lines: list[str] = []
        # Walk pages from (pi, li) to (end_pi, end_li)
        for p in range(pi, min(end_pi + 1, len(pages_clean))):
            page = pages_clean[p]
            start = li if p == pi else 0
            end = end_li if p == end_pi else len(page)
            block_lines.extend(page[start:end])

        sec = parse_control_block(block_lines)
        parsed[cid] = {
            "controlId": cid,
            "heading": sec["heading"],
            "nist_exact_text": sec["nist_exact_text"],
            "nist_discussion_guidance": sec["nist_discussion_guidance"],
            "sections": {
                "assessment_objectives": sec["assessment_objectives"],
                "assessment_methods": sec["assessment_methods"],
                "discussion": sec["discussion"],
                "further_discussion": sec["further_discussion"],
                "examples": sec["examples"],
                "potential_assessment_considerations": sec["potential_assessment_considerations"],
                "key_references": sec["key_references"],
            },
        }

    with OUT.open("w") as f:
        json.dump(parsed, f, indent=2)
    print(f"Wrote {len(parsed)} controls to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
