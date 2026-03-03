#!/usr/bin/env bash
# Build a zip of the 50 required governance documents from Governance_Required_Documents_List.csv.
# One file per document (no duplicates). Sources: mactech, TRUST_CODEX, control-plane.
# Aliases: POL-001/POL-227, POL-213, SOP-230/231, IT-307/304, IT-308/105/System_Boundary.

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PARENT="$(cd "$REPO_ROOT/.." && pwd)"
MACTECH_BASE="${MACTECH_BASE:-/Users/patrick/mactech}"
OUT_DIR="$REPO_ROOT/Quality_App_Governance_Documents_52"
ZIP_NAME="Quality_App_Governance_Documents_52.zip"
REQUIRED_LIST_CSV="$REPO_ROOT/docs/Governance_Required_Documents_List.csv"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# Document IDs (column 1) from adjudicated required list — 50 unique basenames
ALLOWED_BASENAMES=$(python3 -c "
import csv
with open('$REQUIRED_LIST_CSV') as f:
    r = csv.reader(f)
    next(r)  # header
    for row in r:
        if row and row[0].strip().endswith('.md'):
            print(row[0].strip())
")

# Aliases handled in find_doc: Record Retention (POL-001 <- POL-227); POL-213, SOP-230, SOP-231 bundle name variants.

# Search directories (order: mactech first, then TRUST_CODEX, then control-plane)
SEARCH_DIRS=(
  "$MACTECH_BASE/compliance/cmmc/level2/02-policies-and-procedures"
  "$MACTECH_BASE/compliance/cmmc/level2/01-system-security-plan"
  "$PARENT/TRUST_CODEX/cmmc-governing-records-bundle/docs/02-policies-and-procedures"
  "$PARENT/TRUST_CODEX/cmmc-governing-records-bundle/docs/01-system-scope"
  "$PARENT/TRUST_CODEX/cmmc-governing-records-bundle/docs/06-supporting-documents"
  "$PARENT/TRUST_CODEX/cmmc-governing-records-bundle/docs"
  "$PARENT/TRUST_CODEX/governance/platform-agnostic/compliance/cmmc/level2/02-policies-and-procedures"
  "$PARENT/TRUST_CODEX/governance/platform-agnostic/compliance/cmmc/level2/01-system-scope"
  "$PARENT/TRUST_CODEX/governance/platform-agnostic/compliance/cmmc/level2/06-supporting-documents"
  "$PARENT/TRUST_CODEX/governance/platform-agnostic/compliance/cmmc/level2"
  "$REPO_ROOT/MacTech_CUI_Enclave_Governance_Bundle_2025-03-01"
  "$REPO_ROOT/MacTech_CUI_Enclave_Governance_Bundle_2025-03-01/docs/cui-enclave-governance"
  "$REPO_ROOT/docs/cui-enclave-governance"
)

find_doc() {
  local want="$1"  # output basename (matrix name)
  local path=""
  case "$want" in
    MAC-POL-001_Record_Retention_Policy.md)
      for alt in "MAC-POL-001_Record_Retention_Policy.md" "MAC-POL-227_Record_Retention_Policy.md"; do
        for d in "${SEARCH_DIRS[@]}"; do
          [[ -f "$d/$alt" ]] && { cp "$d/$alt" "$OUT_DIR/$want"; return 0; }
        done
      done
      return 1
      ;;
    MAC-POL-213_Media_Handling_and_Data_Disposal_Policy.md)
      for alt in "MAC-POL-213_Media_Handling_and_Data_Disposal_Policy.md" "MAC-POL-213_Media_Handling_Policy.md"; do
        for d in "${SEARCH_DIRS[@]}"; do
          [[ -f "$d/$alt" ]] && { cp "$d/$alt" "$OUT_DIR/$want"; return 0; }
        done
      done
      return 1
      ;;
    MAC-SOP-230_Vulnerability_Scanning_and_Remediation_Procedure.md)
      for alt in "MAC-SOP-230_Vulnerability_Scanning_and_Remediation_Procedure.md" "MAC-SOP-230_Vulnerability_Scanning_Procedure.md"; do
        for d in "${SEARCH_DIRS[@]}"; do
          [[ -f "$d/$alt" ]] && { cp "$d/$alt" "$OUT_DIR/$want"; return 0; }
        done
      done
      return 1
      ;;
    MAC-SOP-231_POAM_Process_Procedure.md)
      for alt in "MAC-SOP-231_POAM_Process_Procedure.md" "MAC-SOP-231_POA&M_Process_Procedure.md"; do
        for d in "${SEARCH_DIRS[@]}"; do
          [[ -f "$d/$alt" ]] && { cp "$d/$alt" "$OUT_DIR/$want"; return 0; }
        done
      done
      return 1
      ;;
    MAC-IT-307_System_Security_Plan.md)
      for alt in "MAC-IT-307_System_Security_Plan.md" "MAC-IT-304_System_Security_Plan.md"; do
        for d in "${SEARCH_DIRS[@]}"; do
          [[ -f "$d/$alt" ]] && { cp "$d/$alt" "$OUT_DIR/$want"; return 0; }
        done
      done
      return 1
      ;;
    MAC-IT-308_System_Boundary_and_Scope.md)
      for alt in "MAC-IT-308_System_Boundary_and_Scope.md" "MAC-IT-105_System_Boundary.md" "System_Boundary_and_Scope_MacTech_CUI_Enclave.md"; do
        for d in "${SEARCH_DIRS[@]}"; do
          [[ -f "$d/$alt" ]] && { cp "$d/$alt" "$OUT_DIR/$want"; return 0; }
        done
      done
      return 1
      ;;
    *)
      for d in "${SEARCH_DIRS[@]}"; do
        if [[ -f "$d/$want" ]]; then
          cp "$d/$want" "$OUT_DIR/$want"
          return 0
        fi
      done
      return 1
      ;;
  esac
}

COUNT=0
MISSING=""
while IFS= read -r basename; do
  [[ -z "$basename" ]] && continue
  if find_doc "$basename"; then
    COUNT=$((COUNT + 1))
  else
    MISSING="${MISSING}${MISSING:+ }$basename"
  fi
done <<< "$ALLOWED_BASENAMES"

# Copy matrix CSVs, required list, README, and optional validation/presence artifacts
cp "$REPO_ROOT/docs/Governance_Document_Matrix.csv" "$OUT_DIR/"
cp "$REPO_ROOT/docs/Governance_Document_Matrix_EXPANDED.csv" "$OUT_DIR/"
cp "$REPO_ROOT/docs/Governance_Required_Documents_List.csv" "$OUT_DIR/"
[[ -f "$REPO_ROOT/docs/Governance_Matrix_Validation_Report.md" ]] && cp "$REPO_ROOT/docs/Governance_Matrix_Validation_Report.md" "$OUT_DIR/"
[[ -f "$REPO_ROOT/docs/Governance_Documents_Presence_Checklist.csv" ]] && cp "$REPO_ROOT/docs/Governance_Documents_Presence_Checklist.csv" "$OUT_DIR/"

cat > "$OUT_DIR/README_Quality_App_Package.txt" << README
Quality App — Governance Documents Package (50 required documents)
==================================================================

This package contains the 50 required governance documents from Governance_Required_Documents_List.csv (one file per document, no duplicates).

INCLUDED: $COUNT .md documents + matrix CSVs + required list + README.
Sources: MACTECH_BASE ($MACTECH_BASE), TRUST_CODEX (parent), control-plane. Aliases used where needed (e.g. POL-227 as POL-001, SOP-230 variant).

MASTER LIST
  • Governance_Required_Documents_List.csv
  • Governance_Document_Matrix.csv
  • Governance_Document_Matrix_EXPANDED.csv
  • Governance_Matrix_Validation_Report.md (if present)
  • Governance_Documents_Presence_Checklist.csv (if present)

Generated by: control-plane/scripts/build-quality-app-documents-zip.sh
README

if [[ -n "$MISSING" ]]; then
  echo "Missing (not found in any source): $MISSING" >> "$OUT_DIR/README_Quality_App_Package.txt"
  echo "WARNING: Some matrix documents were not found: $MISSING"
fi

# Create zip
cd "$REPO_ROOT"
rm -f "$ZIP_NAME"
zip -r "$ZIP_NAME" "Quality_App_Governance_Documents_52"
rm -rf "$OUT_DIR"

echo "Created $ZIP_NAME with $COUNT documents (required list) + matrix CSVs + required list + README."
ls -la "$REPO_ROOT/$ZIP_NAME"
