/**
 * Camada de MIDI para falar com a G5 via Web MIDI.
 *
 * Formato Zoom: F0 52 00 <modelo> <comando> ... F7
 * Modelo da G5 confirmado via Identity Request: 0x5B (firmware 1.20)
 *
 * Comandos conhecidos:
 *   29 → pede dump do patch atual  (resposta: 40 <dados>)
 *   50 → pede dump do banco inteiro (297 patches)
 */

export const SYSEX_START = 0xf0;
export const SYSEX_END   = 0xf7;
export const ZOOM_ID     = 0x52;
export const G5_MODEL    = 0x5b;

/** Identity Request universal — todo aparelho MIDI responde. */
export const IDENTITY_REQUEST = [0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7];

/** Monta um SysEx Zoom: F0 52 00 <model> <cmd> [payload] F7 */
export function zoomSysex(model: number, cmd: number, payload: number[] = []): number[] {
  return [SYSEX_START, ZOOM_ID, 0x00, model, cmd, ...payload, SYSEX_END];
}

/** Pede o dump do patch que está na memória de edição (slot atual). */
export function currentPatchRequest(model: number): number[] {
  return zoomSysex(model, 0x29);
}

/** Pede o dump do banco inteiro (297 patches). */
export function bankDumpRequest(model: number): number[] {
  return zoomSysex(model, 0x50);
}

/**
 * Verifica se a mensagem é um dump de patch da Zoom (cmd 0x28).
 * Devolve o payload (sem cabeçalho/F7) ou null.
 *
 * Formato confirmado: F0 52 00 5B 28 <payload 158 bytes> F7
 * Estrutura do payload:
 *   bytes[0-3]    → header (byte[1] = número do patch no banco)
 *   bytes[4-147]  → 9 módulos × 16 bytes
 *   bytes[148-157]→ nome do patch (10 bytes, 0x00 = espaço)
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

export interface MidiMessage {
  at: number;
  direction: "in" | "out";
  bytes: number[];
}

export function toHex(bytes: number[] | Uint8Array): string {
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

/**
 * Interpreta a resposta de um Identity Request.
 * Formato: F0 7E <ch> 06 02 <fabricante> <família lo> <família hi> ... F7
 */
export function parseIdentity(bytes: number[]): { maker: number; model: number } | null {
  if (bytes[0] !== SYSEX_START || bytes[1] !== 0x7e || bytes[3] !== 0x06 || bytes[4] !== 0x02) {
    return null;
  }
  return { maker: bytes[5], model: bytes[6] };
}

/** Marca uma mensagem como sendo da Zoom e extrai o byte de modelo. */
export function zoomModelOf(bytes: number[]): number | null {
  if (bytes[0] === SYSEX_START && bytes[1] === ZOOM_ID) return bytes[3] ?? null;
  return null;
}

/**
 * Interpreta o payload de um dump de patch (cmd 0x28).
 *
 * Layout confirmado por engenharia reversa do Module.xml e análise dos bytes:
 *   [0-3]    header  (byte[1] = nº do patch no banco, 0-indexed)
 *   [4-147]  9 módulos × 16 bytes, cada módulo:
 *              byte[12]    → status: 0=vazio, 1=ligado, 64=bypass (na chain mas desligado)
 *              byte[13]    → ID do efeito (EfxNoOnMachine do Module.xml = catalog id)
 *              byte[prm-2] → valor do parâmetro Prm_n (1 byte, offset = prm - 2)
 *                            ex: Prm2→byte[0], Prm3→byte[1], …, Prm9→byte[7]
 *              byte[0..0]  se slot vazio (id=0) → todo o módulo é padding
 *   [148-157] nome do patch (ASCII, 0x00 = espaço)
 */
export function parseBinaryDump(
  payload: number[],
  byId: Map<number, { params: Array<{ prm: number }> }>,
): {
  patchNumber: number;
  name: string;
  slots: Array<{ id: number; on: boolean; bypass: boolean; values: number[]; rawMod: number[] }>;
} {
  // Número do patch: não decodificado do header — usar Bank Select/PC do listener MIDI
  const patchNumber = payload[0] ?? 0;

  // Header = 4 bytes [0..3], módulos = 9×16 bytes [4..147], nome = 10 bytes [148..157]
  // 4 + 144 + 10 = 158 ✓
  const name = payload
    .slice(148, 158)
    .map((b) => (b === 0 ? " " : String.fromCharCode(b)))
    .join("")
    .trim();

  const slots: ReturnType<typeof parseBinaryDump>["slots"] = [];

  for (let i = 0; i < 9; i++) {
    const base = 4 + i * 16;
    const mod = payload.slice(base, base + 16);
    const rawMod = [...mod];

    const status = mod[12]; // 0=vazio, 1=on, 64=bypass
    const id = mod[13];     // EfxNoOnMachine = catalog id

    if (id === 0 || !byId.has(id)) continue;

    const on     = status === 1;
    const bypass = status !== 1; // qualquer status != 1 com id válido = bypass

    const fx = byId.get(id)!;
    // byte[prm - 2] guarda o valor do parâmetro Prm_n (1 byte)
    const values = fx.params.map((p) => {
      const byteIdx = p.prm - 2;
      return byteIdx >= 0 && byteIdx < 12 ? (mod[byteIdx] ?? 0) : 0;
    });

    slots.push({ id, on, bypass, values, rawMod });
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
  // sysex: true é obrigatório — sem isso o navegador filtra justamente
  // as mensagens que interessam
  return navigator.requestMIDIAccess({ sysex: true });
}

export function listPorts(access: MIDIAccess): MidiPorts {
  return {
    inputs: Array.from(access.inputs.values()),
    outputs: Array.from(access.outputs.values()),
  };
}

/** Acha a porta que parece ser a pedaleira. */
export function guessZoomPort<T extends MIDIPort>(ports: T[]): T | undefined {
  return ports.find((p) => /zoom|g5/i.test(`${p.name ?? ""} ${p.manufacturer ?? ""}`));
}
