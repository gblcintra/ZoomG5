import { useCallback, useEffect, useRef, useState } from "react";
import { Cable, Trash2, Send, Activity, ChevronRight } from "lucide-react";
import {
  IDENTITY_REQUEST, currentPatchRequest, bankDumpRequest, isPatchDump,
  fromHex, guessZoomPort, listPorts, openMidi,
  parseIdentity, toHex, zoomModelOf, parseBinaryDump, type MidiMessage,
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
  const [currentPatch, setCurrentPatch] = useState<{ bank: number; slot: string } | null>(null);
  const [raw, setRaw] = useState("f0 7e 7f 06 01 f7");
  const accessRef = useRef<MIDIAccess | null>(null);
  const bankRef = useRef<number>(1);
  const modelRef = useRef<number | null>(null);
  const outputIdRef = useRef<string>("");

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
      setInputId(guessZoomPort(p.inputs)?.id ?? p.inputs[0]?.id ?? "");
      setOutputId(guessZoomPort(p.outputs)?.id ?? p.outputs[0]?.id ?? "");
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
      if (id) setModel(id.model);
      else {
        const m = zoomModelOf(bytes);
        if (m !== null) setModel((prev) => prev ?? m);
      }
      if ((bytes[0] & 0xf0) === 0xb0 && bytes[1] === 0x20) {
        bankRef.current = (bytes[2] ?? 0) + 1;
      }
      if ((bytes[0] & 0xf0) === 0xc0) {
        const slot = ["A", "B", "C"][bytes[1] ?? 0] ?? "?";
        setCurrentPatch({ bank: bankRef.current, slot });
        const mdl = modelRef.current;
        const outId = outputIdRef.current;
        if (mdl !== null && outId) {
          const out = accessRef.current?.outputs.get(outId);
          if (out) out.send(currentPatchRequest(mdl));
        }
      }
      const dump = isPatchDump(bytes);
      if (dump) setPatchDump(dump);
    };
    input.addEventListener("midimessage", onMessage);
    return () => input.removeEventListener("midimessage", onMessage);
  }, [inputId, push]);

  function send(bytes: number[]) {
    const out = accessRef.current?.outputs.get(outputId);
    if (!out) {
      setError("Escolha uma porta de saída.");
      return;
    }
    try {
      out.send(bytes);
      push("out", bytes);
      setError(null);
    } catch (e) {
      setError(`Falha ao enviar: ${(e as Error).message}`);
    }
  }

  return (
    <section className="panel">
      <span className="lbl">Console MIDI</span>

      {!ports ? (
        <>
          <p className="help" style={{ marginTop: 10 }}>
            Conecte a G5 pelo USB e feche o Edit&Share — no Windows só um programa
            por vez consegue abrir a porta MIDI.
          </p>
          <button className="go" onClick={connect}>
            <Cable size={14} />
            Conectar à pedaleira
          </button>
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
            <button className="go small" onClick={() => send(IDENTITY_REQUEST)}>
              <ChevronRight size={12} />
              Identity Request
            </button>
            {model !== null && (
              <>
                <button className="go small" onClick={() => send(currentPatchRequest(model))}>
                  Ler patch atual
                </button>
                <button className="go small" onClick={() => send(bankDumpRequest(model))}>
                  Ler banco inteiro
                </button>
              </>
            )}
            <button className="go small ghost" onClick={() => setLog([])}>
              <Trash2 size={12} />
              Limpar log
            </button>
          </div>

          {model !== null && (
            <p className="found">
              G5 detectada — modelo <code>0x{model.toString(16).padStart(2, "0")}</code>
            </p>
          )}

          {patchDump !== null && (
            <PatchDumpView payload={patchDump} currentPatch={currentPatch} />
          )}

          <label className="lbl" htmlFor="raw" style={{ marginTop: 16, display: "block" }}>
            Enviar bytes (hex)
          </label>
          <input id="raw" value={raw} onChange={(e) => setRaw(e.target.value)} />
          <div className="actions">
            <button
              className="go small"
              onClick={() => {
                try { send(fromHex(raw)); } catch (e) { setError((e as Error).message); }
              }}
            >
              <Send size={12} />
              Enviar
            </button>
          </div>

          {error && <p className="err">{error}</p>}

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 16 }}>
            <Activity size={12} style={{ color: "var(--c-text-3)" }} />
            <span className="lbl" style={{ margin: 0 }}>Log de mensagens</span>
          </div>

          <ol className="midi-log">
            {log.map((m, i) => (
              <li key={`${m.at}-${i}`} className={m.direction}>
                <span className="dir">{m.direction === "in" ? "◀" : "▶"}</span>
                <code>{toHex(m.bytes)}</code>
              </li>
            ))}
          </ol>
          {log.length === 0 && (
            <p className="help" style={{ marginTop: 8 }}>
              Nada ainda. Mande um Identity Request, ou gire um knob na pedaleira e veja
              se ela transmite alguma coisa sozinha.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function PatchDumpView({ payload, currentPatch }: {
  payload: number[];
  currentPatch: { bank: number; slot: string } | null;
}) {
  const parsed = parseBinaryDump(payload, BY_ID as Map<number, { params: Array<{ prm: number }> }>);

  return (
    <details className="dump-box" open>
      <summary>
        {(() => {
          const label = currentPatch
            ? `${currentPatch.bank.toString().padStart(2, "0")}${currentPatch.slot}`
            : "??";
          const [p0, p1, p2, p3] = payload;
          const h = `${p0?.toString(16).padStart(2,"0")} ${p1?.toString(16).padStart(2,"0")} ${p2?.toString(16).padStart(2,"0")} ${p3?.toString(16).padStart(2,"0")}`;
          return (
            <>
              <strong>{label}</strong>
              {" — "}
              <strong>{parsed.name || "(sem nome)"}</strong>{" "}
              {!currentPatch && (
                <span style={{ color: "#f59e0b", fontSize: 11 }}>
                  (troque de patch na G5 para ver o número correto)
                </span>
              )}
              <code style={{ color: "var(--c-text-3)", fontSize: 10, fontFamily: "var(--font-mono)" }}>
                [{h}]
              </code>
            </>
          );
        })()}
      </summary>

      {parsed.slots.length === 0 ? (
        <p className="help" style={{ marginTop: 8 }}>
          Nenhum efeito reconhecido — veja os bytes brutos abaixo.
        </p>
      ) : (
        <ol className="slot-list">
          {parsed.slots.map((s, i) => {
            const fx = BY_ID.get(s.id);
            if (!fx) return null;
            const cat = CATEGORIES[fx.cat];
            return (
              <li key={i} className="slot-row" style={{ opacity: s.bypass ? 0.55 : 1 }}>
                <span
                  className="slot-on"
                  style={{ background: s.on ? cat.color : "var(--c-border-hi)" }}
                  title={s.on ? "ON" : "BYPASS"}
                />
                <span className="slot-cat" style={{ color: cat.color }}>
                  {cat.label}
                </span>
                <strong className="slot-name">{fx.name}</strong>
                {s.bypass && (
                  <span style={{ fontSize: 10, color: "var(--c-text-3)", marginLeft: 4 }}>
                    [bypass]
                  </span>
                )}
                <span className="slot-params">
                  {fx.params.map((p, k) => (
                    <span key={k} className="slot-param">
                      {p.name}={s.values[k] ?? "?"}
                    </span>
                  ))}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <details className="dump-raw">
        <summary>Bytes brutos por módulo</summary>
        <p className="help" style={{ margin: "6px 0" }}>
          Header (2 bytes): <code style={{ fontFamily: "var(--font-mono)" }}>{toHex(payload.slice(0, 2))}</code>
        </p>
        <table className="mod-table">
          <thead>
            <tr>
              <th>Mod</th>
              <th>Status</th>
              <th>Efeito (b[13]=ID)</th>
              <th>Bytes (hex)</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 9 }, (_, i) => {
              const base = 4 + i * 16;
              const mod = payload.slice(base, base + 16);
              const id = mod[13];
              const status = mod[12];
              const fx = BY_ID.get(id);
              const statusLabel = status === 0 ? "—" : status === 1 ? "ON" : `bypass(${status})`;
              return (
                <tr key={i}>
                  <td>{i}</td>
                  <td>{statusLabel}</td>
                  <td>{fx ? fx.name : id === 0 ? "(vazio)" : `ID ${id} (?)`}</td>
                  <td><code>{toHex(mod)}</code></td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={3}>Nome</td>
              <td><code>{toHex(payload.slice(148, 158))}</code></td>
            </tr>
          </tbody>
        </table>
      </details>
    </details>
  );
}
