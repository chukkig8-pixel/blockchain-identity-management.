import { useState } from "react";
import { api } from "../api.js";
import { PENDING_KEY, SHARED_KEY } from "../wallet.js";

export default function Employer() {
  const [nonce, setNonce] = useState(localStorage.getItem(PENDING_KEY) || "");
  const [text, setText] = useState(localStorage.getItem(SHARED_KEY) || "");
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function newRequest() {
    const { nonce } = await api.challenge();
    localStorage.setItem(PENDING_KEY, nonce);
    setNonce(nonce); setResult(null);
  }

  function tamper() {
    try {
      const p = JSON.parse(text);
      const a = p.disclosed[0];
      a.value = a.value.includes("BCA Cyber Security") ? "BCA + PhD" : `${a.value} + PhD`;
      setText(JSON.stringify(p, null, 2)); setResult(null);
    } catch { setErr("Load a valid proof first."); }
  }

  async function verify() {
    setErr(""); setResult(null); setBusy(true);
    try { setResult(await api.verify(JSON.parse(text))); }
    catch (e) { setErr(e instanceof SyntaxError ? "The proof is not valid JSON." : e.message); }
    setBusy(false);
  }

  const failed = result && !result.valid;
  return (
    <div className="grid two">
      <section className="card">
        <h2>Verify a credential</h2>
        <p className="muted">Ask for a fresh request code, give it to the candidate, then check the proof they send back.</p>
        <div className="row">
          <button className="primary" onClick={newRequest}>New verification request</button>
        </div>
        {nonce && <><label>Request code</label><div className="mono boxed">{nonce}</div></>}

        <label>Proof received from the candidate</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={11} className="mono" placeholder="Paste the proof here, or send it from the Student wallet tab." />
        <div className="row">
          <button className="primary" onClick={verify} disabled={busy || !text.trim()}>{busy ? "Checking..." : "Verify proof"}</button>
          <button className="ghost" onClick={() => setText(localStorage.getItem(SHARED_KEY) || "")}>Load shared proof</button>
          <button className="ghost danger" onClick={tamper} disabled={!text.trim()}>Simulate tampering</button>
        </div>
        {err && <p className="note err">{err}</p>}
      </section>

      <section className="card">
        <h2>Result</h2>
        {!result && <p className="muted">The verdict and each check will appear here.</p>}
        {result && (
          <>
            <div className={`seal ${result.valid ? "good" : "bad"}`}>
              <span className="mark">{result.valid ? "✓" : "✕"}</span>
              <div>
                <strong>{result.valid ? "VERIFIED" : "REJECTED"}</strong>
                <div className="small">
                  {result.valid
                    ? `Issued by ${result.issuer_name}`
                    : result.tampered ? "Hash mismatch, tampering detected" : "One or more checks failed"}
                </div>
              </div>
            </div>
            {result.valid && result.attributes.map((a) => (
              <div className="fact" key={a.key}><span>{a.key}</span><b>{a.value}</b></div>
            ))}
            <ul className="plain checks">
              {result.checks.map((c) => (
                <li key={c.id} className={c.passed ? "pass" : "fail"}>
                  <span className="dot">{c.passed ? "✓" : "✕"}</span>
                  <div><strong>{c.label}</strong><div className="small muted">{c.detail}</div></div>
                </li>
              ))}
            </ul>
            {failed && <p className="small muted">Request a new code before trying again. Each code works once.</p>}
          </>
        )}
      </section>
    </div>
  );
}
