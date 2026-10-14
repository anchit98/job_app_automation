-- Tailored resumes are typeset with the CV builder's LaTeX template.
--
-- Apply built the tailored PDF by copying the user's master Google Doc and
-- swapping text into its slots. That preserved their layout, but the layout is
-- only as good as the master: a Doc that arrived as a PDF conversion produced
-- a badly set page for every application made from it, however good the text
-- was.
--
-- The PDF is typeset from the structured content now, so it looks like the CV
-- builder's output regardless of where the master came from. The Doc copy
-- still happens alongside it — drive_doc_id keeps pointing at it — so anyone
-- who wants their own layout can open and edit that instead.
--
-- Storing the source mirrors builder_cv_versions.latex_content and
-- cover_letter_versions.latex_content: the download route can rebuild the PDF
-- without Drive.
ALTER TABLE resume_versions
  ADD COLUMN IF NOT EXISTS latex_content TEXT;
