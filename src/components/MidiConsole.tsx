import { useCallback, useEffect, useRef, useState } from "react";
import {
  IDENTITY_REQUEST, fromHex, guessZoomPort, listPorts, openMidi,
  parseIdentity, toHex, zoomModelOf, type MidiMessage,
} from "../lib/midi";

/**
 * Console para descobrir o SysEx da G5.
 *
 * Fluxo: conectar -> Identity Request (revela o byte de modelo) ->
 * mexer nos knobs da pedaleira e ver o que ela cospe.
 */
export function MidiConsole() {
  const [ports, setPorts] = useState<{ inputs: MIDIInput[]; outputs: MIDIOutput[] } | null>(null);
  const [inputId, setInputId] = useState("");
  const [outputId, setOutputId] = useState("");
  const [log, setLog] = useState<MidiMessage[]>([]);
  const [model, setModel] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState("f0 7e 7f 06 01 f7");
  const accessRef = useRef<MIDIAccess | null>(null);

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

  // escuta a porta escolhida
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
          <p className="help">
            Conecte a G5 pelo USB e feche o Edit&Share — no Windows só um programa
            por vez consegue abrir a porta MIDI.
          </p>
          <button className="go" onClick={connect}>Conectar à pedaleira</button>
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
              Identity Request
            </button>
            <button className="go small ghost" onClick={() => setLog([])}>Limpar log</button>
          </div>

          {model !== null && (
            <p className="found">
              Byte de modelo da G5: <code>0x{model.toString(16).padStart(2, "0")}</code> — é o
              quarto byte de todo SysEx da Zoom, <code>F0 52 00 {model.toString(16)} …</code>
            </p>
          )}

          <label className="lbl" htmlFor="raw">Enviar bytes (hex)</label>
          <input id="raw" value={raw} onChange={(e) => setRaw(e.target.value)} />
          <div className="actions">
            <button
              className="go small"
              onClick={() => {
                try { send(fromHex(raw)); } catch (e) { setError((e as Error).message); }
              }}
            >
              Enviar
            </button>
          </div>

          {error && <p className="err">{error}</p>}

          <ol className="midi-log">
            {log.map((m, i) => (
              <li key={`${m.at}-${i}`} className={m.direction}>
                <span className="dir">{m.direction === "in" ? "◀" : "▶"}</span>
                <code>{toHex(m.bytes)}</code>
              </li>
            ))}
          </ol>
          {log.length === 0 && (
            <p className="help">
              Nada ainda. Mande um Identity Request, ou gire um knob na pedaleira e veja
              se ela transmite alguma coisa sozinha.
            </p>
          )}
        </>
      )}
    </section>
  );
}
