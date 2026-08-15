import { readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BEAT_TILE, KENNEY } from "../client/src/lib/learnerArt";

const tileDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../client/public/kenney/pixel-ui",
);

const COMBAT = /sword|weapon|blood|gore|skull|axe|gun|knife|bomb/i;

describe("learner art", () => {
  it("vendors one Kenney 16px pack and no combat filenames", () => {
    const files = readdirSync(tileDir);
    expect(files).toContain("LICENSE.txt");
    expect(files).toContain("SOURCE.txt");
    expect(files.every((name) => !COMBAT.test(name))).toBe(true);
    expect(files.some((name) => name.endsWith(".png"))).toBe(true);

    for (const href of Object.values(KENNEY)) {
      const name = href.split("/").pop();
      expect(name).toBeDefined();
      expect(existsSync(join(tileDir, name!))).toBe(true);
    }

    for (const href of Object.values(BEAT_TILE)) {
      expect(Object.values(KENNEY)).toContain(href);
    }
  });
});
