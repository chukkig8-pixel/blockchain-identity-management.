import { useEffect, useState } from "react";
import { api } from "../api.js";

const short = (h) => (h ? `${h.slice(0, 10)}...${h.slice(-6)}` : "-");

export default function Ledger({ goto, onFlowChange }) {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState("");

  const load = () => api.ledger().then(setData).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  async function run(fn, ok) {
    setMsg("");
    try { await fn(); setMsg(ok); onFlowChange?.(); } catch (e) { setMsg(e.message); }
    load();
  }
  if (!data) return <section className="card"><p className="muted">{msg || "Loading ledger..."}</p></section>;

  return (
    <>
      <div className="role-banner">
        <div>
          <span className="role-pill">Tab 4 · Ledger (Blockchain Notebook)</span>
          <strong>The Tamper-Proof Notebook</strong>
          <p className="small muted">
            Lists every credential fingerprint and revocation the university has recorded, in order. No names, grades, or student photos ever go in the notebook—only the fingerprint. Click <b>Simulate ledger tampering</b> to see how editing a record breaks the chain.
          </p>
        </div>
        {goto && (
          <div className="role-next">
            <button type="button" className="ghost small-btn" onClick={() => goto("employer")}>
              ← 3. Employer
            </button>
            <button type="button" className="ghost small-btn" onClick={() => goto("university")}>
              1. University →
            </button>
          </div>
        )}
      </div>

      <section className="card">
        <div className="split">
          <div>
            <h2>{data.label}</h2>
            <p className="muted">Height {data.height}. Credential roots are anchored here. Names, grades, and photos never are.</p>
          </div>
          <div className="row">
            <button className="ghost" onClick={load}>Refresh</button>
            {data.kind === "local" && (
              <>
                <button className="ghost danger" onClick={() => run(api.tamperLedger, "A stored block was edited behind the ledger's back.")}>Simulate ledger tampering</button>
                <button className="ghost" onClick={() => confirm("Delete all demo data?") && run(api.reset, "Demo data reset.")}>Reset demo data</button>
              </>
            )}
          </div>
        </div>

        <div className={`seal ${data.valid ? "good" : "bad"}`}>
          <span className="mark">{data.valid ? "✓" : "✕"}</span>
          <div>
            <strong>{data.valid ? "Chain intact" : `Chain broken at block ${data.broken_at}`}</strong>
            <div className="small">{data.valid ? "Every block hash and link re-computed correctly." : "A block's content no longer matches its hash. Everything after it is untrustworthy."}</div>
          </div>
        </div>
        {msg && <p className="note">{msg}</p>}

        <div className="blocks">
          {data.blocks.map((b) => (
            <article key={b.index + b.hash} className={`block ${data.broken_at === b.index ? "broken" : ""}`}>
              <header><strong>Block {b.index}</strong><span className={`tag ${b.type === "REVOKE" ? "bad" : ""}`}>{b.type}</span></header>
              <dl>
                <dt>Time</dt><dd>{new Date(b.timestamp * 1000).toLocaleString()}</dd>
                {b.payload.root && (<><dt>Credential root</dt><dd className="mono">{short(b.payload.root)}</dd></>)}
                {b.payload.issuer && (<><dt>Issuer</dt><dd className="mono">{short(b.payload.issuer)}</dd></>)}
                <dt>Hash</dt><dd className="mono">{short(b.hash)}</dd>
                <dt>Previous</dt><dd className="mono">{short(b.prev_hash)}</dd>
              </dl>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
