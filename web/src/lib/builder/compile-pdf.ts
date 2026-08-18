/**
 * Compile LaTeX to PDF.
 *
 * Ported from ResumeBuilderV2's `compile_latex_to_pdf`, which posts to the free
 * latex.ytotech.com build service — no API key, no local TeX toolchain (which
 * a serverless Node runtime cannot provide anyway).
 *
 * Note this sends resume content to a third party. See the privacy note in
 * docs/architecture.md before pointing production at it.
 */
const LATEX_API_URL = "https://latex.ytotech.com/builds/sync";
const COMPILE_TIMEOUT_MS = 120_000;

export class LatexCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LatexCompileError";
  }
}

export async function compileLatexToPdf(latexContent: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COMPILE_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(LATEX_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        compiler: "pdflatex",
        resources: [{ main: true, content: latexContent }],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new LatexCompileError(
        "PDF build timed out. Try again — very long resumes can exceed the limit.",
      );
    }
    throw new LatexCompileError(
      `Could not reach the PDF builder: ${error instanceof Error ? error.message : "network error"}`,
    );
  } finally {
    clearTimeout(timer);
  }

  const detail = async () => (await response.text().catch(() => "")).slice(0, 500);

  if (response.status !== 200 && response.status !== 201) {
    throw new LatexCompileError(
      `PDF builder returned ${response.status}. ${await detail()}`,
    );
  }
  // A 200 with a non-PDF body means pdflatex itself failed; the body carries
  // the TeX log, which is the only useful diagnostic here.
  if (!(response.headers.get("content-type") ?? "").includes("application/pdf")) {
    throw new LatexCompileError(`LaTeX compilation failed. ${await detail()}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
