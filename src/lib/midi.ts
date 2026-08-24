/**
 * midi.ts — Zoom G5 MIDI/SysEx helpers
 *
 * Formato Zoom: F0 52 00 <modelo> <comando> <payload> F7
 * Total message length = 164 bytes; payload = 158 bytes (slice 5..-1).
 *
 * O payload é bit-packed (7-bit MIDI). Cada slot tem bytes espalhados em posições
 * irregulares. Para o slot i:
 *
 *   effByte   = payload[EFF[i]]                         (LSB = on/off status)
 *   extra     = (payload[EXTRA_BYTE[i]] & EXTRA_MASK[i]) << EXTRA_SHIFT[i]
 *   bit8      = (payload[BIT8_BYTE[i]] & 0x01) << 7
 *   effectId  = ((effByte & 0xFE) >> 1) + extra + bit8 - MINUS[i]
 *
 * Confirmado via `checkEffectEnabled()` do repositório MasusGit/ZoomMs50MidiController.
 * Verificado para slot 0 / NoiseGate em dois dumps reais.
 *
 * Nome do patch: payload[146..155] (10 bytes ASCII). Confirmado.
 * Parâmetros (Level, THRSH etc.): bit-packing ainda não decodificado.
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
  /** effectId calculado via fórmula bit-packed (confirmado para slot 0). Igual a catalogId. */
  id: number;
  /** Mesmo que id — effectId já é o Prm1 do catálogo (não precisa de tradução). */
  catalogId: number;
  recognized: boolean;
  /** LSB do effByte do slot (bit 0 = ativo, confirmado para slot 0). */
  on: boolean;
  /** @deprecated Mantido para compatibilidade; sem significado na nova decodificação. */
  byte12: number;
  /** Zeros por enquanto — bit-packing de parâmetros ainda não decodificado. */
  values: number[];
  /** 16 bytes ao redor do effByte do slot (para análise). */
  rawMod: number[];
}

// Offsets do effectId por slot — derivados de checkEffectEnabled() (MasusGit/ZoomMs50MidiController).
// Fórmula: effectId = ((payload[eff] & 0xFE) >> 1) + ((payload[extraByte] & extraMask) << extraShift) + ((payload[bit8Byte] & 1) << 7) - minus
// on/off: bit 0 de payload[eff].
const SLOT_EFF: ReadonlyArray<{
  eff: number; extraByte: number; extraMask: number; extraShift: number; bit8Byte: number; minus: number;
}> = [
  { eff: 1,   extraByte: 0,  extraMask: 0x40, extraShift: 0, bit8Byte: 2,   minus: 0  },
  { eff: 14,  extraByte: 8,  extraMask: 0x02, extraShift: 5, bit8Byte: 15,  minus: 0  },
  { eff: 28,  extraByte: 24, extraMask: 0x08, extraShift: 3, bit8Byte: 29,  minus: 0  },
  { eff: 42,  extraByte: 40, extraMask: 0x20, extraShift: 1, bit8Byte: 43,  minus: 0  },
  { eff: 55,  extraByte: 48, extraMask: 0x01, extraShift: 6, bit8Byte: 57,  minus: 0  },
  { eff: 69,  extraByte: 64, extraMask: 0x04, extraShift: 4, bit8Byte: 70,  minus: 0  },
  { eff: 83,  extraByte: 80, extraMask: 0x10, extraShift: 2, bit8Byte: 84,  minus: 0  },
  { eff: 97,  extraByte: 96, extraMask: 0x40, extraShift: 0, bit8Byte: 98,  minus: 0  },
  { eff: 110, extraByte: -1, extraMask: 0x00, extraShift: 0, bit8Byte: 111, minus: 60 },
];

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

  const name = payload
    .slice(146, 156)
    .map((b) => (b === 0 ? " " : String.fromCharCode(b)))
    .join("")
    .trim();

  const slots: DumpSlot[] = [];

  for (let i = 0; i < 9; i++) {
    const s = SLOT_EFF[i];
    const effByte  = payload[s.eff] ?? 0;
    const extra    = s.extraByte >= 0 ? ((payload[s.extraByte] ?? 0) & s.extraMask) << s.extraShift : 0;
    const bit8     = ((payload[s.bit8Byte] ?? 0) & 0x01) << 7;
    const id       = ((effByte & 0xFE) >> 1) + extra + bit8 - s.minus;
    const on       = (effByte & 1) === 1;

    const catalogId  = id;
    const recognized = byId.has(catalogId);
    const fx = recognized ? byId.get(catalogId)! : null;

    // Parâmetros: bit-packing ainda não decodificado. Retorna zeros para não quebrar a UI.
    const values = fx ? fx.params.map(() => 0) : [];

    const rawStart = Math.max(0, s.eff - 1);
    const rawMod   = payload.slice(rawStart, rawStart + 16);

    slots.push({
      slotIdx: i,
      id,
      catalogId,
      recognized,
      on,
      byte12: 0,
      values,
      rawMod,
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

// O effectId calculado pela fórmula bit-packed é diretamente o Prm1 do catálogo.
// A tabela SYSEX_TO_CATALOG_ID anterior estava baseada na fórmula errada (mod[1]|mod[2]).
// Mantida aqui apenas para referência histórica; não é usada em parseBinaryDump.
/** @deprecated Não usar — effectId já é o catalogId diretamente. */
export const SYSEX_TO_CATALOG_ID: Record<number, number> = {};

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
