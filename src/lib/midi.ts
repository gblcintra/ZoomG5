/**
 * Camada de MIDI para falar com a G5 via Web MIDI.
 *
 * A Zoom nunca publicou o SysEx da G5. O que se sabe da família:
 * as mensagens têm o formato F0 52 00 <modelo> <comando> ... F7,
 * onde 0x52 é o fabricante (Zoom) e <modelo> é um byte por aparelho.
 * O modelo da G5 a gente descobre com um Identity Request, que é
 * MIDI padrão e não depende de engenharia reversa.
 */

export const SYSEX_START = 0xf0;
export const SYSEX_END = 0xf7;
export const ZOOM_ID = 0x52;

/** Identity Request universal — todo aparelho MIDI responde. */
export const IDENTITY_REQUEST = [0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7];

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
