import { useState } from "react";
import { MidiConsole } from "./components/MidiConsole";
import { PedalUnit } from "./components/PedalUnit";
import { generatePatch, type Brief } from "./lib/generate";
import { downloadPatch, type Patch } from "./lib/g5p";

const IDEAS = [
  "lead cremoso com sustain longo, tipo Gilmour",
  "crunch de rock clássico, dinâmico na palhetada",
  "clean funk com wah automático",
  "metal moderno, grave apertado, palm mute",
];

export function App() {
  const [brief, setBrief] = useState<Brief>({
    description: "",
    pickup: "Single coil",
    output: "Fone / interface",
    maxSlots: 5,
  });
  const [patch, setPatch] = useState<(Patch & { warnings: string[] }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"gerar" | "midi">("gerar");
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!brief.description.trim()) {
      setError("Descreva o timbre antes de gerar.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setPatch(await generatePatch(brief));
    } catch (e) {
      setError(`Não deu pra montar o patch: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function tweak(slotIndex: number, paramIndex: number, value: number) {
    setPatch((prev) => {
      if (!prev) return prev;
      const slots = prev.slots.map((s, i) =>
        i === slotIndex
          ? { ...s, values: s.values.map((v, k) => (k === paramIndex ? value : v)) }
          : s
      );
      return { ...prev, slots };
    });
  }

  return (
    <div className="app">
      <header className="head">
        <span className="head-dot" />
        <div>
          <h1>Patch Lab</h1>
          <p>Zoom G5 · 144 efeitos · exporta .g5p</p>
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === "gerar" ? "tab on" : "tab"} onClick={() => setTab("gerar")}>
          Gerar
        </button>
        <button className={tab === "midi" ? "tab on" : "tab"} onClick={() => setTab("midi")}>
          MIDI
        </button>
      </nav>

      {tab === "midi" && <MidiConsole />}

      {tab === "gerar" && (
      <section className="panel">
        <label className="lbl" htmlFor="d">Que som você quer</label>
        <textarea
          id="d"
          rows={3}
          value={brief.description}
          placeholder="Ex.: lead encorpado com delay ritmado, tipo The Edge, mas com mais grave"
          onChange={(e) => setBrief({ ...brief, description: e.target.value })}
        />
        <div className="chips">
          {IDEAS.map((i) => (
            <button key={i} className="chip" onClick={() => setBrief({ ...brief, description: i })}>
              {i}
            </button>
          ))}
        </div>

        <div className="fields">
          <Choice
            label="Captador"
            value={brief.pickup}
            options={["Single coil", "Humbucker", "P90", "Ativo"]}
            onPick={(v) => setBrief({ ...brief, pickup: v })}
          />
          <Choice
            label="Saída"
            value={brief.output}
            options={["Fone / interface", "Cubo de guitarra", "PA / mesa"]}
            onPick={(v) => setBrief({ ...brief, output: v })}
          />
          <Choice
            label="Slots"
            value={String(brief.maxSlots)}
            options={["3", "4", "5", "6", "7"]}
            onPick={(v) => setBrief({ ...brief, maxSlots: Number(v) })}
          />
        </div>

        <button className="go" onClick={run} disabled={busy}>
          {busy ? "Montando a cadeia…" : "Gerar patch"}
        </button>
        {error && <p className="err">{error}</p>}
      </section>
      )}

      {tab === "gerar" && patch && (
        <section className="panel">
          <div className="result-head">
            <div>
              <span className="lbl">Patch</span>
              <h2>{patch.name}</h2>
            </div>
            <span className="count">{patch.slots.length}/9</span>
          </div>

          <div className="rack">
            {patch.slots.map((slot, i) => (
              <PedalUnit
                key={i}
                slot={slot}
                index={i}
                onChange={(p, v) => tweak(i, p, v)}
              />
            ))}
          </div>

          {patch.notes && <p className="notes">{patch.notes}</p>}
          {patch.warnings.length > 0 && <p className="warn">{patch.warnings.join(" · ")}</p>}

          <div className="actions">
            <button className="go small" onClick={() => downloadPatch(patch)}>Baixar .g5p</button>
          </div>
          <p className="help">Role o mouse sobre um knob para ajustar antes de exportar.</p>
        </section>
      )}
    </div>
  );
}

function Choice({
  label, value, options, onPick,
}: { label: string; value: string; options: string[]; onPick: (v: string) => void }) {
  return (
    <div className="field">
      <span className="lbl">{label}</span>
      <div className="steps">
        {options.map((o) => (
          <button key={o} className={o === value ? "step on" : "step"} onClick={() => onPick(o)}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
