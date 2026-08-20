import { BY_ID, type Effect } from "./catalog";

/** Um slot da cadeia. `values` está na mesma ordem de `effect.params`. */
export interface Slot {
  id: number;
  on: boolean;
  values: number[];
}

export interface Patch {
  /** máx. 10 caracteres — a G5 preenche o resto com "*" */
  name: string;
  slots: Slot[];
  notes?: string;
}

/** ID do efeito "None", usado nos slots vazios. */
const EMPTY_ID = 107;

/**
 * Module9..Module11 guardam Z-Pedal, nível do patch e footswitches.
 * Estes são os valores mais frequentes nos 297 patches de fábrica:
 * nível 100, Z-Pedal desligado, footswitches no padrão.
 */
const GLOBALS: Record<number, Record<number, number>> = {
  9: { 2: 100 },
  10: { 10: 1 },
  11: { 0: 2, 1: 3, 2: 8 },
};

const CRLF = "\r\n";

function moduleXml(index: number, prms: Record<number, number>): string {
  const rows: string[] = [];
  for (let j = 0; j <= 10; j++) rows.push(`    <Prm${j}>${prms[j] ?? 0}</Prm${j}>`);
  return `  <Module${index}>${CRLF}${rows.join(CRLF)}${CRLF}  </Module${index}>`;
}

/** Serializa um patch no formato .g5p que o Edit&Share importa. */
export function writeG5P(patch: Patch): string {
  const name = (patch.name || "PATCH").slice(0, 10).padEnd(10, "*");
  const mods: string[] = [];

  for (let i = 0; i < 9; i++) {
    const slot = patch.slots[i];
    if (!slot) {
      mods.push(moduleXml(i, { 0: 0, 1: EMPTY_ID }));
      continue;
    }
    const fx = BY_ID.get(slot.id);
    if (!fx) throw new Error(`efeito ${slot.id} não existe na G5`);
    const prms: Record<number, number> = { 0: slot.on ? 1 : 0, 1: slot.id };
    slot.values.forEach((v, k) => {
      const p = fx.params[k];
      if (p) prms[p.prm] = v;
    });
    mods.push(moduleXml(i, prms));
  }
  for (let i = 9; i <= 11; i++) mods.push(moduleXml(i, GLOBALS[i]));

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    ``,
    `<PatchData>`,
    `  <Product>G5</Product>`,
    `  <Name>${name}</Name>`,
    `  <Tooltip></Tooltip>`,
    `  <Keywords></Keywords>`,
    `  <Version>1.20</Version>`,
    ...mods,
    `</PatchData>`,
    ``,
  ].join(CRLF);
}

/** Lê um .g5p ou uma <PatchData> de dentro de um .g5a. */
export function readG5P(xml: string | Element): Patch {
  const node =
    typeof xml === "string"
      ? new DOMParser().parseFromString(xml, "text/xml").querySelector("PatchData")
      : xml;
  if (!node) throw new Error("XML sem <PatchData>");

  const name = (node.querySelector("Name")?.textContent ?? "").replace(/\*+$/, "");
  const slots: Slot[] = [];

  for (let i = 0; i < 9; i++) {
    const m = node.querySelector(`Module${i}`);
    if (!m) continue;
    const prm = (j: number) => Number(m.querySelector(`Prm${j}`)?.textContent ?? 0);
    const id = prm(1);
    const fx = BY_ID.get(id);
    if (!fx || id === EMPTY_ID) continue;
    slots.push({ id, on: prm(0) === 1, values: fx.params.map((p) => prm(p.prm)) });
  }
  return { name, slots };
}

/** Lê um banco .g5a inteiro (o backup traz os 297 patches). */
export function readG5A(xml: string): Patch[] {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  return Array.from(doc.querySelectorAll("PatchData")).map((n) => readG5P(n));
}

/** Preenche os knobs faltantes com o padrão e trava tudo na faixa do efeito. */
export function clampSlot(fx: Effect, given: Record<string, unknown>): number[] {
  const lookup = new Map(
    Object.entries(given).map(([k, v]) => [k.toLowerCase().trim(), v])
  );
  return fx.params.map((p) => {
    const n = Math.round(Number(lookup.get(p.name.toLowerCase()) ?? p.init));
    return Number.isFinite(n) ? Math.max(0, Math.min(p.max, n)) : p.init;
  });
}

export function downloadPatch(patch: Patch): void {
  const blob = new Blob([writeG5P(patch)], { type: "application/xml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(patch.name || "patch").replace(/[^\w-]/g, "_")}.g5p`;
  a.click();
  URL.revokeObjectURL(a.href);
}
