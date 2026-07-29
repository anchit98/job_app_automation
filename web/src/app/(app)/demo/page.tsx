import { DemoPromptFlow } from "@/components/demo/demo-prompt-flow";

export default function DemoPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <div>
        <h1 className="li-page-title">Demo prompt</h1>
        <p className="text-[14px] text-on-surface-variant mt-1">
          Phase 0 exit criterion - paste-to-GPT round trip with schema validation.
        </p>
      </div>
      <DemoPromptFlow />
    </div>
  );
}
