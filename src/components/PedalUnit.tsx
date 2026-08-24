import { useEffect, useState } from "react";
import type { CSSProperties, ImgHTMLAttributes } from "react";
import {
  BY_ID,
  CATEGORIES,
  bkgdUrl,
  spriteUrl,
  type Effect,
  type Param,
} from "../lib/catalog";
import type { Slot } from "../lib/g5p";

/** Qual quadro do sprite corresponde ao valor atual do controle. */
function frameFor(param: Param, value: number): number {
  if (param.frames <= 1 || param.max <= 0) return 0;

  const ratio = value / param.max;

  return Math.max(
    0,
    Math.min(param.frames - 1, Math.round(ratio * (param.frames - 1)))
  );
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

/**
 * Imagem com fallback estável.
 *
 * Quando a imagem original falha, usamos o fallback sem
 * ficar alterando o src original novamente.
 *
 * Quando o src muda, o estado de erro é resetado para
 * permitir testar a nova imagem.
 */
interface ControlImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src: string;
  fallback: string;
}

function ControlImage({
  src,
  fallback,
  ...props
}: ControlImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <img
      {...props}
      src={failed ? fallback : src}
      onError={() => {
        setFailed(true);
      }}
    />
  );
}

interface Props {
  slot: Slot;
  showHeader?: boolean;
  index: number;
  scale?: number;
  onChange?: (paramIndex: number, value: number) => void;
}

export function PedalUnit({
  slot,
  index,
  scale = 1,
  onChange,
  showHeader = true,
}: Props) {
  const fx: Effect | undefined = BY_ID.get(slot.id);

  if (!fx) return null;

  const meta = CATEGORIES[fx.cat];
  const cat = CATEGORIES[fx.cat];

  const dotColor = cat
    ? slot.on
      ? cat.color
      : "#252d44"
    : "#252d44";

  return (
    <figure
      className="unit"
      style={{ "--c": meta.color } as CSSProperties}
    >
      {showHeader && (
        <figcaption
          className="unit-head flex flex-col items-center justify-center text-center gap-1"
          style={{
            opacity: slot.on ? 1 : 0.45,
          }}
        >
          <span className="unit-idx">
            Slot {String(index + 1).padStart(2, "0")}
          </span>

          <span
            className="slot-cat"
            style={{ color: cat?.color }}
          >
            {cat?.label}
          </span>

          <strong
            className="slot-name"
            style={{
              color: slot.on ? "#dde4f0" : "#7d90b4",
            }}
          >
            {fx.name}
          </strong>

          <span
            className={
              slot.on
                ? "slot-on unit-led"
                : "slot-on unit-led off"
            }
          />

          <span
            className="slot-on"
            style={{
              background: dotColor,
            }}
          />
        </figcaption>
      )}

      <div
        className="unit-panel"
        style={{
          margin: "0 auto",
          width: fx.w * scale,
          height: fx.h * scale,
          backgroundImage: `url(${bkgdUrl(fx)})`,
          backgroundSize: "100% 100%",
          opacity: slot.on ? 1 : 0.45,
        }}
      >
        {fx.params.map((p, i) => {
          const value = slot.values[i];

          const frame = frameFor(p, value);
          const src = spriteUrl(fx, p, frame);

          return (
            <ControlImage
              key={p.prm}
              className="unit-ctrl"
              src={src}
              fallback="/fx/G5_FD_Combo/knob00.png"
              alt={`${p.name}: ${label(p, value)}`}
              title={`${p.name}: ${label(p, value)}`}
              draggable={false}
              style={{
                left: p.x * scale,
                top: (p.y + offsetFor(p, value)) * scale,
                width: p.w * scale,
                height:
                  p.frames > 1
                    ? p.h * scale
                    : undefined,
                cursor: onChange ? "ns-resize" : "default",
              }}
              onWheel={
                onChange
                  ? (e) => {
                      e.preventDefault();

                      const step = Math.max(
                        1,
                        Math.round(p.max / 50)
                      );

                      const next =
                        value -
                        Math.sign(e.deltaY) * step;

                      onChange(
                        i,
                        Math.max(
                          0,
                          Math.min(p.max, next)
                        )
                      );
                    }
                  : undefined
              }
            />
          );
        })}
      </div>

      <dl className="unit-readout flex items-center justify-center gap-2">
        {fx.params.map((p, i) => (
          <div
            key={p.prm}
            className="flex flex-col items-center gap-1 border-r border-gray-400 last:border-r-0 pr-2 backdrop-grayscale"
          >
            <dt>{p.name}</dt>

            <dd>
              {label(p, slot.values[i])}
            </dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}