-- Claims Dashboard Schema
-- Migration: 001_claims_table.sql
-- Description: Core claims table with NOTIFY trigger for real-time updates

-- ===================
-- Claims Table
-- ===================

CREATE TABLE IF NOT EXISTS claims (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Unique identifier for the work item
  issue_id VARCHAR(255) NOT NULL UNIQUE,

  -- Source tracking
  source VARCHAR(50) NOT NULL DEFAULT 'manual',
  source_ref VARCHAR(255),  -- GitHub issue URL, MCP task ID, etc.

  -- Content
  title VARCHAR(500) NOT NULL,
  description TEXT,

  -- Workflow status (maps to Kanban columns)
  -- backlog        -> Backlog column
  -- active         -> Agent Working column
  -- paused         -> Agent Working (paused indicator)
  -- blocked        -> Agent Working (blocked indicator)
  -- review-requested -> Human Review column
  -- completed      -> Done column
  status VARCHAR(50) NOT NULL DEFAULT 'backlog',

  -- Claimant information
  claimant_type VARCHAR(10),  -- 'human' or 'agent'
  claimant_id VARCHAR(255),   -- User ID or Agent ID
  claimant_name VARCHAR(255), -- Display name
  agent_type VARCHAR(100),    -- For agents: coder, reviewer, tester, etc.

  -- Progress tracking
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),

  -- Context and handoff information
  context TEXT,

  -- Flexible metadata (JSONB for extensibility)
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_status CHECK (status IN (
    'backlog', 'active', 'paused', 'blocked',
    'review-requested', 'completed'
  )),
  CONSTRAINT valid_source CHECK (source IN (
    'github', 'manual', 'mcp'
  )),
  CONSTRAINT valid_claimant_type CHECK (
    claimant_type IS NULL OR claimant_type IN ('human', 'agent')
  )
);

-- ===================
-- Indexes
-- ===================

-- Status index for column queries
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);

-- Source index for filtering by origin
CREATE INDEX IF NOT EXISTS idx_claims_source ON claims(source);

-- Claimant index for agent/human filtering
CREATE INDEX IF NOT EXISTS idx_claims_claimant ON claims(claimant_type, claimant_id);

-- Created timestamp for ordering
CREATE INDEX IF NOT EXISTS idx_claims_created_at ON claims(created_at DESC);

-- Updated timestamp for recent changes
CREATE INDEX IF NOT EXISTS idx_claims_updated_at ON claims(updated_at DESC);

-- Source reference for deduplication
CREATE INDEX IF NOT EXISTS idx_claims_source_ref ON claims(source_ref) WHERE source_ref IS NOT NULL;

-- ===================
-- Updated Timestamp Trigger
-- ===================

CREATE OR REPLACE FUNCTION update_claims_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS claims_updated_at ON claims;
CREATE TRIGGER claims_updated_at
  BEFORE UPDATE ON claims
  FOR EACH ROW
  EXECUTE FUNCTION update_claims_updated_at();

-- ===================
-- NOTIFY Trigger for Real-time Updates
-- ===================

-- Function to send notifications on claim changes
CREATE OR REPLACE FUNCTION notify_claim_change()
RETURNS TRIGGER AS $$
DECLARE
  payload JSON;
  claim_data JSON;
BEGIN
  -- Build claim data based on operation
  IF TG_OP = 'DELETE' THEN
    claim_data = row_to_json(OLD);
  ELSE
    claim_data = row_to_json(NEW);
  END IF;

  -- Build notification payload
  payload = json_build_object(
    'operation', TG_OP,
    'timestamp', NOW(),
    'table', TG_TABLE_NAME,
    'claim', claim_data
  );

  -- Send notification on 'claim_changes' channel
  PERFORM pg_notify('claim_changes', payload::text);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for INSERT, UPDATE, DELETE
DROP TRIGGER IF EXISTS claims_notify ON claims;
CREATE TRIGGER claims_notify
  AFTER INSERT OR UPDATE OR DELETE ON claims
  FOR EACH ROW
  EXECUTE FUNCTION notify_claim_change();

-- ===================
-- Comments
-- ===================

COMMENT ON TABLE claims IS 'Work items that can be claimed by humans or AI agents';
COMMENT ON COLUMN claims.id IS 'Unique identifier (UUID v4)';
COMMENT ON COLUMN claims.issue_id IS 'External identifier for the work item (unique)';
COMMENT ON COLUMN claims.source IS 'Origin of the claim: github, manual, or mcp';
COMMENT ON COLUMN claims.source_ref IS 'Reference to source (e.g., GitHub issue URL)';
COMMENT ON COLUMN claims.status IS 'Current workflow status';
COMMENT ON COLUMN claims.claimant_type IS 'Type of claimant: human or agent';
COMMENT ON COLUMN claims.claimant_id IS 'Identifier of the claimant';
COMMENT ON COLUMN claims.claimant_name IS 'Display name of the claimant';
COMMENT ON COLUMN claims.agent_type IS 'For agents: the agent type (coder, reviewer, etc.)';
COMMENT ON COLUMN claims.progress IS 'Completion percentage (0-100)';
COMMENT ON COLUMN claims.context IS 'Handoff context and notes';
COMMENT ON COLUMN claims.metadata IS 'Additional flexible metadata (JSONB)';
