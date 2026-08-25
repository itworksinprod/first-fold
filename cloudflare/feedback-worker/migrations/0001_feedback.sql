CREATE TABLE IF NOT EXISTS personal_feedback (
  token_hash TEXT PRIMARY KEY CHECK (
    length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'
  ),
  edition_date TEXT NOT NULL CHECK (
    length(edition_date) = 10 AND edition_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  issue_number INTEGER NOT NULL CHECK (issue_number BETWEEN 1 AND 1000000),
  scope TEXT NOT NULL CHECK (scope IN ('edition', 'story')),
  story_id TEXT CHECK (story_id IS NULL OR length(story_id) BETWEEN 1 AND 200),
  desk TEXT CHECK (
    desk IS NULL OR desk IN (
      'ai',
      'work-and-tools',
      'security-and-privacy',
      'platforms-and-power'
    )
  ),
  category TEXT NOT NULL CHECK (
    category IN (
      'useful',
      'not_relevant',
      'repeated',
      'wrong_desk',
      'missed_story',
      'correction'
    )
  ),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  created_at INTEGER NOT NULL CHECK (created_at > 0),
  CHECK (
    (scope = 'edition' AND desk IS NULL AND story_id IS NULL) OR
    (scope = 'story' AND desk IS NOT NULL AND story_id IS NOT NULL)
  )
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS personal_feedback_edition_created_idx
  ON personal_feedback (edition_date, created_at);

CREATE INDEX IF NOT EXISTS personal_feedback_category_created_idx
  ON personal_feedback (category, created_at);
