import { useEffect, useState } from "react";
import { api } from "../api.js";
import { clearWallet, createKeys, loadWallet, PENDING_KEY, presentationMessage, saveWallet, SHARED_KEY, sign } from "../wallet.js";

export default function Wallet({ goto }) {
  const [wallet, setWallet] = useState(loadWallet());
  const [label, setLabel] = useState("");
  const [err, setErr] = useState("");
  const [nonce, setNonce] = useState(localStorage.getItem(PENDING_KEY) || "");
  const [picked, setPicked] = useState({});
  const [proof, setProof] = useState(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    setErr("");
    try {
      const keys = await createKeys();
      const { holder_id } = await api.registerHolder(keys.publicJwk, label);
      const w = { ...keys, holderId: holder_id, label, credentials: [] };
      saveWallet(w); setWallet(w);
    } catch (e) { setErr(e.message); }
  }

  async function sync() {
    if (!wallet) return;
    try {
      const { credentials } = await api.inbox(wallet.holderId);
      if (credentials.length) {
        const w = { ...wallet, credentials: [...wallet.credentials, ...credentials] };
        saveWallet(w); setWallet(w);
      }
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { sync(); /* eslint-disable-next-line */ }, []);

  const toggle = (cid, key) =>
    setPicked((p) => ({ ...p, [cid]: { ...(p[cid] || {}), [key]: !(p[cid] || {})[key] } }));

  async function share(cred) {
    setErr(""); setProof(null);
    const keys = Object.keys(picked[cred.credential_id] || {}).filter((k) => picked[cred.credential_id][k]);
    if (!keys.length) return setErr("Tick at least one attribute to share.");
    if (!nonce.trim()) return setErr("Paste the verification request code from the employer first.");
    try {
      const disclosed = cred.attributes.filter((a) => keys.includes(a.key)).map(({ key, value, salt, proof }) => ({ key, value, salt, proof }));
      const holder_signature = await sign(wallet.privateJwk, presentationMessage(nonce.trim(), cred.credential_id, cred.root, keys));
      setProof({
        credential_id: cred.credential_id, issuer_id: cred.issuer_id, holder_id: cred.holder_id,
        root: cred.root, issuer_signature: cred.issuer_signature, nonce: nonce.trim(), disclosed, holder_signature,
      });
    } catch (e) { setErr(e.message); }
  }

  const proofText = proof ? JSON.stringify(proof, null, 2) : "";
  function sendToEmployer() { localStorage.setItem(SHARED_KEY, proofText); goto("employer"); }
  async function copy() { await navigator.clipboard.writeText(proofText); setCopied(true); setTimeout(() => setCopied(false), 1500); }
  function backup() {
    const blob = new Blob([JSON.stringify(wallet, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "chainid-wallet-backup.json"; a.click();
  }
  function restore(e) {
    const f = e.target.files[0]; if (!f) return;
    f.text().then((t) => { const w = JSON.parse(t); saveWallet(w); setWallet(w); }).catch(() => setErr("That file is not a wallet backup."));
  }
  function wipe() {
    if (confirm("Delete this wallet and its private key from this browser? Without a backup, you will need the university to revoke and reissue.")) { clearWallet(); setWallet(null); setProof(null); }
  }

  if (!wallet) {
    return (
      <section className="card narrow">
        <h2>Create your identity wallet</h2>
        <p className="muted">Your private key is created in this browser and never leaves it. Only the public key is registered.</p>
        <label>Wallet name (optional)</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Asha's wallet" />
        <div className="row">
          <button className="primary" onClick={create}>Create wallet</button>
          <label className="ghost filebtn">Restore from backup<input type="file" accept="application/json" onChange={restore} hidden /></label>
        </div>
        {err && <p className="note err">{err}</p>}
      </section>
    );
  }

  return (
    <div className="grid two">
      <section className="card">
        <h2>{wallet.label || "Your wallet"}</h2>
        <label>Holder ID (give this to the university)</label>
        <div className="mono boxed">{wallet.holderId}</div>
        <div className="row">
          <button className="ghost" onClick={sync}>Check for new credentials</button>
          <button className="ghost" onClick={backup}>Download key backup</button>
          <button className="ghost danger" onClick={wipe}>Delete wallet</button>
        </div>
        <p className="small muted">The backup file contains your private key. Store it somewhere safe and offline.</p>

        <label>Verification request code</label>
        <input value={nonce} onChange={(e) => setNonce(e.target.value)} placeholder="Paste the code from the employer" className="mono" />
        <button className="ghost" onClick={() => setNonce(localStorage.getItem(PENDING_KEY) || "")}>Use request from this browser</button>
        {err && <p className="note err">{err}</p>}
      </section>

      <section className="card">
        <h2>Your credentials</h2>
        {wallet.credentials.length === 0 && <p className="muted">No credentials yet. After the university issues one, press Check for new credentials.</p>}
        {wallet.credentials.map((c) => (
          <div key={c.credential_id} className="cred">
            <div className="credhead"><strong>{c.issuer_name}</strong><span className="mono small">{c.credential_id}</span></div>
            <p className="small muted">Tick only what the employer needs.</p>
            {c.attributes.map((a) => (
              <label key={a.key} className="check">
                <input type="checkbox" checked={!!(picked[c.credential_id] || {})[a.key]} onChange={() => toggle(c.credential_id, a.key)} />
                <span>{a.key}</span><b>{a.value}</b>
              </label>
            ))}
            <button className="primary" onClick={() => share(c)}>Create proof</button>
          </div>
        ))}
        {proof && (
          <div className="proof">
            <h3>Proof ready</h3>
            <p className="small muted">Shares {proof.disclosed.length} of the credential's attributes. Everything else stays hidden.</p>
            <textarea readOnly value={proofText} rows={7} className="mono" />
            <div className="row">
              <button className="primary" onClick={sendToEmployer}>Send to employer</button>
              <button className="ghost" onClick={copy}>{copied ? "Copied" : "Copy proof"}</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
