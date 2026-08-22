import { useState } from "react";
import {
  Zap, Download, Music2, Settings2, ChevronRight,
  Loader2, AlertTriangle, Info, Radio,
} from "lucide-react";
import { MidiConsole } from "./components/MidiConsole";
import { PedalUnit } from "./components/PedalUnit";
import { generatePatch, type Brief } from "./lib/generate";
import { downloadPatch, type Patch } from "./lib/g5p";

const IDEAS = [
  "Lead cremoso com sustain longo, tipo Gilmour",
  "Crunch de rock clássico, dinâmico na palhetada",
  "Clean funk com wah automático",
  "Metal moderno, grave apertado, palm mute",
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
      <header className="site-header">
        <div className="site-header-brand">
          <span className="header-led" aria-hidden="true" />
          <div>
            <h1 className="header-title">Patch Lab</h1>
            <p className="header-sub">Zoom G5 · 144 efeitos · exporta .g5p</p>
          </div>
        </div>
      </header>

      <nav className="tab-bar" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "gerar"}
          className={`tab-btn${tab === "gerar" ? " is-active" : ""}`}
          onClick={() => setTab("gerar")}
        >
          <Music2 size={13} />
          Gerar Patch
        </button>
        <button
          role="tab"
          aria-selected={tab === "midi"}
          className={`tab-btn${tab === "midi" ? " is-active" : ""}`}
          onClick={() => setTab("midi")}
        >
          <Radio size={13} />
          MIDI Console
        </button>
      </nav>

      {tab === "midi" && <MidiConsole />}

      {tab === "gerar" && (
        <div className="gerar-layout">
          {/* Brief form */}
          <section className="card">
            {/* Tone description */}
            <div className="card-section">
              <header className="section-hd">
                <Music2 size={13} className="section-icon" />
                <span className="section-label">Tom desejado</span>
              </header>
              <textarea
                id="d"
                rows={3}
                className="tone-input"
                value={brief.description}
                placeholder="Ex.: lead encorpado com delay ritmado, tipo The Edge, mas com mais grave…"
                onChange={(e) => setBrief({ ...brief, description: e.target.value })}
              />
              <div className="suggestions">
                {IDEAS.map((idea) => (
                  <button
                    key={idea}
                    className="suggestion-chip"
                    onClick={() => setBrief({ ...brief, description: idea })}
                  >
                    <ChevronRight size={11} />
                    {idea}
                  </button>
                ))}
              </div>
            </div>

            <div className="card-divider" />

            {/* Config */}
            <div className="card-section">
              <header className="section-hd">
                <Settings2 size={13} className="section-icon" />
                <span className="section-label">Configuração</span>
              </header>
              <div className="config-grid">
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
            </div>

            {/* Footer with generate button */}
            <div className="card-footer">
              <button className="btn-generate" onClick={run} disabled={busy}>
                {busy ? <Loader2 size={15} className="spin" /> : <Zap size={15} />}
                {busy ? "Montando a cadeia…" : "Gerar Patch"}
              </button>
              {error && (
                <div className="alert alert-error" role="alert">
                  <AlertTriangle size={14} />
                  {error}
                </div>
              )}
            </div>
          </section>

          {/* Result */}
          {patch && (
            <section className="card result-card">
              <div className="result-hd">
                <div>
                  <p className="result-eyebrow">Patch gerado</p>
                  <h2 className="result-title">{patch.name}</h2>
                </div>
                <span className="slot-badge">{patch.slots.length}/9</span>
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

              {patch.notes && <p className="patch-notes">{patch.notes}</p>}

              {patch.warnings.length > 0 && (
                <div className="alert alert-warning" style={{ margin: "0 22px" }}>
                  <AlertTriangle size={14} />
                  {patch.warnings.join(" · ")}
                </div>
              )}

              <div className="result-actions">
                <button className="btn-download" onClick={() => downloadPatch(patch)}>
                  <Download size={14} />
                  Baixar .g5p
                </button>
                <p className="help-text">
                  <Info size={12} />
                  Role o mouse sobre um knob para ajustar antes de exportar.
                </p>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function Choice({
  label, value, options, onPick,
}: { label: string; value: string; options: string[]; onPick: (v: string) => void }) {
  return (
    <div className="choice-group">
      <span className="choice-label">{label}</span>
      <div className="choice-options">
        {options.map((o) => (
          <button
            key={o}
            className={`choice-btn${o === value ? " is-selected" : ""}`}
            onClick={() => onPick(o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
