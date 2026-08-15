import { useState } from "react";
import { CoursePlayer } from "@/components/CoursePlayer";
import { frozenDraft, frozenYear8 } from "@/lib/cases";

/** Full-screen student app. Year 7 and Year 8 are compiled courses, not quizzes only. */
export default function Play() {
  const [stage, setStage] = useState<"y7" | "y8">("y7");
  const result = stage === "y8" && frozenYear8 ? frozenYear8 : frozenDraft;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[hsl(28_16%_18%)] px-3 py-6">
      {frozenYear8 ? (
        <div className="mb-4 flex gap-2" role="tablist" aria-label="Year">
          <button
            type="button"
            role="tab"
            aria-selected={stage === "y7"}
            className={`rounded px-3 py-1.5 text-sm font-medium ${
              stage === "y7" ? "bg-[hsl(40_50%_92%)] text-[hsl(24_28%_14%)]" : "text-[hsl(40_20%_70%)]"
            }`}
            onClick={() => setStage("y7")}
          >
            Year 7
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={stage === "y8"}
            className={`rounded px-3 py-1.5 text-sm font-medium ${
              stage === "y8" ? "bg-[hsl(40_50%_92%)] text-[hsl(24_28%_14%)]" : "text-[hsl(40_20%_70%)]"
            }`}
            onClick={() => setStage("y8")}
          >
            Year 8
          </button>
        </div>
      ) : null}
      <CoursePlayer result={result} />
    </div>
  );
}
