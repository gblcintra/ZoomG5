import type { CSSProperties } from "react";
import { BY_ID, CATEGORIES, bkgdUrl, spriteUrl, type Effect, type Param } from "../lib/catalog";
import type { Slot } from "../lib/g5p";

/** Qual quadro do sprite corresponde ao valor atual do controle. */
function frameFor(param: Param, value: number): number {
  if (param.frames <= 1 || param.max <= 0) return 0;
  const ratio = value / param.max;
  return Math.max(0, Math.min(param.frames - 1, Math.round(ratio * (param.frames - 1))));
}

/**
 * Sliders (GraphicEQ, Lead) são uma imagem só que desliza no eixo Y:
 * valor máximo em cima, mínimo embaixo.
 */
function offsetFor(param: Param, value: number): number {
  if (param.frames > 1 || param.max <= 0) return 0;
  const travel = Math.max(0, param.h - 12);
  return Math.round((1 - value / param.max) * travel);
}

function label(param: Param, value: number): string {
  return param.values?.[value] ?? String(value);
}

interface Props {
  slot: Slot;
  index: number;
  scale?: number;
  onChange?: (paramIndex: number, value: number) => void;
}

export function PedalUnit({ slot, index, scale = 1, onChange }: Props) {
  const fx: Effect | undefined = BY_ID.get(slot.id);
  if (!fx) return null;
  const meta = CATEGORIES[fx.cat];

  return (
    <figure className="unit" style={{ "--c": meta.color } as CSSProperties}>
      <figcaption className="unit-head">
        <span className="unit-idx">{String(index + 1).padStart(2, "0")}</span>
        <span className="unit-cat">{meta.label}</span>
        <span className={slot.on ? "unit-led" : "unit-led off"} />
      </figcaption>

      <div
        className="unit-panel"
        style={{
          width: fx.w * scale,
          height: fx.h * scale,
          backgroundImage: `url(${bkgdUrl(fx)})`,
          backgroundSize: "100% 100%",
          opacity: slot.on ? 1 : 0.45,
        }}
      >
        {fx.params.map((p, i) => {
          const value = slot.values[i];
          return (
            <img
              key={p.prm}
              className="unit-ctrl"
              src={spriteUrl(fx, p, frameFor(p, value))}
              alt={`${p.name}: ${label(p, value)}`}
              title={`${p.name}: ${label(p, value)}`}
              draggable={false}
              style={{
                left: p.x * scale,
                top: (p.y + offsetFor(p, value)) * scale,
                width: p.w * scale,
                height: p.frames > 1 ? p.h * scale : undefined,
                cursor: onChange ? "ns-resize" : "default",
              }}
              onWheel={
                onChange &&
                ((e) => {
                  e.preventDefault();
                  const step = Math.max(1, Math.round(p.max / 50));
                  const next = value - Math.sign(e.deltaY) * step;
                  onChange(i, Math.max(0, Math.min(p.max, next)));
                })
              }
            />
          );
        })}
      </div>

      <dl className="unit-readout">
        {fx.params.map((p, i) => (
          <div key={p.prm}>
            <dt>{p.name}</dt>
            <dd>{label(p, slot.values[i])}</dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}
