-- Fix cover letter template: {{name}} in instructions was parsed as a template variable.

UPDATE prompt_templates
SET body = REPLACE(body, '{{name}}', '[NAME]')
WHERE kind = 'cover_letter' AND active = 1;
