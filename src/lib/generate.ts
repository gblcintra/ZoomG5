import { BY_ID, catalogForPrompt } from "./catalog";
import { clampSlot, type Patch, type Slot } from "./g5p";

export interface Brief {
  description: string;
  pickup: string;
  output: string;
  maxSlots: number;
}

interface AiSlot { id: number; on?: number | boolean; p?: Record<string, unknown> }
interface AiPatch { name?: string; notes?: string; slots?: AiSlot[] }

function buildPrompt(brief: Brief): string {
  return `Você é sound designer especialista na Zoom G5. Monte um patch.

EFEITOS DISPONÍVEIS — "id NOME [categoria] knob:faixa":
${catalogForPrompt()}

PEDIDO: ${brief.description}
Captador: ${brief.pickup}
Saída: ${brief.output}
Máximo de slots: ${brief.maxSlots}

Regras:
- Use SOMENTE os ids acima. Ordem dos slots = ordem real da cadeia
  (dinâmica -> drive -> amp -> modulação -> delay -> reverb).
- No máximo 1 efeito de categoria AMP.
- Em "p", use os nomes de knob exatamente como listados. Knobs omitidos ficam no padrão.
- Saída em cubo de guitarra: evite AMP. Em fone, interface ou PA: use AMP.
- "notes": português, até 200 caracteres, o que ajustar primeiro.
- "name": até 10 caracteres.

Responda SOMENTE com JSON:
{"name":"...","notes":"...","slots":[{"id":92,"on":1,"p":{"Gain":70,"Level":100}}]}`;
}

/**
 * Chama o modelo e devolve um patch já validado.
 * A serialização do .g5p NÃO passa pelo modelo — ele só escolhe efeitos e valores.
 */
export async function generatePatch(brief: Brief): Promise<Patch & { warnings: string[] }> {
  const res = await fetch("/api/anthropic/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: buildPrompt(brief) }],
    }),
  });
  if (!res.ok) throw new Error(`API respondeu ${res.status}`);

  const data = (await res.json()) as { content: { type: string; text?: string }[] };
  const text = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .replace(/```json|```/g, "")
    .trim();

  const parsed = JSON.parse(
    text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)
  ) as AiPatch;

  const warnings: string[] = [];
  const slots: Slot[] = [];

  for (const s of parsed.slots ?? []) {
    const fx = BY_ID.get(Number(s.id));
    if (!fx) {
      warnings.push(`id ${s.id} não existe na G5 — slot ignorado`);
      continue;
    }
    slots.push({ id: fx.id, on: s.on !== 0 && s.on !== false, values: clampSlot(fx, s.p ?? {}) });
    if (slots.length === 9) break;
  }
  if (!slots.length) throw new Error("o modelo não devolveu nenhum slot válido");

  return { name: (parsed.name ?? "PATCH").slice(0, 10), notes: parsed.notes, slots, warnings };
}
