-- Migration 0036: deduplicate governance_documents and add unique index

-- Step 1: delete duplicate governance_documents rows, keeping the latest (highest created_at)
DELETE FROM governance_documents
WHERE id NOT IN (
  SELECT DISTINCT ON (organization_id, doc_id) id
  FROM governance_documents
  ORDER BY organization_id, doc_id, updated_at DESC, created_at DESC
);

-- Step 2: add unique index so future upserts work correctly
CREATE UNIQUE INDEX IF NOT EXISTS gov_docs_org_docid_unique
  ON governance_documents (organization_id, doc_id);

-- Step 3: deduplicate governance_document_control_links
-- Keep one row per (organization_id, doc_code, control_id) — drop the rest
DELETE FROM governance_document_control_links
WHERE id NOT IN (
  SELECT DISTINCT ON (organization_id, doc_code, control_id) id
  FROM governance_document_control_links
  ORDER BY organization_id, doc_code, control_id, created_at DESC
);

-- Step 4: add unique index on control links
CREATE UNIQUE INDEX IF NOT EXISTS gov_doc_links_org_doc_ctrl_unique
  ON governance_document_control_links (organization_id, doc_code, control_id);
