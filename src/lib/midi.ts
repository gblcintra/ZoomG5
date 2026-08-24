/**
 * midi.ts — Zoom G5 MIDI/SysEx helpers
 *
 * Formato Zoom: F0 52 00 <modelo> <comando> <payload> F7
 *
 * Layout do payload (158 bytes, confirmado via dumps reais):
 *   [0]       patchNumber
 *   [1]       bypassMask  (bit N=1 → slot N ativo, bit N=0 → bypass; slots 0-7)
 *   [2..17]   módulo 0   (base = 2 + 0×16) — header do efeito no slot 0
 *   [18..33]  módulo 1   (base = 2 + 1×16) — parâmetros do slot 0
 *   ...
 *   [130..145] módulo 8  (base = 2 + 8×16)
 *   [146..155] nome do patch (10 bytes ASCII)
 *   [156..157] 2 bytes trailing
 *   Total: 2 + 9×16 + 10 + 2 = 158 ✓
 *
 * Codificação dentro de cada módulo (confirmado para slot 0, NoiseGate / ZNR):
 *   effectId  = mod[1] | mod[2]  (um dos dois é sempre 0; ver SYSEX_TO_CATALOG_ID)
 *   parâmetros do efeito i → módulo i+1:
 *     prmOffset=0 → posições 4, 5, 6…  (ascendente)
 *     prmOffset=1 → posições 13, 12, 11… (descendente)
 */

// ─── Protocolo SysEx Zoom ───────────────────────────────────────────────────

export const SYSEX_START = 0xf0;
export const SYSEX_END   = 0xf7;
export const ZOOM_ID     = 0x52;
export const G5_MODEL    = 0x5b;

export const IDENTITY_REQUEST = [0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7];

export function zoomSysex(model: number, cmd: number, payload: number[] = []): number[] {
  return [SYSEX_START, ZOOM_ID, 0x00, model, cmd, ...payload, SYSEX_END];
}

export function currentPatchRequest(model: number): number[] {
  return zoomSysex(model, 0x29);
}

/** Habilita edição de parâmetros (necessário antes de editar parâmetros em tempo real). */
export function paramEditEnable(model: number): number[] {
  return zoomSysex(model, 0x50);
}

/** Verifica se a mensagem é um dump de patch da Zoom (cmd 0x28). Devolve o payload ou null. */
export function isPatchDump(bytes: number[]): number[] | null {
  if (
    bytes[0] === SYSEX_START &&
    bytes[1] === ZOOM_ID &&
    bytes[2] === 0x00 &&
    bytes[4] === 0x28 &&
    bytes.at(-1) === SYSEX_END
  ) {
    return bytes.slice(5, -1);
  }
  return null;
}

export interface MidiMessage {
  at: number;
  direction: "in" | "out";
  bytes: number[];
}

export function toHex(bytes: number[] | Uint8Array | null | undefined): string {
  if (!bytes) return "";
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

export function fromHex(text: string): number[] {
  const parts = text.trim().split(/[\s,]+/).filter(Boolean);
  return parts.map((p) => {
    const n = parseInt(p.replace(/^0x/i, ""), 16);
    if (Number.isNaN(n) || n < 0 || n > 0xff) throw new Error(`byte inválido: ${p}`);
    return n;
  });
}

export function parseIdentity(bytes: number[]): { maker: number; model: number } | null {
  if (bytes[0] !== SYSEX_START || bytes[1] !== 0x7e || bytes[3] !== 0x06 || bytes[4] !== 0x02) {
    return null;
  }
  return { maker: bytes[5], model: bytes[6] };
}

export function zoomModelOf(bytes: number[]): number | null {
  if (bytes[0] === SYSEX_START && bytes[1] === ZOOM_ID) return bytes[3] ?? null;
  return null;
}

export interface DumpSlot {
  slotIdx: number;
  /** SysEx ID = mod[1] | mod[2] (confirmado para slots 0; pendente para 1-8). */
  id: number;
  /** ID do catálogo após tradução via SYSEX_TO_CATALOG_ID. */
  catalogId: number;
  recognized: boolean;
  /** Derivado de bypassMask (payload[1]) bit slotIdx; slot 8 usa id≠0 como proxy. */
  on: boolean;
  /** mod[12] — significado desconhecido; mantido para análise futura. */
  byte12: number;
  /** Valores dos parâmetros lidos do módulo i+1 (confirmado para slot 0). */
  values: number[];
  rawMod: number[];
}

/**
 * Interpreta o payload de um dump de patch (cmd 0x28).
 * Retorna todos os 9 slots, incluindo os não reconhecidos.
 */
export function parseBinaryDump(
  payload: number[],
  byId: Map<number, { params: Array<{ prm: number; prmOffset?: number }> }>,
): {
  patchNumber: number;
  name: string;
  slots: DumpSlot[];
} {
  const patchNumber = payload[0] ?? 0;
  // CONFIRMADO via diff toggle-bypass (NoiseGate slot 0, patch DZ Bend):
  //   ATIVO: payload[1]=0x39 (bit0=1), BYPASS: payload[1]=0x38 (bit0=0).
  // Bit N=1 → slot N ativo; bit N=0 → slot N em bypass.
  // Slots 0-7 confirmados por este byte. Slot 8: sem dado, usa id≠0 como proxy.
  const bypassMask = payload[1] ?? 0;

  const name = payload
    .slice(146, 156)
    .map((b) => (b === 0 ? " " : String.fromCharCode(b)))
    .join("")
    .trim();

  const slots: DumpSlot[] = [];

  for (let i = 0; i < 9; i++) {
    const base = 2 + i * 16;          // header 2 bytes, módulos contíguos a partir do offset 2
    const mod = payload.slice(base, base + 16);

    const byte12 = mod[12] ?? 0;
    // CONFIRMADO via diff ZNR ↔ NoiseGate (slot 1) e comparação entre patches 01B/DZBend:
    //   effectId = mod[1] | mod[2]  (um dos dois é sempre 0, o outro é o ID real)
    //   NoiseGate: mod[1]=0x00 mod[2]=0x19=25 → id=25
    //   ZNR:       mod[1]=0x40=64 mod[2]=0x00 → id=64
    // Estes IDs são o sistema interno do SysEx (diferente do Prm1 do catálogo).
    // byte[13] no 01B (=0x1c=28) era parâmetro Level=28, NÃO o effect ID.
    // PENDENTE: módulos 1..8 podem usar codificação diferente — confirmar com diffs.
    const id     = (mod[1] ?? 0) | (mod[2] ?? 0);
    // byte14 mantido para análise futura (relação com bypass não confirmada).
    const byte14 = mod[14] ?? 0; void byte14;

    const catalogId  = SYSEX_TO_CATALOG_ID[id] ?? id;
    const recognized = byId.has(catalogId);
    const fx = recognized ? byId.get(catalogId)! : null;

    // CONFIRMADO para slot 0 (NoiseGate, DZ Bend):
    //   Parâmetros do efeito no módulo i estão no módulo i+1 (nextMod).
    //   prmOffset=0 → posições 4, 5, 6… (ascendente)
    //   prmOffset=1 → posições 13, 12, 11… (descendente)
    //   THRSH (prm=2, off=1) → nextMod[13]=10 ✓   Level (prm=3, off=0) → nextMod[4]=100 ✓
    const nextBase = base + 16;
    const nextMod = i < 8 ? payload.slice(nextBase, nextBase + 16) : [];

    const values = fx
      ? (() => {
          // Conta índice dentro de cada grupo (off=0 ascendente, off=1 descendente)
          let j0 = 0, j1 = 0;
          return fx.params.map((p) => {
            const off = p.prmOffset ?? 0;
            const byteIdx = off === 0 ? 4 + j0++ : 13 - j1++;
            return byteIdx >= 0 && byteIdx < nextMod.length ? (nextMod[byteIdx] ?? 0) : 0;
          });
        })()
      : [];

    slots.push({
      slotIdx: i,
      id,
      catalogId,
      recognized,
      // CONFIRMADO: bypassMask = payload[1], bit N = slot N (1=ativo, 0=bypass).
      // Slot 8 não confirmado; usa id≠0 como fallback.
      on: i < 8 ? ((bypassMask >> i) & 1) === 1 : id !== 0,
      byte12,
      values,
      rawMod: [...mod],
    });
  }

  return { patchNumber, name, slots };
}

export interface MidiPorts {
  inputs: MIDIInput[];
  outputs: MIDIOutput[];
}

export async function openMidi(): Promise<MIDIAccess> {
  if (!navigator.requestMIDIAccess) {
    throw new Error("Este navegador não tem Web MIDI. Use Chrome ou Edge.");
  }
  return navigator.requestMIDIAccess({ sysex: true });
}

export function listPorts(access: MIDIAccess): MidiPorts {
  return {
    inputs: Array.from(access.inputs.values()),
    outputs: Array.from(access.outputs.values()),
  };
}

export function guessZoomPort<T extends MIDIPort>(ports: T[]): T | undefined {
  return ports.find((p) => /zoom|g5/i.test(`${p.name ?? ""} ${p.manufacturer ?? ""}`));
}

// ─── Mapeamento SysEx ID → Prm1 do catálogo ────────────────────────────────
// Os IDs no dump SysEx são diferentes dos Prm1 do catálogo (.zrc).
// Tabela construída empiricamente via diffs (troca de efeito + comparação de dumps).
// CONFIRMADOS:
//   sysex=25 (0x19) → NoiseGate (Prm1=28)  — via diff ZNR↔NG em DZ Bend + 01B
//   sysex=64 (0x40) → ZNR (Prm1=27)        — via dump ZNR em DZ Bend
// PENDENTE: todos os outros efeitos precisam de diffs adicionais.
export const SYSEX_TO_CATALOG_ID: Record<number, number> = {
  25: 28,   // NoiseGate (mod1[2]=0x19, confirmado)
  64: 27,   // ZNR       (mod1[1]=0x40, confirmado)
};

// ─── Tabela de efeitos da G5 (confirmada via G3ToG5ConvertTable.xml) ────────

export const ZOOM_G5_EFFECTS: Record<number, string> = {
  27: "ZNR",       28: "NoiseGate",  29: "DirtyGate",
  30: "GraphicEQ", 31: "ParaEQ",     32: "CombFLTR",
  33: "AutoWah",   34: "Resonance",  35: "Step",
  36: "Cry",       37: "Octave",     38: "Tremolo",
  39: "Phaser",    40: "RingMod",    41: "Chorus",
  42: "Detune",    43: "VintageCE",  44: "StereoCho",
  45: "Ensemble",  46: "Vin Flanger",47: "DynaFLNGR",
  48: "Vibrato",   49: "PitchSHFT",  50: "BendCho",
  51: "MonoPitch", 52: "HPS",        53: "Delay",
  54: "TapeEcho",  55: "ModDelay",   56: "AnalogDLY",
  57: "ReverseDL", 58: "MultiTapD",  59: "DynaDelay",
  60: "Hall",      61: "Room",       62: "TiledRoom",
  63: "Spring",    64: "Arena",      65: "EarlyRef",
  66: "Air",       67: "PedalVox",   68: "PedalCry",
  69: "PDL Pitch", 70: "PdlMnPit",   71: "Booster",
  72: "OverDrive", 73: "T Scream",   74: "Governor",
  75: "Dist +",    76: "Dist 1",     77: "Squeak",
  78: "FuzzSmile", 79: "GreatMuff",  80: "MetalWRLD",
  81: "HotBox",    82: "Z Wild",     83: "Lead",
  84: "ExtremeDS", 85: "Aco.Sim",    86: "Z Clean",
  87: "Z MP1",     88: "Z Bottom",   89: "Z Dream",
  90: "Z Scream",  91: "Z Neos",     92: "FD Combo",
  93: "VX Combo",  94: "US Blues",   95: "BG Crunch",
  96: "HW Stack",  97: "Trangerine", 98: "MS Crunch",
  99: "MS Drive",  100: "BG Drive",  101: "DZ Drive",
  102: "TW Rock",  103: "Match 30",  104: "FD Vibro",
  105: "HD Reverb",106: "Flanger",
};

export const ZOOM_G5_EFFECT_IDS: Record<string, number> = Object.fromEntries(
  Object.entries(ZOOM_G5_EFFECTS).map(([id, name]) => [name, Number(id)]),
);

// Dados confirmados diretamente do G5_NoiseGate.zrc
export const NOISE_GATE = {
  id: 28,
  hexId: 0x1c,
  params: {
    THRSH: { prm: 2, init: 9,   max: 24,  prmOffset: 1 },
    Level: { prm: 3, init: 100, max: 150 },
  },
} as const;

// ─── Ferramentas de análise / engenharia reversa ──────────────────────────

export function effectName(id: number): string {
  return ZOOM_G5_EFFECTS[id] ?? `Unknown(${id})`;
}

export function effectId(name: string): number | null {
  return ZOOM_G5_EFFECT_IDS[name] ?? null;
}

export function readLE16(bytes: number[] | Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 1 >= bytes.length) return null;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

export function readLE32(bytes: number[] | Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 3 >= bytes.length) return null;
  return (
    (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
  );
}

function toU8(data: number[] | Uint8Array | null | undefined): Uint8Array {
  if (!data) return new Uint8Array();
  return data instanceof Uint8Array ? data : Uint8Array.from(data);
}

/** Procura ocorrências de IDs de efeitos conhecidos no dump (candidatos, não confirmados). */
export function findEffectCandidates(data: number[] | Uint8Array) {
  const bytes = toU8(data);
  const candidates: { offset: number; offsetHex: string; value: number; hex: string; name: string }[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const value = bytes[i];
    if (value < 27 || value > 106) continue;
    candidates.push({
      offset: i,
      offsetHex: `0x${i.toString(16).padStart(4, "0")}`,
      value,
      hex: value.toString(16).padStart(2, "0"),
      name: effectName(value),
    });
  }
  return candidates;
}

/** Procura ocorrências do byte 0x1C (NoiseGate) com contexto ao redor. */
export function findNoiseGateCandidates(data: number[] | Uint8Array) {
  const bytes = toU8(data);
  const result: { offset: number; offsetHex: string; id: number; hex: string; name: string; before: number[]; after: number[] }[] = [];
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== NOISE_GATE.hexId) continue;
    result.push({
      offset: i,
      offsetHex: `0x${i.toString(16).padStart(4, "0")}`,
      id: 28, hex: "1c", name: "NoiseGate",
      before: Array.from(bytes.slice(Math.max(0, i - 8), i)),
      after:  Array.from(bytes.slice(i + 1, i + 9)),
    });
  }
  return result;
}

/**
 * Varre o dump em janelas de 16 bytes e retorna todas onde byte[13] === 0x1C.
 *
 * Não assume significado de nenhum outro byte — apenas localiza candidatos
 * para análise posterior via diffBytes.
 *
 * Bloco observado no patch 01B:
 *   offset:  0   1   2   3   4   5   6   7   8   9   A   B   C   D   E   F
 *   bytes:  0c  00  19  00  00  00  02  00  00  00  00  00  09  1c  00  00
 *                                                            ↑   ↑
 *                                                  byte[12]=09  byte[13]=1c
 *
 * byte[13]=0x1c foi confirmado como Effect ID (NoiseGate) no patch 01B.
 * byte[12]=0x09 — significado DESCONHECIDO (pode ser THRSH=init=9, ou status).
 */
export function findNoiseGateModuleCandidates(data: number[] | Uint8Array) {
  const bytes = toU8(data);
  const result: {
    offset: number;
    offsetHex: string;
    status: number;
    id: number;
    effect: string;
    hex: string;
    rawMod: number[];
  }[] = [];
  for (let i = 0; i + 16 <= bytes.length; i++) {
    const mod = bytes.slice(i, i + 16);
    if (mod[13] !== 0x1c) continue;
    result.push({
      offset: i,
      offsetHex: `0x${i.toString(16).padStart(4, "0")}`,
      status: mod[12],
      id: mod[13],
      effect: "NoiseGate",
      hex: toHex(mod),
      rawMod: Array.from(mod),
    });
  }
  return result;
}

/** Analisa um dump e imprime candidatos úteis para engenharia reversa. */
export function analyzeG5Dump(data: number[] | Uint8Array) {
  const bytes = toU8(data);
  const result = {
    length: bytes.length,
    hex: toHex(bytes),
    noiseGateCandidates: findNoiseGateCandidates(bytes),
    noiseGateModuleCandidates: findNoiseGateModuleCandidates(bytes),
    effectCandidates: findEffectCandidates(bytes),
  };
  console.group("Zoom G5 dump analysis");
  console.log("Length:", result.length);
  console.log("HEX:", result.hex);
  console.log("NoiseGate byte-scan candidates:", result.noiseGateCandidates);
  console.log("NoiseGate 16-byte module candidates:", result.noiseGateModuleCandidates);
  console.log("All effect-ID candidates:", result.effectCandidates);
  console.groupEnd();
  return result;
}

export function cloneBytes(data: number[] | Uint8Array): Uint8Array {
  return Uint8Array.from(data instanceof Uint8Array ? data : Array.from(data ?? []));
}

export function hexWindow(data: number[] | Uint8Array, offset: number, before = 8, after = 8) {
  const bytes = toU8(data);
  const start = Math.max(0, offset - before);
  const end = Math.min(bytes.length, offset + after + 1);
  return { start, end, offset, bytes: Array.from(bytes.slice(start, end)), hex: toHex(bytes.slice(start, end)) };
}

/**
 * Compara dois dumps byte a byte — ferramenta principal para descobrir
 * offsets reais. Mude uma variável no patch, capture dois dumps e compare.
 */
export function diffBytes(a: number[] | Uint8Array, b: number[] | Uint8Array) {
  const aa = toU8(a);
  const bb = toU8(b);
  const max = Math.max(aa.length, bb.length);
  const diff: { offset: number; offsetHex: string; a: number | null; b: number | null; aHex: string | null; bHex: string | null }[] = [];
  for (let i = 0; i < max; i++) {
    const av = i < aa.length ? aa[i] : null;
    const bv = i < bb.length ? bb[i] : null;
    if (av !== bv) {
      diff.push({
        offset: i,
        offsetHex: `0x${i.toString(16).padStart(4, "0")}`,
        a: av, b: bv,
        aHex: av == null ? null : av.toString(16).padStart(2, "0"),
        bHex: bv == null ? null : bv.toString(16).padStart(2, "0"),
      });
    }
  }
  return diff;
}

export function formatDiff(a: number[] | Uint8Array, b: number[] | Uint8Array): string {
  return diffBytes(a, b)
    .map((d) => `${d.offsetHex}: ${d.aHex ?? "--"} -> ${d.bHex ?? "--"}`)
    .join("\n");
}

export function isZoomSysEx(data: number[] | Uint8Array): boolean {
  const bytes = toU8(data);
  return bytes.length >= 4 && bytes[0] === 0xf0 && bytes[1] === 0x52;
}

export function getSysExPayload(data: number[] | Uint8Array): Uint8Array {
  const bytes = toU8(data);
  const start = bytes[0] === 0xf0 ? 1 : 0;
  const endIndex = bytes.lastIndexOf(0xf7);
  const end = endIndex >= start ? endIndex : bytes.length;
  return bytes.slice(start, end);
}

export function createDumpSnapshot(data: number[] | Uint8Array) {
  const bytes = cloneBytes(data);
  return {
    bytes,
    length: bytes.length,
    hex: toHex(bytes),
    analyze() { return analyzeG5Dump(bytes); },
    diff(other: number[] | Uint8Array) { return diffBytes(bytes, other); },
  };
}

/**
 * Retorna os 16 bytes de um módulo pelo índice (0-8).
 * Layout: header 2 bytes, módulos contíguos a partir do offset 2.
 *   módulo i → payload[2 + i×16 .. 2 + i×16 + 15]
 */
export function getModule(payload: number[] | Uint8Array, moduleIndex: number): number[] {
  const bytes = toU8(payload);
  const base = 2 + moduleIndex * 16;
  return Array.from(bytes.slice(base, base + 16));
}

/**
 * Combina diffBytes com o mapeamento de offset → módulo → byte-dentro-do-módulo.
 *
 * Use para pinpoint qual módulo e qual byte mudou ao variar um parâmetro na G5.
 * Exemplo de uso no console do browser:
 *
 *   const diffs = analyzeModuleDiff(dumpA, dumpB);
 *   console.table(diffs);
 *   // → offset, módulo, byteNoMódulo, de (hex), para (hex)
 */
export function analyzeModuleDiff(
  a: number[] | Uint8Array,
  b: number[] | Uint8Array,
) {
  return diffBytes(a, b).map((d) => {
    const o = d.offset;
    let moduleIndex: number | null = null;
    let moduleOffset: number | null = null;

    // layout: header[0..1], módulos[2..145] (9×16), nome[146..155], trail[156..157]
    if (o >= 2 && o < 146) {
      const relative = o - 2;
      moduleIndex  = Math.floor(relative / 16);
      moduleOffset = relative % 16;
    }

    return {
      ...d,
      moduleIndex,
      moduleOffset,
      moduleOffsetHex: moduleOffset == null ? null : `0x${moduleOffset.toString(16).padStart(2, "0")}`,
    };
  });
}
