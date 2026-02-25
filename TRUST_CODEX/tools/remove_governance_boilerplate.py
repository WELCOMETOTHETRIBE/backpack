#!/usr/bin/env python3
"""
Remove PLATFORM-AGNOSTIC TEMPLATE header block and [To be completed] Document Control
from all governance .md files under TRUST_CODEX/governance. Safe to run multiple times.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GOV = ROOT / "governance"

# Template block: from "# PLATFORM-AGNOSTIC TEMPLATE" through "---\n\n" before "# Title"
TEMPLATE_START = "# PLATFORM-AGNOSTIC TEMPLATE (REFERENCE ONLY)"
TEMPLATE_END = "\n\n---\n\n# "

DOC_CONTROL_OLD = """**Reviewed By:** [To be completed]  
**Approved By:** [To be completed]  
**Next Review Date:** [To be completed]"""

DOC_CONTROL_NEW = """**Reviewed By:** ________________________  
**Approved By:** ________________________  
**Next Review Date:** ________________________  
*(Complete at document approval.)*"""

# Some files have 2-line Document Control (no Next Review Date)
DOC_CONTROL_OLD_2 = """**Reviewed By:** [To be completed]  
**Approved By:** [To be completed]  """

DOC_CONTROL_NEW_2 = """**Reviewed By:** ________________________  
**Approved By:** ________________________  
**Next Review Date:** ________________________  
*(Complete at document approval.)*"""


def process_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    changed = False

    # Remove template block: from TEMPLATE_START through "---\n\n", keep "# Title\n"
    if TEMPLATE_START in text:
        match = re.search(
            re.escape(TEMPLATE_START) + r".*?" + re.escape("\n\n---\n\n") + r"(# [^\n]+)\n",
            text,
            re.DOTALL,
        )
        if match:
            text = match.group(1) + "\n" + text[match.end():]
            changed = True

    # Document Control (3 lines)
    if DOC_CONTROL_OLD in text:
        text = text.replace(DOC_CONTROL_OLD, DOC_CONTROL_NEW)
        changed = True
    # Document Control (2 lines - add Next Review Date)
    if DOC_CONTROL_OLD_2 in text:
        text = text.replace(DOC_CONTROL_OLD_2, DOC_CONTROL_NEW_2)
        changed = True

    if changed:
        path.write_text(text, encoding="utf-8")
    return changed


def main():
    count = 0
    for path in sorted(GOV.rglob("*.md")):
        if process_file(path):
            count += 1
            print(path.relative_to(ROOT))
    print(f"Updated {count} files.")


if __name__ == "__main__":
    main()
