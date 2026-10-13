ALTER TABLE teams ADD COLUMN created_ip text;
CREATE INDEX teams_ip ON teams(created_ip, created_at);
