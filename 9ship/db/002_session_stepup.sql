ALTER TABLE sessions ADD COLUMN stepup_until timestamptz;
CREATE INDEX sessions_user ON sessions(user_id);
