/**
 * midi.ts — Zoom G5 MIDI/SysEx helpers
 *
 * Formato Zoom:
 *
 *   F0 52 00 <modelo> <comando> <payload> F7
 *
 * Dump de patch:
 *
 *   comando = 0x28
 *   payload = 158 bytes
 *
 * Estrutura conhecida:
 *
 *   payload[0..1]       = header
 *   payload[2..145]     = 9 módulos × 16 bytes
 *   payload[146..155]   = nome do patch
 *   payload[156..157]   = trailer
 *
 * IMPORTANTE:
 *
 * O catalog NÃO é usado para determinar o valor atual dos parâmetros.
 * Ele fornece apenas:
 *
 *   - nome do efeito
 *   - nome dos parâmetros
 *   - limites
 *   - sprites
 *   - dimensões
 *   - categorias
 *
 * Os valores atuais vêm do dump real da G5.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Protocolo SysEx Zoom
// ─────────────────────────────────────────────────────────────────────────────

export const SYSEX_START = 0xf0;
export const SYSEX_END = 0xf7;
export const ZOOM_ID = 0x52;
export const G5_MODEL = 0x5b;

export const IDENTITY_REQUEST = [
  0xf0,
  0x7e,
  0x7f,
  0x06,
  0x01,
  0xf7,
];

export function zoomSysex(
  model: number,
  cmd: number,
  payload: number[] = [],
): number[] {
  return [
    SYSEX_START,
    ZOOM_ID,
    0x00,
    model,
    cmd,
    ...payload,
    SYSEX_END,
  ];
}

/**
 * Solicita o patch atual.
 */
export function currentPatchRequest(model: number): number[] {
  return zoomSysex(model, 0x29);
}

/**
 * Habilita edição de parâmetros.
 */
export function paramEditEnable(model: number): number[] {
  return zoomSysex(model, 0x50);
}

/**
 * Verifica se a mensagem é um dump de patch.
 *
 * Comando:
 *
 *   0x28
 *
 * Retorna somente o payload.
 */
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

// ─────────────────────────────────────────────────────────────────────────────
// MIDI
// ─────────────────────────────────────────────────────────────────────────────

export interface MidiMessage {
  at: number;
  direction: "in" | "out";
  bytes: number[];
}

export function toHex(
  bytes: number[] | Uint8Array | null | undefined,
): string {
  if (!bytes) return "";

  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

export function fromHex(text: string): number[] {
  const parts = text
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);

  return parts.map((p) => {
    const n = parseInt(
      p.replace(/^0x/i, ""),
      16,
    );

    if (
      Number.isNaN(n) ||
      n < 0 ||
      n > 0xff
    ) {
      throw new Error(`byte inválido: ${p}`);
    }

    return n;
  });
}

export function parseIdentity(
  bytes: number[],
): {
  maker: number;
  model: number;
} | null {
  if (
    bytes[0] !== SYSEX_START ||
    bytes[1] !== 0x7e ||
    bytes[3] !== 0x06 ||
    bytes[4] !== 0x02
  ) {
    return null;
  }

  return {
    maker: bytes[5],
    model: bytes[6],
  };
}

export function zoomModelOf(
  bytes: number[],
): number | null {
  if (
    bytes[0] === SYSEX_START &&
    bytes[1] === ZOOM_ID
  ) {
    return bytes[3] ?? null;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Estrutura dos módulos
// ─────────────────────────────────────────────────────────────────────────────

export interface G5ParamMapping {
  /**
   * Byte físico dentro do módulo.
   *
   * Exemplo:
   *
   *   byte: 12
   *
   * significa rawMod[12].
   */
  byte: number;

  /**
   * Máscara opcional.
   */
  mask?: number;

  /**
   * Shift para a direita.
   */
  shift?: number;

  /**
   * Offset matemático depois da leitura.
   */
  offset?: number;

  /**
   * Multiplicador.
   */
  scale?: number;
}

/**
 * Estrutura de um slot decodificado.
 */
export interface DumpSlot {
  slotIdx: number;

  /**
   * Effect Type calculado a partir da SysEx.
   */
  id: number;

  /**
   * ID usado para procurar no catálogo.
   */
  catalogId: number;

  recognized: boolean;

  /**
   * Estado ON/OFF.
   */
  on: boolean;

  /**
   * Byte 12 do módulo físico.
   */
  byte12: number;

  /**
   * Valores dos parâmetros mostrados no front.
   */
  values: number[];

  /**
   * Valores crus.
   *
   * -1 = ainda não descoberto.
   */
  rawValues: number[];

  /**
   * 16 bytes físicos do módulo.
   */
  rawMod: number[];

  /**
   * Offset absoluto do módulo no payload.
   */
  offset: number;

  /**
   * Alias dos bytes físicos.
   */
  moduleBytes: number[];
}

/**
 * Compatibilidade com PedalUnit.
 */
export type Slot = DumpSlot;

// ─────────────────────────────────────────────────────────────────────────────
// Effect ID
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Offsets do effectId por slot.
 *
 * Fórmula:
 *
 * effectId =
 *
 *   ((payload[eff] & 0xFE) >> 1)
 *   + ((payload[extraByte] & extraMask) << extraShift)
 *   + ((payload[bit8Byte] & 1) << 7)
 *   - minus
 *
 * bit 0 de payload[eff] = ON/OFF
 */
const SLOT_EFF: ReadonlyArray<{
  eff: number;
  extraByte: number;
  extraMask: number;
  extraShift: number;
  bit8Byte: number;
  minus: number;
}> = [
    {
      eff: 1,
      extraByte: 0,
      extraMask: 0x40,
      extraShift: 0,
      bit8Byte: 2,
      minus: 0,
    },

    {
      eff: 14,
      extraByte: 8,
      extraMask: 0x02,
      extraShift: 5,
      bit8Byte: 15,
      minus: 0,
    },

    {
      eff: 28,
      extraByte: 24,
      extraMask: 0x08,
      extraShift: 3,
      bit8Byte: 29,
      minus: 0,
    },

    {
      eff: 42,
      extraByte: 40,
      extraMask: 0x20,
      extraShift: 1,
      bit8Byte: 43,
      minus: 0,
    },

    {
      eff: 55,
      extraByte: 48,
      extraMask: 0x01,
      extraShift: 6,
      bit8Byte: 57,
      minus: 0,
    },

    {
      eff: 69,
      extraByte: 64,
      extraMask: 0x04,
      extraShift: 4,
      bit8Byte: 70,
      minus: 0,
    },

    {
      eff: 83,
      extraByte: 80,
      extraMask: 0x10,
      extraShift: 2,
      bit8Byte: 84,
      minus: 0,
    },

    {
      eff: 97,
      extraByte: 96,
      extraMask: 0x40,
      extraShift: 0,
      bit8Byte: 98,
      minus: 0,
    },

    {
      eff: 110,
      extraByte: 123,
      extraMask: 0x10,
      extraShift: 3,
      bit8Byte: 111,
      minus: 0,
    },
  ];

function calculateEffectId(
  payload: number[],
  slotIndex: number,
): {
  id: number;
  on: boolean;
  source: {
    effByte: number;
    bit8Byte: number;
    extraByte: number;
  };
} {
  const s = SLOT_EFF[slotIndex];

  if (!s) {
    return {
      id: 0,
      on: false,
      source: {
        effByte: -1,
        bit8Byte: -1,
        extraByte: -1,
      },
    };
  }

  const effByte = payload[s.eff] ?? 0;

  const extra =
    s.extraByte >= 0
      ? ((payload[s.extraByte] ?? 0) & s.extraMask) << s.extraShift
      : 0;

  const bit8 =
    ((payload[s.bit8Byte] ?? 0) & 0x01) << 7;

  const base = (effByte & 0xFE) >> 1;

  const id =
    base +
    extra +
    bit8 -
    s.minus;

  return {
    id,
    on: (effByte & 0x01) !== 0,

    source: {
      effByte,
      bit8Byte: payload[s.bit8Byte] ?? 0,
      extraByte:
        s.extraByte >= 0
          ? payload[s.extraByte] ?? 0
          : -1,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapeamento dos parâmetros
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mapeamento físico dos parâmetros já conhecidos.
 *
 * ATENÇÃO:
 *
 * Não vamos inventar os offsets dos outros efeitos.
 *
 * Conforme descobrirmos pelo Diff A/B, adicionamos aqui.
 *
 * NoiseGate:
 *
 * módulo observado:
 *
 *   0c 00 19 00 00 00 02 00 00 00 00 00 09 1c 00 00
 *
 *   byte[12] = 09
 *   byte[13] = 1c
 *
 * O 0x09 corresponde ao THRSH inicial.
 */
const G5_PARAM_MAP: Record<
  number,
  G5ParamMapping[]
> = {
  /**
   * NoiseGate
   *
   * catalog ID = 28 = 0x1c
   *
   * params:
   *
   *   THRSH
   *   Level
   *
   * THRSH já possui evidência direta.
   */
  28: [
    {
      byte: 12,
      mask: 0x7f,
    },

    /**
     * Level:
     *
     * ainda não descoberto.
     *
     * -1 significa "não mapeado".
     */
    {
      byte: -1,
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Decoder de parâmetro
// ─────────────────────────────────────────────────────────────────────────────

function decodeMappedParameter(
  rawMod: number[],
  mapping: G5ParamMapping,
): number | null {
  if (mapping.byte < 0) {
    return null;
  }

  if (mapping.byte >= rawMod.length) {
    return null;
  }

  let value =
    rawMod[mapping.byte] ?? 0;

  if (mapping.mask != null) {
    value &= mapping.mask;
  }

  if (mapping.shift != null) {
    value >>= mapping.shift;
  }

  if (mapping.offset != null) {
    value += mapping.offset;
  }

  if (mapping.scale != null) {
    value = Math.round(
      value * mapping.scale,
    );
  }

  return value;
}

/**
 * Decodifica todos os parâmetros de um efeito.
 *
 * O catálogo fornece quantos parâmetros existem.
 * O dump fornece os valores.
 */
function decodeEffectParameters(
  effectId: number,
  rawMod: number[],
  params: Array<{
    prm: number;
    prmOffset?: number;
  }>,
): {
  values: number[];
  rawValues: number[];
} {
  const mappings =
    G5_PARAM_MAP[effectId] ?? [];

  const values: number[] = [];
  const rawValues: number[] = [];

  for (
    let i = 0;
    i < params.length;
    i++
  ) {
    const mapping = mappings[i];

    if (!mapping) {
      /**
       * Ainda não descoberto.
       *
       * Mantemos 0 para a UI não quebrar,
       * mas rawValues recebe -1 para deixar
       * explícito que não é um valor real.
       */
      values.push(0);
      rawValues.push(-1);
      continue;
    }

    const decoded =
      decodeMappedParameter(
        rawMod,
        mapping,
      );

    if (decoded == null) {
      values.push(0);
      rawValues.push(-1);
      continue;
    }

    values.push(decoded);
    rawValues.push(decoded);
  }

  return {
    values,
    rawValues,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser do dump
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interpreta o payload de um dump de patch.
 *
 * Retorna os 9 slots.
 *
 * O catálogo NÃO fornece os valores.
 * O dump fornece os valores.
 */
export function parseBinaryDump(
  payload: number[],
  byId: Map<
    number,
    {
      params: Array<{
        prm: number;
        prmOffset?: number;
        max?: number;
      }>;
    }
  >,
): {
  patchNumber: number;
  name: string;
  slots: DumpSlot[];
} {
  const patchNumber = payload[0] ?? 0;

  // Nome do patch.
  const name = payload
    .slice(146, 156)
    .map((b) =>
      b === 0
        ? ""
        : String.fromCharCode(b),
    )
    .join("")
    .trim();

  const slots: DumpSlot[] = [];

  for (let i = 0; i < SLOT_EFF.length; i++) {
    // const s = SLOT_EFF[i];

    // ================================================================
    // EFFECT TYPE
    // ================================================================

    // const effByte = payload[s.eff] ?? 0;

    // const extra = s.extraByte >= 0
    //   ? (
    //     (payload[s.extraByte] ?? 0) &
    //     s.extraMask
    //   ) << s.extraShift
    //   : 0;

    // const bit8 = ((payload[s.bit8Byte] ?? 0) & 0x01) << 7;
    const effect = calculateEffectId(
      payload,
      i,
    );

    // console.log(
    //   "SLOT 9 EFFECT CALC",
    //   calculateEffectId(payload, 8),
    // );

    const id = effect.id;
    const on = effect.on;

    // ================================================================
    // MÓDULO PARA O FRONT / PARÂMETROS
    // ================================================================
    //
    // Os módulos físicos são úteis para análise dos parâmetros,
    // mas NÃO são usados para descobrir o Effect ID.
    //
    const moduleOffset =
      2 + i * 16;

    const rawMod = getModule(
      payload,
      i,
    );

    console.log("=== SLOT 9 STRUCTURE ===");

    const slot9 = getModule(payload, 8);

    console.table(
      slot9.map((value, index) => ({
        moduleByte: index,
        payloadOffset: 130 + index,
        hex: value.toString(16).padStart(2, "0"),
        decimal: value,
      })),
    );

    // ================================================================
    // CATÁLOGO
    // ================================================================

    const catalogId = id;

    const fx = byId.get(catalogId,);

    const recognized = !!fx;

    // ================================================================
    // PARÂMETROS
    // ================================================================

    let values: number[] = [];
    let rawValues: number[] = [];

    if (fx) {
      const decoded =
        decodeEffectParameters(
          catalogId,
          rawMod,
          fx.params,
        );

      values =
        decoded.values;

      rawValues =
        decoded.rawValues;
    }

    // ================================================================
    // SLOT
    // ================================================================

    slots.push({
      slotIdx: i,

      // ID real calculado pela fórmula da G5.
      id,

      // ID do catálogo.
      catalogId,

      recognized,

      on,

      // Byte 12 do bloco físico.
      byte12:
        rawMod[12] ?? 0,

      values,

      rawValues,

      rawMod: [
        ...rawMod,
      ],

      offset:
        moduleOffset,

      moduleBytes: [
        ...rawMod,
      ],
    });
  }

  // ================================================================
  // DEBUG
  // ================================================================
  console.log("=== SLOT 9 DEBUG ===");

  console.log({
    effectIdCalculado: slots[8]?.id,
    on: slots[8]?.on,

    payload110: payload[110],
    payload111: payload[111],

    slot9Modulo: getModule(payload, 8),

    payload130_145: payload.slice(130, 146),
  });

  console.log(
    "SLOT 9 HEX:",
    toHex(payload.slice(130, 146)),
  );
  return {
    patchNumber,
    name,
    slots,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MIDI Ports
// ─────────────────────────────────────────────────────────────────────────────

export interface MidiPorts {
  inputs: MIDIInput[];
  outputs: MIDIOutput[];
}

export async function openMidi(): Promise<MIDIAccess> {
  if (!navigator.requestMIDIAccess) {
    throw new Error(
      "Este navegador não tem Web MIDI. Use Chrome ou Edge.",
    );
  }

  return navigator.requestMIDIAccess({
    sysex: true,
  });
}

export function listPorts(
  access: MIDIAccess,
): MidiPorts {
  return {
    inputs: Array.from(
      access.inputs.values(),
    ),

    outputs: Array.from(
      access.outputs.values(),
    ),
  };
}

export function guessZoomPort<T extends MIDIPort>(
  ports: T[],
): T | undefined {
  return ports.find((p) =>
    /zoom|g5/i.test(
      `${p.name ?? ""} ${p.manufacturer ?? ""}`,
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compatibilidade histórica
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O effectId calculado pela fórmula bit-packed
 * é diretamente o catalogId.
 *
 * A tabela antiga não é mais utilizada.
 */
export const SYSEX_TO_CATALOG_ID: Record<
  number,
  number
> = {};

// ─────────────────────────────────────────────────────────────────────────────
// Tabela de efeitos da G5
// ─────────────────────────────────────────────────────────────────────────────

export const ZOOM_G5_EFFECTS: Record<
  number,
  string
> = {
  27: "ZNR",
  28: "NoiseGate",
  29: "DirtyGate",
  30: "GraphicEQ",
  31: "ParaEQ",
  32: "CombFLTR",
  33: "AutoWah",
  34: "Resonance",
  35: "Step",
  36: "Cry",
  37: "Octave",
  38: "Tremolo",
  39: "Phaser",
  40: "RingMod",
  41: "Chorus",
  42: "Detune",
  43: "VintageCE",
  44: "StereoCho",
  45: "Ensemble",
  46: "Vin Flanger",
  47: "DynaFLNGR",
  48: "Vibrato",
  49: "PitchSHFT",
  50: "BendCho",
  51: "MonoPitch",
  52: "HPS",
  53: "Delay",
  54: "TapeEcho",
  55: "ModDelay",
  56: "AnalogDLY",
  57: "ReverseDL",
  58: "MultiTapD",
  59: "DynaDelay",
  60: "Hall",
  61: "Room",
  62: "TiledRoom",
  63: "Spring",
  64: "Arena",
  65: "EarlyRef",
  66: "Air",
  67: "PedalVox",
  68: "PedalCry",
  69: "PDL Pitch",
  70: "PdlMnPit",
  71: "Booster",
  72: "OverDrive",
  73: "T Scream",
  74: "Governor",
  75: "Dist +",
  76: "Dist 1",
  77: "Squeak",
  78: "FuzzSmile",
  79: "GreatMuff",
  80: "MetalWRLD",
  81: "HotBox",
  82: "Z Wild",
  83: "Lead",
  84: "ExtremeDS",
  85: "Aco.Sim",
  86: "Z Clean",
  87: "Z MP1",
  88: "Z Bottom",
  89: "Z Dream",
  90: "Z Scream",
  91: "Z Neos",
  92: "FD Combo",
  93: "VX Combo",
  94: "US Blues",
  95: "BG Crunch",
  96: "HW Stack",
  97: "Trangerine",
  98: "MS Crunch",
  99: "MS Drive",
  100: "BG Drive",
  101: "DZ Drive",
  102: "TW Rock",
  103: "Match 30",
  104: "FD Vibro",
  105: "HD Reverb",
  106: "Flanger",
};

export const ZOOM_G5_EFFECT_IDS: Record<
  string,
  number
> = Object.fromEntries(
  Object.entries(
    ZOOM_G5_EFFECTS,
  ).map(
    ([id, name]) => [
      name,
      Number(id),
    ],
  ),
);

// ─────────────────────────────────────────────────────────────────────────────
// NoiseGate — dados conhecidos
// ─────────────────────────────────────────────────────────────────────────────

export const NOISE_GATE = {
  id: 28,

  hexId: 0x1c,

  params: {
    THRSH: {
      prm: 2,
      init: 9,
      max: 24,
      prmOffset: 1,
    },

    Level: {
      prm: 3,
      init: 100,
      max: 150,
    },
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Ferramentas de análise
// ─────────────────────────────────────────────────────────────────────────────

export function effectName(
  id: number,
): string {
  return (
    ZOOM_G5_EFFECTS[id] ??
    `Unknown(${id})`
  );
}

export function effectId(
  name: string,
): number | null {
  return (
    ZOOM_G5_EFFECT_IDS[name] ??
    null
  );
}

export function readLE16(
  bytes: number[] | Uint8Array,
  offset: number,
): number | null {
  if (
    offset < 0 ||
    offset + 1 >= bytes.length
  ) {
    return null;
  }

  return (
    bytes[offset] |
    (bytes[offset + 1] << 8)
  );
}

export function readLE32(
  bytes: number[] | Uint8Array,
  offset: number,
): number | null {
  if (
    offset < 0 ||
    offset + 3 >= bytes.length
  ) {
    return null;
  }

  return (
    (
      bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)
    ) >>> 0
  );
}

function toU8(
  data:
    | number[]
    | Uint8Array
    | null
    | undefined,
): Uint8Array {
  if (!data) {
    return new Uint8Array();
  }

  return data instanceof Uint8Array
    ? data
    : Uint8Array.from(data);
}

// ─────────────────────────────────────────────────────────────────────────────
// Busca de Effect IDs
// ─────────────────────────────────────────────────────────────────────────────

export function findEffectCandidates(
  data: number[] | Uint8Array,
) {
  const bytes = toU8(data);

  const candidates: {
    offset: number;
    offsetHex: string;
    value: number;
    hex: string;
    name: string;
  }[] = [];

  for (
    let i = 0;
    i < bytes.length;
    i++
  ) {
    const value = bytes[i];

    if (
      value < 27 ||
      value > 106
    ) {
      continue;
    }

    candidates.push({
      offset: i,

      offsetHex:
        `0x${i
          .toString(16)
          .padStart(4, "0")}`,

      value,

      hex:
        value
          .toString(16)
          .padStart(2, "0"),

      name:
        effectName(value),
    });
  }

  return candidates;
}

// ─────────────────────────────────────────────────────────────────────────────
// NoiseGate candidates
// ─────────────────────────────────────────────────────────────────────────────

export function findNoiseGateCandidates(
  data: number[] | Uint8Array,
) {
  const bytes = toU8(data);

  const result: {
    offset: number;
    offsetHex: string;
    id: number;
    hex: string;
    name: string;
    before: number[];
    after: number[];
  }[] = [];

  for (
    let i = 0;
    i < bytes.length;
    i++
  ) {
    if (
      bytes[i] !==
      NOISE_GATE.hexId
    ) {
      continue;
    }

    result.push({
      offset: i,

      offsetHex:
        `0x${i
          .toString(16)
          .padStart(4, "0")}`,

      id: 28,

      hex: "1c",

      name: "NoiseGate",

      before: Array.from(
        bytes.slice(
          Math.max(0, i - 8),
          i,
        ),
      ),

      after: Array.from(
        bytes.slice(
          i + 1,
          i + 9,
        ),
      ),
    });
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// NoiseGate módulo
// ─────────────────────────────────────────────────────────────────────────────

export function findNoiseGateModuleCandidates(
  data: number[] | Uint8Array,
) {
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

  for (
    let i = 0;
    i + 16 <= bytes.length;
    i++
  ) {
    const mod =
      bytes.slice(i, i + 16);

    if (
      mod[13] !==
      0x1c
    ) {
      continue;
    }

    result.push({
      offset: i,

      offsetHex:
        `0x${i
          .toString(16)
          .padStart(4, "0")}`,

      status:
        mod[12],

      id:
        mod[13],

      effect:
        "NoiseGate",

      hex:
        toHex(mod),

      rawMod:
        Array.from(mod),
    });
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Análise completa
// ─────────────────────────────────────────────────────────────────────────────

export function analyzeG5Dump(
  data: number[] | Uint8Array,
) {
  const bytes = toU8(data);

  const result = {
    length:
      bytes.length,

    hex:
      toHex(bytes),

    noiseGateCandidates:
      findNoiseGateCandidates(
        bytes,
      ),

    noiseGateModuleCandidates:
      findNoiseGateModuleCandidates(
        bytes,
      ),

    effectCandidates:
      findEffectCandidates(
        bytes,
      ),
  };

  console.group(
    "Zoom G5 dump analysis",
  );

  console.log(
    "Length:",
    result.length,
  );

  console.log(
    "HEX:",
    result.hex,
  );

  console.log(
    "NoiseGate byte-scan candidates:",
    result.noiseGateCandidates,
  );

  console.log(
    "NoiseGate 16-byte module candidates:",
    result.noiseGateModuleCandidates,
  );

  console.log(
    "All effect-ID candidates:",
    result.effectCandidates,
  );

  console.groupEnd();

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────────────────

export function cloneBytes(
  data: number[] | Uint8Array,
): Uint8Array {
  return Uint8Array.from(
    data instanceof Uint8Array
      ? data
      : Array.from(data ?? []),
  );
}

export function hexWindow(
  data: number[] | Uint8Array,
  offset: number,
  before = 8,
  after = 8,
) {
  const bytes =
    toU8(data);

  const start =
    Math.max(
      0,
      offset - before,
    );

  const end =
    Math.min(
      bytes.length,
      offset + after + 1,
    );

  return {
    start,
    end,
    offset,

    bytes:
      Array.from(
        bytes.slice(
          start,
          end,
        ),
      ),

    hex:
      toHex(
        bytes.slice(
          start,
          end,
        ),
      ),
  };
}

export function createDumpSnapshot(
  data: number[] | Uint8Array,
) {
  const bytes =
    cloneBytes(data);

  return {
    bytes,

    length:
      bytes.length,

    hex:
      toHex(bytes),

    analyze() {
      return analyzeG5Dump(
        bytes,
      );
    },

    diff(
      other:
        | number[]
        | Uint8Array,
    ) {
      return diffBytes(
        bytes,
        other,
      );
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Módulos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna os 16 bytes de um módulo.
 *
 * Layout:
 *
 *   header[0..1]
 *
 *   módulo 0:
 *     payload[2..17]
 *
 *   módulo 1:
 *     payload[18..33]
 *
 *   ...
 *
 *   módulo 8:
 *     payload[130..145]
 */
export function getModule(
  payload:
    | number[]
    | Uint8Array,
  moduleIndex: number,
): number[] {
  const bytes =
    toU8(payload);

  const base =
    2 + moduleIndex * 16;

  return Array.from(
    bytes.slice(
      base,
      base + 16,
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Diff
// ─────────────────────────────────────────────────────────────────────────────

export function diffBytes(
  a: number[] | Uint8Array,
  b: number[] | Uint8Array,
) {
  const aa =
    toU8(a);

  const bb =
    toU8(b);

  const max =
    Math.max(
      aa.length,
      bb.length,
    );

  const diff: {
    offset: number;
    offsetHex: string;
    a: number | null;
    b: number | null;
    aHex: string | null;
    bHex: string | null;
  }[] = [];

  for (
    let i = 0;
    i < max;
    i++
  ) {
    const av =
      i < aa.length
        ? aa[i]
        : null;

    const bv =
      i < bb.length
        ? bb[i]
        : null;

    if (av === bv) {
      continue;
    }

    diff.push({
      offset: i,

      offsetHex:
        `0x${i
          .toString(16)
          .padStart(4, "0")}`,

      a: av,

      b: bv,

      aHex:
        av == null
          ? null
          : av
            .toString(16)
            .padStart(2, "0"),

      bHex:
        bv == null
          ? null
          : bv
            .toString(16)
            .padStart(2, "0"),
    });
  }

  return diff;
}

export function formatDiff(
  a: number[] | Uint8Array,
  b: number[] | Uint8Array,
): string {
  return diffBytes(a, b)
    .map(
      (d) =>
        `${d.offsetHex}: ${d.aHex ?? "--"
        } -> ${d.bHex ?? "--"
        }`,
    )
    .join("\n");
}

/**
 * Mapeia cada diferença para:
 *
 *   offset absoluto
 *   módulo
 *   byte dentro do módulo
 */
export function analyzeModuleDiff(
  a: number[] | Uint8Array,
  b: number[] | Uint8Array,
) {
  return diffBytes(a, b)
    .map((d) => {
      const o =
        d.offset;

      let moduleIndex:
        | number
        | null = null;

      let moduleOffset:
        | number
        | null = null;

      /**
       * Layout:
       *
       * header:
       *   0..1
       *
       * módulos:
       *   2..145
       *
       * nome:
       *   146..155
       *
       * trailer:
       *   156..157
       */
      if (
        o >= 2 &&
        o < 146
      ) {
        const relative =
          o - 2;

        moduleIndex =
          Math.floor(
            relative / 16,
          );

        moduleOffset =
          relative % 16;
      }

      return {
        ...d,

        moduleIndex,

        moduleOffset,

        moduleOffsetHex:
          moduleOffset == null
            ? null
            : `0x${moduleOffset
              .toString(16)
              .padStart(2, "0")}`,
      };
    });
}