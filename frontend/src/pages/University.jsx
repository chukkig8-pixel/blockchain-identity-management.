import { useEffect, useState } from "react";
import { api } from "../api.js";
import { loadWallet } from "../wallet.js";

const DEFAULTS = [
  ["Name", "Asha Rao"],
  ["Enrollment No", "BCA22017"],
  ["Degree", "BCA Cyber Security"],
  ["Graduation Year", "2026"],
  ["CGPA", "8.7"],
  ["Date of Birth", "2004-03-14"],
];

export default function University({ goto }) {
  const [holder, setHolder] = useState("");
  const [rows, setRows] = useState(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [list, setList] = useState([]);

  const refresh = () => api.credentials().then((r) => setList(r.credentials)).catch(() => {});
  useEffect(() => { refresh(); }, []);

  const setRow = (i, j, v) => setRows(rows.map((r, k) => (k === i ? r.map((c, l) => (l === j ? v : c)) : r)));

  async function issue(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const attrs = Object.fromEntries(rows.filter(([k, v]) => k.trim() && v.trim()));
      const r = await api.issue(holder.trim(), attrs);
      setMsg({ ok: true, text: `Issued ${r.credential_id} and anchored it in block ${r.anchor.block}. It is waiting in the student's wallet.` });
      refresh();
    } catch (err) { setMsg({ ok: false, text: err.message }); }
    setBusy(false);
  }

  async function revoke(id) {
    try { await api.revoke(id); refresh(); } catch (err) { setMsg({ ok: false, text: err.message }); }
  }

  return (
    <div className="grid two">
      <section className="card">
        <h2>Issue a digital degree</h2>
        <p className="muted">
          Each attribute is salted and hashed into a Merkle tree. Only the root goes on the blockchain, so no personal data is public.
        </p>
        <form onSubmit={issue}>
          <label>Student holder ID</label>
          <div className="row">
            <input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="did:bcid:..." required />
            <button type="button" className="ghost" onClick={() => setHolder(loadWallet()?.holderId || "")}>
              Use this browser's wallet
            </button>
          </div>

          <label>Credential attributes</label>
          {rows.map(([k, v], i) => (
            <div className="row" key={i}>
              <input value={k} onChange={(e) => setRow(i, 0, e.target.value)} aria-label="Attribute name" />
              <input value={v} onChange={(e) => setRow(i, 1, e.target.value)} aria-label="Attribute value" />
              <button type="button" className="icon" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove attribute">×</button>
            </div>
          ))}
          <div className="row">
            <button type="button" className="ghost" onClick={() => setRows([...rows, ["", ""]])}>Add attribute</button>
            <button className="primary" disabled={busy || !holder}>{busy ? "Signing and anchoring..." : "Sign and issue credential"}</button>
          </div>
        </form>
        {msg && (
          <p className={msg.ok ? "note ok" : "note err"}>
            {msg.text} {msg.ok && <a href="#wallet" onClick={() => goto("wallet")}>Open student wallet</a>}
          </p>
        )}
      </section>

      <section className="card">
        <h2>Issued credentials</h2>
        {list.length === 0 ? (
          <p className="muted">Nothing issued yet. Create a wallet in the Student wallet tab, then issue a credential to its holder ID.</p>
        ) : (
          <ul className="plain">
            {list.map((c) => (
              <li key={c.credential_id} className="item">
                <div>
                  <strong>{c.credential_id}</strong>
                  <div className="mono small">{c.holder_id}</div>
                  <div className="small muted">{c.attribute_names.join(", ")}</div>
                </div>
                {c.revoked ? <span className="tag bad">Revoked</span> : <button className="ghost danger" onClick={() => revoke(c.credential_id)}>Revoke</button>}
              </li>
            ))}
          </ul>
        )}
        <p className="small muted">The server keeps only hashes and metadata here. Names and grades live in the student's wallet.</p>
      </section>
    </div>
  );
}
