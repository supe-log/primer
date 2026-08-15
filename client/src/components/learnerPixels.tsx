/**
 * Brand pixels drawn on the Kenney 16px grid. Not pulled from GitHub
 * topic/pixelart — that list is mostly 24px CryptoPunks and combat games.
 */

const SLIME = [
  "................",
  "......3333......",
  "....33222233....",
  "...3222222223...",
  "..322222222223..",
  "..322112211223..",
  ".32221122112223.",
  ".32220122102223.",
  ".32221122112223.",
  ".32222222222223.",
  ".32225522552223.",
  "..322222222223..",
  "...3222222223...",
  "....33222233....",
  "......3333......",
  "................",
] as const;

const STAR = [
  ".......3........",
  "......333.......",
  "......333.......",
  "...333333333....",
  "....3333333.....",
  ".....33333......",
  "....3333333.....",
  "...33..3..33....",
  "................",
] as const;

const SUN = [
  ".......2........",
  "...2...2...2....",
  "....2.222.2.....",
  "..2.2222222.2...",
  "...222222222....",
  "...2222.2222....",
  "...222222222....",
  "..2.2222222.2...",
  "....2.222.2.....",
  "...2...2...2....",
  ".......2........",
] as const;

const INK: Record<string, string> = {
  "1": "#222034",
  "2": "#fbf236",
  "3": "#6abe30",
  "5": "#d95763",
  "0": "#ffffff",
};

function PixelSprite({
  rows,
  title,
  size = 64,
  className,
}: {
  rows: readonly string[];
  title: string;
  size?: number;
  className?: string;
}) {
  const cells: { x: number; y: number; fill: string }[] = [];
  rows.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      const fill = INK[cell];
      if (fill) {
        cells.push({ x, y, fill });
      }
    });
  });

  return (
    <svg
      viewBox={`0 0 ${rows[0].length} ${rows.length}`}
      width={size}
      height={size}
      className={className}
      shapeRendering="crispEdges"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
    >
      {title ? <title>{title}</title> : null}
      {cells.map((cell) => (
        <rect
          key={`${cell.x}-${cell.y}`}
          x={cell.x}
          y={cell.y}
          width={1}
          height={1}
          fill={cell.fill}
        />
      ))}
    </svg>
  );
}

export function PixelBuddy({ size = 64, className }: { size?: number; className?: string }) {
  return <PixelSprite rows={SLIME} title="Pip, the practice buddy" size={size} className={className} />;
}

export function PixelStar({ size = 24, className }: { size?: number; className?: string }) {
  return <PixelSprite rows={STAR} title="" size={size} className={className} />;
}

export function PixelSun({ size = 40, className }: { size?: number; className?: string }) {
  return <PixelSprite rows={SUN} title="" size={size} className={className} />;
}

export function PixelBurst() {
  return (
    <div className="pixel-burst" aria-hidden>
      <PixelStar size={28} className="pixel-burst-star a" />
      <PixelStar size={20} className="pixel-burst-star b" />
      <PixelStar size={24} className="pixel-burst-star c" />
    </div>
  );
}
