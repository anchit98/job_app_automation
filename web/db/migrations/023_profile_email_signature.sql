-- Profile fields for cold-email signature

ALTER TABLE profiles ADD COLUMN phone TEXT;
ALTER TABLE profiles ADD COLUMN linkedin_url TEXT;
ALTER TABLE profiles ADD COLUMN github_url TEXT;
ALTER TABLE profiles ADD COLUMN portfolio_url TEXT;

UPDATE profiles
SET phone = '+91-99109-80793'
WHERE id = 1 AND (phone IS NULL OR phone = '');

UPDATE prompt_templates
SET body = REPLACE(
  body,
  'Gmail adds the signature automatically',
  'The app appends a fixed signature when creating Gmail drafts'
)
WHERE kind = 'cold_email' AND active = 1;
