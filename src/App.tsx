import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Zap, Download, Music2, Settings2, ChevronRight,
  Loader2, AlertTriangle, Info, Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MidiConsole } from "@/components/MidiConsole";
import { PedalUnit } from "@/components/PedalUnit";
import { generatePatch, type Brief } from "@/lib/generate";
import { downloadPatch, type Patch } from "@/lib/g5p";

/* ── Motion variants ─────────────────────────────────────── */
const easeOut = [0.25, 0.46, 0.45, 0.94] as const;

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -6 },
};

const chipList = {
  animate: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
};
const chipItem = {
  initial: { opacity: 0, scale: 0.88 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.18 } },
};

const rackList = {
  animate: { transition: { staggerChildren: 0.065 } },
};
const rackItem = {
  initial: { opacity: 0, x: -16 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.24, ease: easeOut } },
};

/* ── Suggestion ideas ────────────────────────────────────── */
const IDEAS = [
  "Lead cremoso com sustain longo, tipo Gilmour",
  "Crunch de rock clássico, dinâmico na palhetada",
  "Clean funk com wah automático",
  "Metal moderno, grave apertado, palm mute",
];

/* ══════════════════════════════════════════════════════════ */
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
    if (!brief.description.trim()) { setError("Descreva o timbre antes de gerar."); return; }
    setBusy(true);
    setError(null);
    try { setPatch(await generatePatch(brief)); }
    catch (e) { setError(`Não deu pra montar o patch: ${(e as Error).message}`); }
    finally { setBusy(false); }
  }

  function tweak(slotIndex: number, paramIndex: number, value: number) {
    setPatch((prev) => {
      if (!prev) return prev;
      const slots = prev.slots.map((s, i) =>
        i === slotIndex ? { ...s, values: s.values.map((v, k) => (k === paramIndex ? value : v)) } : s
      );
      return { ...prev, slots };
    });
  }

  return (
    <div className="max-w-[940px] mx-auto px-5 pt-6 pb-20">

      {/* ── Header ─────────────────────────────────────────── */}
      <motion.header
        className="flex items-center gap-3 px-5 py-[13px] bg-surface border border-line rounded-md mb-5"
        style={{ borderTopWidth: 2, borderTopColor: "#252d46" }}
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: easeOut }}
      >
        <motion.span
          className="w-2 h-2 rounded-full bg-signal flex-shrink-0"
          style={{ boxShadow: "0 0 8px #d03a18, 0 0 22px rgba(208,58,24,0.38)" }}
          animate={{ opacity: [1, 0.55, 1] }}
          transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
        />
        <div>
          <h1 className="m-0 text-[13px] font-bold tracking-[0.24em] uppercase text-ink">
            Patch Lab
          </h1>
          <p className="m-0 mt-0.5 text-[11px] text-dim tracking-[0.04em]">
            Zoom G5 · 144 efeitos · exporta .g5p
          </p>
        </div>
      </motion.header>

      {/* ── Tabs ───────────────────────────────────────────── */}
      <motion.nav
        className="flex gap-0.5 mb-[18px]"
        role="tablist"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, delay: 0.15 }}
      >
        {(["gerar", "midi"] as const).map((t) => (
          <motion.button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            whileTap={{ scale: 0.97 }}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2 text-[10.5px] font-bold tracking-[0.13em] uppercase rounded-t-sm border transition-all",
              tab === t
                ? "bg-surface border-line border-b-signal text-ink"
                : "bg-transparent border-transparent border-b-transparent text-muted hover:text-ink",
            )}
            style={tab === t ? { borderBottomWidth: 2, borderBottomColor: "#d03a18" } : { borderBottomWidth: 2 }}
          >
            {t === "gerar" ? <Music2 size={13} /> : <Radio size={13} />}
            {t === "gerar" ? "Gerar Patch" : "MIDI Console"}
          </motion.button>
        ))}
      </motion.nav>

      {/* ── Tab content ────────────────────────────────────── */}
      <AnimatePresence mode="wait">

        {/* MIDI tab */}
        {tab === "midi" && (
          <motion.div key="midi" {...fadeUp} transition={{ duration: 0.22, ease: easeOut }}>
            <MidiConsole />
          </motion.div>
        )}

        {/* Gerar tab */}
        {tab === "gerar" && (
          <motion.div key="gerar" {...fadeUp} transition={{ duration: 0.22, ease: easeOut }}>

            {/* ─ Form card ─────────────────────────────────── */}
            <section className="bg-surface border border-line rounded-lg overflow-hidden shadow-card">

              {/* Tone description section */}
              <div className="px-[22px] py-5">
                <header className="flex items-center gap-[7px] mb-3">
                  <Music2 size={13} className="text-muted flex-shrink-0" />
                  <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-muted">
                    Tom desejado
                  </span>
                </header>

                <textarea
                  id="d"
                  rows={3}
                  className={cn(
                    "w-full bg-surface-hi border border-line rounded-md text-ink",
                    "px-[15px] py-3 text-sm font-ui resize-y min-h-[82px]",
                    "placeholder:text-dim transition-all",
                    "focus:outline-none focus:border-signal focus:ring-2 focus:ring-signal/20",
                  )}
                  value={brief.description}
                  placeholder="Ex.: lead encorpado com delay ritmado, tipo The Edge, mas com mais grave…"
                  onChange={(e) => setBrief({ ...brief, description: e.target.value })}
                />

                <motion.div
                  className="flex flex-wrap gap-1.5 mt-2.5"
                  variants={chipList}
                  initial="initial"
                  animate="animate"
                >
                  {IDEAS.map((idea) => (
                    <motion.button
                      key={idea}
                      variants={chipItem}
                      whileHover={{ scale: 1.025, borderColor: "#252d44" }}
                      whileTap={{ scale: 0.965 }}
                      onClick={() => setBrief({ ...brief, description: idea })}
                      className="inline-flex items-center gap-1 px-3 py-[5px] text-[11.5px] font-semibold text-muted bg-surface-hi border border-line rounded-full hover:text-ink transition-colors"
                    >
                      <ChevronRight size={11} className="text-dim" />
                      {idea}
                    </motion.button>
                  ))}
                </motion.div>
              </div>

              {/* Divider */}
              <div className="h-px bg-line" />

              {/* Config section */}
              <div className="px-[22px] py-5">
                <header className="flex items-center gap-[7px] mb-4">
                  <Settings2 size={13} className="text-muted flex-shrink-0" />
                  <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-muted">
                    Configuração
                  </span>
                </header>

                <div className="flex flex-wrap gap-5">
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

              {/* Footer — generate button */}
              <div className="px-[22px] pb-5 pt-[18px] border-t border-line bg-surface-hi">
                <motion.button
                  onClick={run}
                  disabled={busy}
                  whileHover={!busy ? { scale: 1.006 } : {}}
                  whileTap={!busy ? { scale: 0.987, y: 2 } : {}}
                  transition={{ type: "spring", stiffness: 380, damping: 28 }}
                  className={cn(
                    "flex items-center justify-center gap-2 w-full py-[14px]",
                    "bg-signal text-white text-[12.5px] font-bold tracking-[0.16em] uppercase rounded-md",
                    "shadow-stomp hover:bg-signal-hi",
                    "disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none",
                    "transition-colors",
                  )}
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
                  {busy ? "Montando a cadeia…" : "Gerar Patch"}
                </motion.button>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      role="alert"
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: "auto", marginTop: 12 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-sm text-[13px] text-[#fca5a5] border border-[#ef444440]"
                           style={{ background: "rgba(239,68,68,0.08)" }}>
                        <AlertTriangle size={14} className="text-[#ef4444] flex-shrink-0 mt-0.5" />
                        {error}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>

            {/* ─ Result card ───────────────────────────────── */}
            <AnimatePresence>
              {patch && (
                <motion.section
                  key="result"
                  initial={{ opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{ duration: 0.35, ease: easeOut }}
                  className="mt-3.5 bg-surface border border-line rounded-lg overflow-hidden shadow-card"
                >
                  {/* Result header */}
                  <div className="flex justify-between items-center px-[22px] pt-[18px] pb-0">
                    <div>
                      <p className="m-0 mb-[5px] text-[9px] font-bold tracking-[0.18em] uppercase text-dim">
                        Patch gerado
                      </p>
                      <h2 className="m-0 text-[25px] font-black tracking-tight text-ink">
                        {patch.name}
                      </h2>
                    </div>
                    <Badge>{patch.slots.length}/9</Badge>
                  </div>

                  {/* Pedal rack */}
                  <motion.div
                    className="flex gap-3 overflow-x-auto px-[22px] py-[18px] border-t border-b border-line mt-4 rack-scroll"
                    variants={rackList}
                    initial="initial"
                    animate="animate"
                  >
                    {patch.slots.map((slot, i) => (
                      <motion.div key={i} variants={rackItem} className="flex-none">
                        <PedalUnit
                          slot={slot}
                          index={i}
                          onChange={(p, v) => tweak(i, p, v)}
                        />
                      </motion.div>
                    ))}
                  </motion.div>

                  {/* Notes & warnings */}
                  <div className="px-[22px]">
                    {patch.notes && (
                      <p className="mx-0 px-[15px] py-3 bg-surface-hi border-l-2 border-signal rounded-r-sm text-[13px] text-muted leading-[1.65]">
                        {patch.notes}
                      </p>
                    )}
                    {patch.warnings.length > 0 && (
                      <div className="flex items-start gap-2 px-3.5 py-2.5 mt-2.5 rounded-sm text-[#fde68a] text-[12px] border border-[#f59e0b30]"
                           style={{ background: "rgba(245,158,11,0.08)" }}>
                        <AlertTriangle size={13} className="text-warn flex-shrink-0 mt-0.5" />
                        {patch.warnings.join(" · ")}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between flex-wrap gap-3 px-[22px] py-4 mt-2">
                    <motion.button
                      onClick={() => downloadPatch(patch)}
                      whileHover={{ scale: 1.025, borderColor: "#d03a18" }}
                      whileTap={{ scale: 0.975 }}
                      transition={{ type: "spring", stiffness: 400, damping: 28 }}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-surface-hi border border-line-hi rounded-md text-ink text-[11.5px] font-bold tracking-[0.1em] uppercase transition-colors"
                    >
                      <Download size={14} />
                      Baixar .g5p
                    </motion.button>

                    <p className="flex items-center gap-1.5 m-0 text-dim text-[12px]">
                      <Info size={12} className="flex-shrink-0" />
                      Role o mouse sobre um knob para ajustar antes de exportar.
                    </p>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Choice group ─────────────────────────────────────────── */
function Choice({
  label, value, options, onPick,
}: { label: string; value: string; options: string[]; onPick: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-dim">{label}</span>
      <div className="flex gap-[3px] flex-wrap">
        {options.map((o) => (
          <motion.button
            key={o}
            onClick={() => onPick(o)}
            whileTap={{ scale: 0.94 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className={cn(
              "px-[13px] py-[7px] text-[12px] font-semibold rounded-sm border transition-all",
              o === value
                ? "bg-signal/[0.14] border-signal text-white"
                : "bg-surface-hi border-line text-muted hover:text-ink hover:border-line-hi",
            )}
          >
            {o}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
