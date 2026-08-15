import { type ReactNode, useMemo, useState } from "react";
import { parseMathScene, type MathScene } from "@/lib/mathScene";

export function prettyMath(text: string): ReactNode {
  const chunks = text.split(/(\d+\^\d+)/g);
  return chunks.map((chunk, index) => {
    const power = chunk.match(/^(\d+)\^(\d+)$/);
    if (power) {
      return (
        <span key={`${chunk}-${index}`}>
          {power[1]}
          <sup>{power[2]}</sup>
        </span>
      );
    }
    return <span key={`${chunk}-${index}`}>{chunk}</span>;
  });
}

function Power({ base, exp }: { base: number; exp: number }) {
  return (
    <span className="learner-math">
      {base}
      <sup>{exp}</sup>
    </span>
  );
}

type Mode = "look" | "hint";

export function MathPicture({
  stem,
  mode = "look",
}: {
  stem: string;
  mode?: Mode;
}) {
  const scene = useMemo(() => parseMathScene(stem), [stem]);
  if (!scene) {
    return null;
  }
  return (
    <div className="px-slice px-card mt-3 p-3" data-testid="math-picture">
      <SceneBody key={`${scene.kind}-${mode}`} scene={scene} mode={mode} />
    </div>
  );
}

function SceneBody({ scene, mode }: { scene: MathScene; mode: Mode }) {
  switch (scene.kind) {
    case "ratio-counters":
      return <RatioCounters scene={scene} mode={mode} />;
    case "share-bar":
      return <ShareBar scene={scene} mode={mode} />;
    case "fraction-bar":
      return <FractionBar num={scene.num} den={scene.den} label={`${scene.num}/${scene.den}`} />;
    case "percent-bar":
      return <PercentBar num={scene.num} den={scene.den} />;
    case "number-line":
      return <NumberLine scene={scene} />;
    case "scale-mix":
      return <ScaleMix scene={scene} mode={mode} />;
    case "power-product":
      return <PowerProduct scene={scene} mode={mode} />;
    case "zero-power":
      return <ZeroPower base={scene.base} mode={mode} />;
    case "decimal-strip":
      return <DecimalStrip num={scene.num} den={scene.den} />;
    case "root-line":
      return <RootLine root={scene.root} mode={mode} />;
    case "square-tiles":
      return <SquareTiles base={scene.sidePower.base} exp={scene.sidePower.exp} mode={mode} />;
  }
}

function Dot({ color }: { color: "red" | "blue" | "green" | "yellow" }) {
  const fill = {
    red: "bg-[#d95763]",
    blue: "bg-[#5b6ee1]",
    green: "bg-[#6abe30]",
    yellow: "bg-[#fbf236]",
  }[color];
  return <span className={`inline-block h-7 w-7 ${fill}`} style={{ imageRendering: "pixelated" }} />;
}

function RatioCounters({
  scene,
  mode,
}: {
  scene: Extract<MathScene, { kind: "ratio-counters" }>;
  mode: Mode;
}) {
  const [grouped, setGrouped] = useState(mode === "look");
  const whole = scene.left + scene.right;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <span className="flex gap-1.5">
          {Array.from({ length: scene.left }, (_, i) => (
            <Dot key={`l-${i}`} color="red" />
          ))}
        </span>
        <span className="flex gap-1.5">
          {Array.from({ length: scene.right }, (_, i) => (
            <Dot key={`r-${i}`} color="blue" />
          ))}
        </span>
      </div>
      {grouped ? (
        <p className="learner-math mt-3 text-center text-xl">{whole} in all</p>
      ) : (
        <button type="button" className="learner-btn-quiet mt-3 w-full" onClick={() => setGrouped(true)}>
          Show all
        </button>
      )}
    </div>
  );
}

function ShareBar({
  scene,
  mode,
}: {
  scene: Extract<MathScene, { kind: "share-bar" }>;
  mode: Mode;
}) {
  const parts = scene.left + scene.right;
  const each = scene.total / parts;
  const [open, setOpen] = useState(mode === "look");
  return (
    <div>
      <div className="flex gap-1">
        {Array.from({ length: parts }, (_, i) => (
          <span
            key={i}
            className={`flex h-12 flex-1 items-center justify-center text-base font-bold ${
              i < scene.left ? "bg-[#6abe30] text-[#14110d]" : "bg-[#5b6ee1] text-white"
            }`}
          >
            {open ? `${scene.unit}${each}` : "?"}
          </span>
        ))}
      </div>
      {!open ? (
        <button type="button" className="learner-btn-quiet mt-3 w-full" onClick={() => setOpen(true)}>
          Open
        </button>
      ) : null}
    </div>
  );
}

function FractionBar({ num, den, label }: { num: number; den: number; label: string }) {
  const shown = Math.min(den, 24);
  return (
    <div>
      <p className="learner-math text-center text-2xl">{label}</p>
      <div className="mt-2 flex h-10 overflow-hidden">
        {Array.from({ length: shown }, (_, i) => (
          <span
            key={i}
            className={`flex-1 border border-[hsl(24_28%_14%)] ${
              i < Math.round((num / den) * shown) ? "bg-[#fbf236]" : "bg-[hsl(40_50%_96%)]"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function PercentBar({ num, den }: { num: number; den: number }) {
  const percent = Math.round((num / den) * 100);
  return (
    <div>
      <FractionBar num={num} den={den} label={`${num}/${den}`} />
      <div className="mt-2 h-6 overflow-hidden bg-[hsl(40_50%_96%)]">
        <div className="h-full bg-[#6abe30]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function NumberLine({ scene }: { scene: Extract<MathScene, { kind: "number-line" }> }) {
  const ticks: number[] = [];
  for (let n = scene.from; n <= scene.to; n += 0.5) {
    ticks.push(n);
  }
  const mid = (scene.markA + scene.markB) / 2;
  return (
    <div>
      <div className="mt-1 flex items-end justify-between border-b-2 border-[hsl(24_28%_14%)] pb-1">
        {ticks.map((tick) => {
          const isMid = Math.abs(tick - mid) < 0.01;
          const isEnd = tick === scene.markA || tick === scene.markB;
          return (
            <span key={tick} className="flex flex-col items-center">
              <span
                className={`block w-0.5 ${isMid ? "h-5 bg-[#d95763]" : isEnd ? "h-4 bg-[#5b6ee1]" : "h-2 bg-[hsl(24_28%_14%)]"}`}
              />
              {Number.isInteger(tick) ? (
                <span className="mt-1 text-xs font-semibold">{tick}</span>
              ) : isMid ? (
                <span className="mt-1 text-xs font-bold text-[#d95763]">?</span>
              ) : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ScaleMix({
  scene,
  mode,
}: {
  scene: Extract<MathScene, { kind: "scale-mix" }>;
  mode: Mode;
}) {
  const [scaled, setScaled] = useState(mode === "look");
  const factor = scene.toA / scene.fromA;
  const toB = scene.fromB * factor;
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 text-center text-base font-bold">
        <div className="bg-[#d95763] px-2 py-4 text-white">
          {scaled ? scene.toA : scene.fromA} mL
        </div>
        <div className="bg-[#5b6ee1] px-2 py-4 text-white">
          {scaled ? toB : scene.fromB} mL
        </div>
      </div>
      {!scaled ? (
        <button type="button" className="learner-btn-quiet mt-3 w-full" onClick={() => setScaled(true)}>
          Half
        </button>
      ) : null}
    </div>
  );
}

function PowerProduct({
  scene,
  mode,
}: {
  scene: Extract<MathScene, { kind: "power-product" }>;
  mode: Mode;
}) {
  const [open, setOpen] = useState(mode === "look");
  return (
    <div>
      <p className="text-center text-2xl font-bold leading-tight">
        <Power base={scene.base} exp={scene.expA} />
        <span className="mx-1">×</span>
        <Power base={scene.base} exp={scene.expB} />
      </p>
      {open ? (
        <p className="mt-3 flex flex-wrap justify-center gap-1 text-sm">
          {Array.from({ length: scene.expA }, (_, i) => (
            <span key={`a-${i}`} className="bg-[#fbf236] px-1.5 py-0.5 font-bold">
              {scene.base}
            </span>
          ))}
          <span className="px-1">×</span>
          {Array.from({ length: scene.expB }, (_, i) => (
            <span key={`b-${i}`} className="bg-[#5b6ee1] px-1.5 py-0.5 font-bold text-white">
              {scene.base}
            </span>
          ))}
        </p>
      ) : (
        <button type="button" className="learner-btn-quiet mt-3 w-full" onClick={() => setOpen(true)}>
          Open
        </button>
      )}
    </div>
  );
}

function ZeroPower({ base, mode }: { base: number; mode: Mode }) {
  const [open, setOpen] = useState(mode === "look");
  return (
    <div>
      <p className="text-center text-2xl font-bold leading-tight">
        <Power base={base} exp={3} />
        <span className="mx-1">÷</span>
        <Power base={base} exp={3} />
      </p>
      {open ? (
        <p className="mt-3 text-center text-2xl font-bold">
          <Power base={base} exp={0} />
        </p>
      ) : (
        <button type="button" className="learner-btn-quiet mt-3 w-full" onClick={() => setOpen(true)}>
          Cancel
        </button>
      )}
    </div>
  );
}

function DecimalStrip({ num, den }: { num: number; den: number }) {
  const value = num / den;
  return (
    <div>
      <p className="learner-math text-center text-2xl">
        {num} ÷ {den}
      </p>
      <div className="mt-2 h-8 overflow-hidden bg-[hsl(40_50%_96%)]">
        <div className="h-full bg-[#fbf236]" style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}

function RootLine({ root, mode }: { root: number; mode: Mode }) {
  const value = Math.sqrt(root);
  const low = Math.floor(value * 10) / 10;
  const high = low + 0.1;
  const pct = ((value - 1) / 1) * 100;
  return (
    <div>
      <p className="learner-math text-center text-2xl">√{root}</p>
      <div className="relative mt-4 h-2 bg-[hsl(24_28%_14%)]">
        <span
          className="absolute -top-3 h-4 w-1 bg-[#d95763]"
          style={{ left: `${Math.min(90, Math.max(10, pct))}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-sm font-semibold">
        <span>1.0</span>
        <span className="font-bold">{mode === "look" ? `${low} · ${high}` : "?"}</span>
        <span>2.0</span>
      </div>
    </div>
  );
}

function SquareTiles({ base, exp, mode }: { base: number; exp: number; mode: Mode }) {
  const side = base ** exp;
  const shown = Math.min(side, 8);
  const [open, setOpen] = useState(mode === "look");
  return (
    <div>
      <p className="text-center text-2xl font-bold">
        <Power base={base} exp={exp} />
      </p>
      {open ? (
        <div
          className="mt-3 grid gap-0.5"
          style={{ gridTemplateColumns: `repeat(${shown}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: shown * shown }, (_, i) => (
            <span key={i} className="aspect-square bg-[#6abe30]" />
          ))}
        </div>
      ) : (
        <button type="button" className="learner-btn-quiet mt-3 w-full" onClick={() => setOpen(true)}>
          Build
        </button>
      )}
    </div>
  );
}
