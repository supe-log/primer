/**
 * Maps an Australian stage label and subject onto an ACARA V9 level code.
 * Returns undefined when this fetcher does not know the pair, so the generic
 * researcher path can try instead of guessing a code.
 */
const YEAR_NUMBER: Record<string, string> = {
  "Year 1": "1",
  "Year 2": "2",
  "Year 3": "3",
  "Year 4": "4",
  "Year 5": "5",
  "Year 6": "6",
  "Year 7": "7",
  "Year 8": "8",
  "Year 9": "9",
  "Year 10": "10",
};

export function acaraLevelCode(stageLabel: string, subject: string): string | undefined {
  const year = YEAR_NUMBER[stageLabel];
  if (!year) return undefined;
  if (/^math/i.test(subject.trim())) return `MATMATY${year}`;
  return undefined;
}
