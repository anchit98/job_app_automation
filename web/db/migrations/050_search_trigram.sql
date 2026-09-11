-- Fuzzy search on the Jobs page.
--
-- The search box ran plainto_tsquery, which matches whole stemmed lexemes: a
-- partial word ("goog") matched nothing and a misspelling ("gogle") matched
-- nothing either, so the box only ever worked on exact words. Substring
-- matching fixes the partial case in plain SQL; the near-miss case needs
-- trigrams.
--
-- word_similarity() is only used when this extension is present — the query
-- builder probes pg_extension first — so a database that cannot install it
-- keeps working with substring matching alone.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Company + role is what people half-remember and mistype. The index makes the
-- fuzzy clause cheap; without it every search scans the table.
CREATE INDEX IF NOT EXISTS applications_company_role_trgm_idx
  ON applications
  USING gin (
    (LOWER(COALESCE(company, '') || ' ' || COALESCE(role, ''))) gin_trgm_ops
  );

-- Substring search over the full haystack (company, role, JD, notes) cannot use
-- a b-tree, and a leading-wildcard LIKE is a sequential scan without this.
CREATE INDEX IF NOT EXISTS applications_search_haystack_trgm_idx
  ON applications
  USING gin (
    (
      LOWER(
        COALESCE(company, '') || ' ' ||
        COALESCE(role, '') || ' ' ||
        COALESCE(jd_raw, '') || ' ' ||
        COALESCE(notes, '')
      )
    ) gin_trgm_ops
  );
