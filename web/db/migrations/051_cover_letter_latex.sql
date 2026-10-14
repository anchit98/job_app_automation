-- Cover letters are built from LaTeX now, not from a Google Doc template.
--
-- The old path copied a reference Doc the user had to upload and sync, then
-- replaced text slots inside the copy. That made every cover letter depend on
-- a document the user had to keep intact, and cost a Doc copy plus two Docs
-- batch updates before a PDF existed. The letter is composed and compiled the
-- same way the CV builder compiles a resume, so the source lives on the row —
-- exactly like builder_cv_versions.latex_content — and a download can rebuild
-- the PDF without Drive.
ALTER TABLE cover_letter_versions
  ADD COLUMN IF NOT EXISTS latex_content TEXT;
