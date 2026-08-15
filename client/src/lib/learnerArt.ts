/**
 * One Kenney 16px pack, one palette. Paths are files in
 * client/public/kenney/pixel-ui (CC0). Combat tiles were never vendored.
 */

export const KENNEY = {
  green: "/kenney/pixel-ui/green.png",
  greenPressed: "/kenney/pixel-ui/green-pressed.png",
  blue: "/kenney/pixel-ui/blue.png",
  bluePressed: "/kenney/pixel-ui/blue-pressed.png",
  yellow: "/kenney/pixel-ui/yellow.png",
  yellowPressed: "/kenney/pixel-ui/yellow-pressed.png",
  grey: "/kenney/pixel-ui/grey.png",
  greyPressed: "/kenney/pixel-ui/grey-pressed.png",
  red: "/kenney/pixel-ui/red.png",
  outlineGreen: "/kenney/pixel-ui/outline-green.png",
  outlineBlue: "/kenney/pixel-ui/outline-blue.png",
  outlineYellow: "/kenney/pixel-ui/outline-yellow.png",
  tan: "/kenney/pixel-ui/tan.png",
  tanInlay: "/kenney/pixel-ui/tan-inlay.png",
} as const;

export const BEAT_TILE: Record<string, string> = {
  warmup: KENNEY.yellow,
  model: KENNEY.blue,
  guided: KENNEY.green,
  practice: KENNEY.green,
  wrap: KENNEY.outlineYellow,
};
