import { describe, expect, it } from "vitest";
import { CompilationResult } from "@contracts";
import {
  buildCourseWorkspace,
  canOpenCourse,
  friendlyLessonTitle,
  gradeOption,
  lessonBeats,
} from "../client/src/lib/courseWorkspace";
import { defaultStandardIdsForStage, standardsForStage } from "../client/src/lib/stageCatalogue";
import draftJson from "../client/src/fixtures/compilation-result.json";
import refusalJson from "../client/src/fixtures/refusal-result.json";
import year8Json from "../client/src/fixtures/case-au-y8.json";
import demoRequestJson from "../fixtures/demo-request.json";

const draft = CompilationResult.parse(draftJson);
const refusal = CompilationResult.parse(refusalJson);
const year8 = CompilationResult.parse(year8Json);

describe("stage catalogue", () => {
  it("Year 7 offers the official codes the demo request compiles", () => {
    expect(defaultStandardIdsForStage("Year 7")).toEqual(demoRequestJson.standardIds);
    expect(standardsForStage("Year 7").every((option) => option.fetched)).toBe(true);
  });

  it("Year 8 offers AC9M8 codes from the hashed snapshot, never Year 7", () => {
    const ids = defaultStandardIdsForStage("Year 8");
    expect(ids).toEqual(year8.request.standardIds);
    expect(ids.every((id) => id.includes("ac9m8"))).toBe(true);
    expect(ids.some((id) => id.includes("ac9m7"))).toBe(false);
  });

  it("Year 6 offers no fetched standard", () => {
    const options = standardsForStage("Year 6");
    expect(options.every((option) => option.fetched === false)).toBe(true);
    expect(defaultStandardIdsForStage("Year 6")).toEqual([]);
  });
});

describe("course workspace", () => {
  it("opens a draft and refuses a refusal", () => {
    expect(canOpenCourse(draft)).toBe(true);
    expect(canOpenCourse(year8)).toBe(true);
    expect(canOpenCourse(refusal)).toBe(false);
    expect(canOpenCourse(null)).toBe(false);
  });

  it("walks every Year 7 lesson and only ships unrejected items", () => {
    const course = buildCourseWorkspace(draft);
    expect(course).not.toBeNull();
    expect(course!.lessons.length).toBe(draft.coursePlan!.lessons.length);
    expect(course!.shippedCount).toBe(draft.items.filter((item) => !item.rejection).length);

    for (const lesson of course!.lessons) {
      for (const entry of lesson.items) {
        expect(entry.item.rejection).toBeUndefined();
        expect(entry.item.options.some((option) => option.correct)).toBe(true);
      }
    }
  });

  it("keeps Year 8 practice on AC9M8 codes", () => {
    const course = buildCourseWorkspace(year8);
    expect(course).not.toBeNull();
    const codes = course!.lessons.flatMap((lesson) =>
      lesson.items.flatMap((entry) => entry.standardCodes),
    );
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.every((code) => code.startsWith("AC9M8"))).toBe(true);
  });

  it("walks a lesson in explicit-instruction order", () => {
    const course = buildCourseWorkspace(draft)!;
    const withItems = course.lessons.find((lesson) => lesson.items.length > 0)!;
    const beats = lessonBeats(withItems);
    expect(beats[0]?.kind).toBe("warmup");
    expect(beats.some((beat) => beat.kind === "model")).toBe(true);
    expect(beats.some((beat) => beat.kind === "guided")).toBe(true);
    expect(beats.at(-1)?.kind).toBe("wrap");
    expect(friendlyLessonTitle(withItems).length).toBeGreaterThan(0);
    expect(friendlyLessonTitle(withItems)).not.toContain("SAMPLE");
  });

  it("skips practice beats when a lesson has no shipped items", () => {
    const course = buildCourseWorkspace(draft)!;
    const empty = course.lessons.find((lesson) => lesson.items.length === 0);
    if (!empty) {
      return;
    }
    const kinds = lessonBeats(empty).map((beat) => beat.kind);
    expect(kinds).not.toContain("guided");
    expect(kinds).not.toContain("practice");
    expect(kinds.at(-1)).toBe("wrap");
  });

  it("hides the key until gradeOption is called", () => {
    const item = draft.items.find((entry) => !entry.rejection)!;
    const wrong = item.options.find((option) => !option.correct)!;
    const graded = gradeOption(item, wrong.optionId);
    expect(graded.correct).toBe(false);
    expect(graded.keyId).toBe(item.correctOptionId);
    expect(graded.keyRationale.length).toBeGreaterThan(0);
  });
});
