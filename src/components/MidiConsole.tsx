import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Cable, Trash2, Send, Activity, ChevronRight, Bookmark, GitCompare, AlertCircle, Copy } from "lucide-react";
import {
  IDENTITY_REQUEST, currentPatchRequest, paramEditEnable, isPatchDump,
  fromHex, guessZoomPort, listPorts, openMidi,
  parseIdentity, toHex, zoomModelOf, parseBinaryDump,
  analyzeModuleDiff, type MidiMessage,
} from "../lib/midi";
import { BY_ID, CATEGORIES } from "../lib/catalog";

export function MidiConsole() {
  const [ports, setPorts] = useState<{ inputs: MIDIInput[]; outputs: MIDIOutput[] } | null>(null);
  const [inputId, setInputId] = useState("");
  const [outputId, setOutputId] = useState("");
  const [log, setLog] = useState<MidiMessage[]>([]);
  const [model, setModel] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [patchDump, setPatchDump] = useState<number[] | null>(null);
  const [patchDumpRaw, setPatchDumpRaw] = useState<number[] | null>(null);
  const [currentPatch, setCurrentPatch] = useState<{ bank: number; slot: string } | null>(null);
  const [raw, setRaw] = useState("f0 7e 7f 06 01 f7");

  // Diff workbench
  const [dumpA, setDumpA] = useState<{ payload: number[]; label: string } | null>(null);
  const [dumpB, setDumpB] = useState<{ payload: number[]; label: string } | null>(null);

  const accessRef      = useRef<MIDIAccess | null>(null);
  const bankRef        = useRef<number>(1);
  const modelRef       = useRef<number | null>(null);
  const outputIdRef    = useRef<string>("");
  const pcGenRef       = useRef<number>(0);
  const autoRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { modelRef.current = model; }, [model]);
  useEffect(() => { outputIdRef.current = outputId; }, [outputId]);

  const push = useCallback((direction: "in" | "out", bytes: number[]) => {
    setLog((prev) => [{ at: Date.now(), direction, bytes }, ...prev].slice(0, 300));
  }, []);

  async function connect() {
    setError(null);
    try {
      const access = await openMidi();
      accessRef.current = access;
      const p = listPorts(access);
      setPorts(p);
      const outId = guessZoomPort(p.outputs)?.id ?? p.outputs[0]?.id ?? "";
      setInputId(guessZoomPort(p.inputs)?.id ?? p.inputs[0]?.id ?? "");
      setOutputId(outId);

      // Envia Identity Request automaticamente para detectar o modelo
      // sem precisar que o usuário clique manualmente.
      setTimeout(() => {
        const out = access.outputs.get(outId);
        if (out) out.send(IDENTITY_REQUEST);
      }, 300);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    const access = accessRef.current;
    if (!access || !inputId) return;
    const input = access.inputs.get(inputId);
    if (!input) return;

    const onMessage = (e: MIDIMessageEvent) => {
      const bytes = Array.from(e.data ?? []);
      push("in", bytes);
      const id = parseIdentity(bytes);
      if (id) {
        setModel((prev) => {
          if (prev === null) {
            // Primeira detecção: lê o patch atual automaticamente
            setTimeout(() => {
              const out = accessRef.current?.outputs.get(outputIdRef.current);
              if (out) out.send(currentPatchRequest(id.model));
            }, 200);
          }
          return id.model;
        });
      } else {
        const m = zoomModelOf(bytes);
        if (m !== null) setModel((prev) => {
          if (prev === null) {
            setTimeout(() => {
              const out = accessRef.current?.outputs.get(outputIdRef.current);
              if (out) out.send(currentPatchRequest(m));
            }, 200);
          }
          return prev ?? m;
        });
      }
      if ((bytes[0] & 0xf0) === 0xb0 && bytes[1] === 0x20) {
        bankRef.current = (bytes[2] ?? 0) + 1;
      }
      if ((bytes[0] & 0xf0) === 0xc0) {
        const slot = ["A", "B", "C"][bytes[1] ?? 0] ?? "?";
        setCurrentPatch({ bank: bankRef.current, slot });
        const gen = ++pcGenRef.current;
        setTimeout(() => {
          if (pcGenRef.current !== gen) return;
          const out = accessRef.current?.outputs.get(outputIdRef.current);
          if (out && modelRef.current !== null) out.send(currentPatchRequest(modelRef.current));
        }, 1000);
      }
      const dump = isPatchDump(bytes);
      if (dump) {
        setPatchDump(dump);
        setPatchDumpRaw([...bytes]);
      } else if (bytes[0] === 0xf0 && bytes[1] === 0x52 && !id) {
        // Qualquer outro SysEx da Zoom (parâmetro alterado, bypass toggled, etc.)
        // → re-solicita o dump com debounce para não floods.
        if (autoRefreshRef.current) clearTimeout(autoRefreshRef.current);
        autoRefreshRef.current = setTimeout(() => {
          const m = modelRef.current;
          const out = accessRef.current?.outputs.get(outputIdRef.current);
          if (out && m !== null) out.send(currentPatchRequest(m));
        }, 400);
      }
    };
    input.addEventListener("midimessage", onMessage);
    return () => input.removeEventListener("midimessage", onMessage);
  }, [inputId, push]);

  function send(bytes: number[]) {
    const out = accessRef.current?.outputs.get(outputId);
    if (!out) { setError("Escolha uma porta de saída."); return; }
    try {
      out.send(bytes);
      push("out", bytes);
      setError(null);
    } catch (e) {
      setError(`Falha ao enviar: ${(e as Error).message}`);
    }
  }

  function patchLabel() {
    if (!currentPatch) return "patch atual";
    return `${String(currentPatch.bank).padStart(2, "0")}${currentPatch.slot}`;
  }

  function saveDump(slot: "A" | "B") {
    if (!patchDump) return;
    const entry = { payload: [...patchDump], label: patchLabel() };
    if (slot === "A") setDumpA(entry);
    else setDumpB(entry);
  }

  return (
    <motion.section
      className="panel"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <span className="lbl">Console MIDI</span>

      {!ports ? (
        <>
          <p className="help" style={{ marginTop: 10 }}>
            Conecte a G5 pelo USB e feche o Edit&Share — no Windows só um programa
            por vez consegue abrir a porta MIDI.
          </p>
          <motion.button
            className="go"
            onClick={connect}
            whileHover={{ scale: 1.005 }}
            whileTap={{ scale: 0.985 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
          >
            <Cable size={14} />
            Conectar à pedaleira
          </motion.button>
          {error && <p className="err">{error}</p>}
        </>
      ) : (
        <>
          <div className="fields">
            <div className="field">
              <span className="lbl">Entrada</span>
              <select value={inputId} onChange={(e) => setInputId(e.target.value)}>
                {ports.inputs.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <span className="lbl">Saída</span>
              <select value={outputId} onChange={(e) => setOutputId(e.target.value)}>
                {ports.outputs.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="actions">
            <motion.button
              className="go small"
              onClick={() => send(IDENTITY_REQUEST)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <ChevronRight size={12} />
              Identity Request
            </motion.button>
            {model !== null && (
              <>
                <motion.button
                  className="go small"
                  onClick={() => send(currentPatchRequest(model))}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  Ler patch atual
                </motion.button>
                <motion.button
                  className="go small"
                  onClick={() => send(paramEditEnable(model))}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  Habilitar edição
                </motion.button>
              </>
            )}
            <motion.button
              className="go small ghost"
              onClick={() => setLog([])}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <Trash2 size={12} />
              Limpar log
            </motion.button>
          </div>

          <AnimatePresence>
            {model !== null && (
              <motion.p
                className="found"
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: "auto", marginTop: 14 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.2 }}
              >
                G5 detectada — modelo{" "}
                <code>0x{model.toString(16).padStart(2, "0")}</code>
              </motion.p>
            )}
          </AnimatePresence>

          {/* ── Dump ao vivo + botões de captura ─── */}
          <AnimatePresence>
            {patchDump !== null && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.2 }}
              >
                <div className="actions" style={{ marginTop: 14 }}>
                  <motion.button
                    className="go small"
                    onClick={() => saveDump("A")}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    style={{
                      background: dumpA ? "rgba(34,197,94,0.13)" : undefined,
                      borderColor: dumpA ? "rgba(34,197,94,0.35)" : undefined,
                    }}
                  >
                    <Bookmark size={12} />
                    Fixar como Dump A
                    {dumpA && (
                      <span style={{ opacity: 0.6, marginLeft: 2 }}>({dumpA.label})</span>
                    )}
                  </motion.button>
                  <motion.button
                    className="go small"
                    onClick={() => saveDump("B")}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    style={{
                      background: dumpB ? "rgba(59,130,246,0.13)" : undefined,
                      borderColor: dumpB ? "rgba(59,130,246,0.35)" : undefined,
                    }}
                  >
                    <Bookmark size={12} />
                    Fixar como Dump B
                    {dumpB && (
                      <span style={{ opacity: 0.6, marginLeft: 2 }}>({dumpB.label})</span>
                    )}
                  </motion.button>
                  {(dumpA || dumpB) && (
                    <motion.button
                      className="go small ghost"
                      onClick={() => { setDumpA(null); setDumpB(null); }}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      Limpar A/B
                    </motion.button>
                  )}
                </div>

                <PatchDumpView payload={patchDump} rawSysEx={patchDumpRaw} currentPatch={currentPatch} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Instrução quando só um dump fixado ── */}
          <AnimatePresence>
            {((dumpA && !dumpB) || (!dumpA && dumpB)) && (
              <motion.p
                className="help"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}
              >
                <AlertCircle size={12} style={{ flexShrink: 0 }} />
                {dumpA
                  ? "Dump A fixado. Altere um parâmetro na G5, releia o patch e fixe como Dump B."
                  : "Dump B fixado. Leia o patch de referência e fixe como Dump A."}
              </motion.p>
            )}
          </AnimatePresence>

          {/* ── Diff Workbench ───────────────────── */}
          <AnimatePresence>
            {dumpA && dumpB && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.25 }}
              >
                <DiffWorkbench dumpA={dumpA} dumpB={dumpB} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Envio manual ─────────────────────── */}
          <label className="lbl" htmlFor="raw" style={{ marginTop: 16, display: "block" }}>
            Enviar bytes (hex)
          </label>
          <input id="raw" value={raw} onChange={(e) => setRaw(e.target.value)} />
          <div className="actions">
            <motion.button
              className="go small"
              onClick={() => {
                try { send(fromHex(raw)); } catch (e) { setError((e as Error).message); }
              }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <Send size={12} />
              Enviar
            </motion.button>
          </div>

          {error && <p className="err">{error}</p>}

          {/* ── Log ─────────────────────────────── */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 16 }}>
            <Activity size={12} className="text-dim" />
            <span className="lbl" style={{ margin: 0 }}>Log de mensagens</span>
          </div>

          <ol className="midi-log">
            <AnimatePresence initial={false}>
              {log.map((m, i) => (
                <motion.li
                  key={`${m.at}-${i}`}
                  className={m.direction}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <span className="dir">{m.direction === "in" ? "◀" : "▶"}</span>
                  <code>{toHex(m.bytes)}</code>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>

          {log.length === 0 && (
            <p className="help" style={{ marginTop: 8 }}>
              Nada ainda. Mande um Identity Request, ou gire um knob na pedaleira.
            </p>
          )}
        </>
      )}
    </motion.section>
  );
}

// ─── Diff Workbench ────────────────────────────────────────────────────────

type DiffRow = ReturnType<typeof analyzeModuleDiff>[number];

const BYTE_HYPOTHESES: Record<number, string> = {
  1: "byte[1] — Effect ID (hi, ex: ZNR=0x40)",
  2: "byte[2] — Effect ID (lo, ex: NoiseGate=0x19)",
  12: "byte[12] — THRSH (confirmado: init=9 em 01B, 13 em DZ Bend)",
  13: "byte[13] — parâmetro (era confundido com Effect ID; é Level ou similar)",
};

function DiffWorkbench({
  dumpA,
  dumpB,
}: {
  dumpA: { payload: number[]; label: string };
  dumpB: { payload: number[]; label: string };
}) {
  const diffs = analyzeModuleDiff(dumpA.payload, dumpB.payload);

  return (
    <details className="dump-box" open style={{ marginTop: 14, borderColor: "rgba(59,130,246,0.27)" }}>
      <summary style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <GitCompare size={13} style={{ color: "#3b82f6", flexShrink: 0 }} />
        <span>
          Diff{" "}
          <strong style={{ color: "#22c55e" }}>A</strong> ({dumpA.label}){" → "}
          <strong style={{ color: "#3b82f6" }}>B</strong> ({dumpB.label})
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#3d4d68", fontWeight: 600 }}>
          {diffs.length} diferença{diffs.length !== 1 ? "s" : ""}
        </span>
      </summary>

      {diffs.length === 0 ? (
        <p className="help" style={{ marginTop: 10 }}>
          Dumps idênticos — nenhuma diferença encontrada.
        </p>
      ) : (
        <>
          <p className="help" style={{ marginTop: 8, marginBottom: 6 }}>
            <code>modOff</code> = índice do byte dentro do bloco de 16 bytes do módulo.
            Linhas em destaque = bytes em posições chave (12 e 13).
          </p>
          <table className="mod-table">
            <thead>
              <tr>
                <th>offset</th>
                <th>módulo</th>
                <th>modOff</th>
                <th style={{ color: "#22c55e" }}>A (hex)</th>
                <th style={{ color: "#3b82f6" }}>B (hex)</th>
                <th>Δ dec</th>
                <th>hipótese</th>
              </tr>
            </thead>
            <tbody>
              {diffs.map((d, i) => (
                <DiffRowView key={i} d={d} />
              ))}
            </tbody>
          </table>
        </>
      )}
    </details>
  );
}

function DiffRowView({ d }: { d: DiffRow }) {
  const isInName  = d.offset >= 148;
  const isExtra   = d.offset === 146 || d.offset === 147;
  const modLabel  = d.moduleIndex != null
    ? `mod ${d.moduleIndex}`
    : (isInName ? "nome" : isExtra ? "extra" : "header");
  const hyp       = d.moduleOffset != null ? (BYTE_HYPOTHESES[d.moduleOffset] ?? "") : "";
  const delta     = d.a != null && d.b != null ? d.b - d.a : null;
  const deltaStr  = delta == null ? "—" : delta > 0 ? `+${delta}` : String(delta);
  const isKeyByte = d.moduleOffset === 1 || d.moduleOffset === 2 || d.moduleOffset === 12;

  return (
    <tr style={{ background: isKeyByte ? "rgba(208,58,24,0.07)" : undefined }}>
      <td>
        <code>{d.offsetHex}</code>
        <span style={{ color: "#3d4d68", fontSize: 10, marginLeft: 4 }}>({d.offset})</span>
      </td>
      <td style={{ fontWeight: isKeyByte ? 700 : undefined }}>{modLabel}</td>
      <td>
        {d.moduleOffsetHex ?? "—"}
        {d.moduleOffset != null && (
          <span style={{ color: "#3d4d68", fontSize: 10, marginLeft: 4 }}>[{d.moduleOffset}]</span>
        )}
      </td>
      <td style={{ color: "#22c55e", fontFamily: "monospace" }}>{d.aHex ?? "—"}</td>
      <td style={{ color: "#3b82f6", fontFamily: "monospace" }}>{d.bHex ?? "—"}</td>
      <td style={{
        color: delta == null ? undefined : delta > 0 ? "#3b82f6" : "#f59e0b",
        fontFamily: "monospace",
      }}>
        {deltaStr}
      </td>
      <td style={{ color: "#3d4d68", fontSize: 11 }}>{hyp}</td>
    </tr>
  );
}

// ─── PatchDumpView ─────────────────────────────────────────────────────────

function PatchDumpView({ payload, rawSysEx, currentPatch }: {
  payload: number[];
  rawSysEx: number[] | null;
  currentPatch: { bank: number; slot: string } | null;
}) {
  const [copied, setCopied] = useState(false);
  function copyHex() {
    const hex = toHex(rawSysEx ?? payload);
    navigator.clipboard.writeText(hex).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  const parsed = parseBinaryDump(payload, BY_ID as Map<number, { params: Array<{ prm: number }> }>);

  const label = currentPatch
    ? `${currentPatch.bank.toString().padStart(2, "0")}${currentPatch.slot}`
    : "??";
  const [p0, p1] = payload;
  const h = [p0, p1]
    .map((b) => b?.toString(16).padStart(2, "0") ?? "--")
    .join(" ");

  return (
    <details className="dump-box" open>
      <summary style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>
          <strong>{label}</strong>
          {" — "}
          <strong>{parsed.name || "(sem nome)"}</strong>
          {!currentPatch && (
            <span style={{ color: "#f59e0b", fontSize: 11, marginLeft: 6 }}>
              (troque de patch na G5 para ver o número correto)
            </span>
          )}
          <code style={{ color: "#3d4d68", fontSize: 10, fontFamily: "monospace", marginLeft: 8 }}>
            [{h}]
          </code>
        </span>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); copyHex(); }}
          title="Copiar SysEx completo (para análise)"
          style={{
            marginLeft: "auto",
            display: "flex", alignItems: "center", gap: 4,
            background: "transparent", border: "1px solid #1b2034",
            borderRadius: 4, padding: "2px 8px",
            color: copied ? "#22c55e" : "#3d4d68",
            fontSize: 10, cursor: "pointer", flexShrink: 0,
          }}
        >
          <Copy size={10} />
          {copied ? "copiado!" : "copiar hex"}
        </button>
      </summary>

      <ol className="slot-list">
        {parsed.slots.map((s) => {
          const fx = s.recognized ? BY_ID.get(s.catalogId) : null;
          const cat = fx ? CATEGORIES[fx.cat] : null;
          const dotColor = cat ? (s.on ? cat.color : "#252d44") : "#252d44";

          return (
            <li
              key={s.slotIdx}
              className="slot-row"
              style={{ opacity: s.id === 0 ? 0.35 : 1 }}
            >
              {/* indicador on/off — byte[14], hipótese não confirmada */}
              <span
                className="slot-on"
                style={{ background: dotColor }}
                title={`byte[14]=${s.rawMod[14] ?? "?"} → ${s.on ? "ON" : "bypass"} (hipótese, não confirmado)`}
              />

              {/* número do slot */}
              <span style={{ fontSize: 10, color: "#3d4d68", minWidth: 18, fontFamily: "monospace" }}>
                {s.slotIdx}
              </span>

              {fx && cat ? (
                <>
                  <span className="slot-cat" style={{ color: cat.color }}>{cat.label}</span>
                  <strong className="slot-name" style={{ color: s.on ? "#dde4f0" : "#7d90b4" }}>
                    {fx.name}
                  </strong>
                  <span className="slot-params">
                    {fx.params.map((p, k) => (
                      <span key={k} className="slot-param">
                        {p.name}={s.values[k] ?? "?"}
                      </span>
                    ))}
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 11, color: "#3d4d68", fontFamily: "monospace" }}>
                  {s.id === 0
                    ? "(vazio)"
                    : `sysex=0x${s.id.toString(16).padStart(2,"0")}=>${s.catalogId} — não mapeado`}
                </span>
              )}

              {/* byte12 sempre visível para investigação */}
              <span style={{ marginLeft: "auto", fontSize: 10, color: "#3d4d68", fontFamily: "monospace" }}>
                b12=<code style={{ color: "#506080" }}>{s.byte12?.toString(16).padStart(2, "0")}</code>
              </span>
            </li>
          );
        })}
      </ol>

      <details className="dump-raw">
        <summary>Bytes brutos por módulo</summary>
        <p className="help" style={{ margin: "6px 0" }}>
          Header: <code style={{ fontFamily: "monospace" }}>{toHex(payload.slice(0, 2))}</code>
          {" · "}
          Nome[146-155]: <code style={{ fontFamily: "monospace" }}>{toHex(payload.slice(146, 156))}</code>
          {" · "}
          Trail[156-157]: <code style={{ fontFamily: "monospace" }}>{toHex(payload.slice(156, 158))}</code>
        </p>
        <table className="mod-table">
          <thead>
            <tr>
              <th>Mod</th>
              <th>b[12]</th>
              <th>b[13]=ID</th>
              <th>b[14]=on?</th>
              <th>Efeito</th>
              <th>Bytes (hex)</th>
            </tr>
          </thead>
          <tbody>
            {parsed.slots.map((s) => {
              const fx = BY_ID.get(s.id);
              return (
                <tr key={s.slotIdx}>
                  <td>{s.slotIdx}</td>
                  <td>
                    <code>{s.byte12.toString(16).padStart(2, "0")}</code>
                    <span style={{ color: "#3d4d68", fontSize: 10, marginLeft: 4 }}>({s.byte12})</span>
                  </td>
                  <td>
                    <code>{s.id.toString(16).padStart(2, "0")}</code>
                    {s.catalogId !== s.id && (
                      <span style={{ color: "#22c55e", fontSize: 10, marginLeft: 4 }}>→{s.catalogId}</span>
                    )}
                  </td>
                  <td style={{ color: s.on ? "#22c55e" : "#3d4d68" }}>
                    {s.rawMod[14]?.toString(16).padStart(2, "0") ?? "--"}
                    <span style={{ fontSize: 10, marginLeft: 4 }}>{s.on ? "ON?" : "bypass?"}</span>
                  </td>
                  <td>{fx ? fx.name : s.id === 0 ? "(vazio)" : `sysex=${s.id}(?)`}</td>
                  <td><code>{toHex(s.rawMod)}</code></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </details>
  );
}
