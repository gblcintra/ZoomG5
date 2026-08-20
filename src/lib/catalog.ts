import raw from "../data/catalog.json";

export type CatKey =
  | "DYN" | "FILTER" | "DRIVE" | "AMP" | "MOD"
  | "DELAY" | "REVERB" | "COMBO" | "PEDAL" | "SFX";

/** Um controle de um efeito. `prm` é o índice do <PrmN> no arquivo de patch. */
export interface Param {
  /** 2..10 — corresponde direto a <Prm2>..<Prm10> */
  prm: number;
  name: string;
  max: number;
  init: number;
  /** Knob | Toggle | Slider */
  type: string;
  /** nome base do sprite, sempre minúsculo (ex.: "knob") */
  img: string;
  /** true quando o sprite mora na pasta compartilhada G5_Common */
  common: boolean;
  /** quantos quadros o sprite tem: 49 = knob, 2 = chave, 1 = slider */
  frames: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** legendas quando o parâmetro é uma chave (ex.: ["Slow","Fast"]) */
  values?: string[];
}

export interface Effect {
  /** o mesmo número que vai em <Prm1> */
  id: number;
  name: string;
  cat: CatKey;
  /** pasta em public/fx (ex.: "G5_FD_Combo") */
  asset: string;
  w: number;
  h: number;
  params: Param[];
}

export const CATALOG = raw as Effect[];
export const BY_ID = new Map(CATALOG.map((e) => [e.id, e]));

export const CATEGORIES: Record<CatKey, { label: string; color: string }> = {
  DYN: { label: "Dinâmica", color: "#F2B33D" },
  FILTER: { label: "Filtro / EQ", color: "#C86BE0" },
  DRIVE: { label: "Drive", color: "#E2483D" },
  AMP: { label: "Amp", color: "#FF7A2F" },
  MOD: { label: "Modulação", color: "#3D8FE2" },
  DELAY: { label: "Delay", color: "#35B67A" },
  REVERB: { label: "Reverb", color: "#2ED3C6" },
  COMBO: { label: "Combinado", color: "#6E8BFF" },
  PEDAL: { label: "Z-Pedal", color: "#E86AA6" },
  SFX: { label: "SFX", color: "#A16BE0" },
};

/**
 * Resolve o caminho do sprite de um controle.
 * Os quadros são numerados com dois dígitos (knob00.png ... knob48.png).
 */
export function spriteUrl(effect: Effect, param: Param, frame: number): string {
  const folder = param.common ? "G5_Common" : effect.asset;
  // sliders são uma imagem só, que desliza; o resto é sprite numerado
  const suffix = param.frames > 1 ? String(frame).padStart(2, "0") : "";
  return `/fx/${folder}/${param.img}${suffix}.png`;
}

export function bkgdUrl(effect: Effect): string {
  return `/fx/${effect.asset}/bkgd.png`;
}

/** Lista compacta usada no prompt do modelo. */
export function catalogForPrompt(): string {
  return CATALOG.map(
    (e) =>
      `${e.id} ${e.name} [${e.cat}] ` +
      e.params.map((p) => `${p.name}:0-${p.max}`).join(" ")
  ).join("\n");
}
