import { useEffect, useState } from "react";
import { api } from "../api.js";
import { clearWallet, createKeys, loadWallet, PENDING_KEY, presentationMessage, saveWallet, SHARED_KEY, sign } from "../wallet.js";
import { isImageDataUrl, PHOTO_KEY } from "../photoUtils.js";

export default function Wallet({ goto, onFlowChange }) {
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
      onFlowChange?.();
    } catch (e) { setErr(e.message); }
  }

  async function sync() {
    const current = loadWallet() || wallet;
    if (!current) return;
    try {
      const { credentials } = await api.inbox(current.holderId);
      if (credentials.length) {
        const w = { ...current, credentials: [...current.credentials, ...credentials] };
        saveWallet(w); setWallet(w);
        onFlowChange?.();
      }
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { sync(); /* eslint-disable-next-line */ }, []);

  const toggle = (cid, key) =>
    setPicked((p) => ({ ...p, [cid]: { ...(p[cid] || {}), [key]: !(p[cid] || {})[key] } }));

  function selectPreset(cred, mode) {
    const map = {};
    cred.attributes.forEach((a) => {
      if (mode === "degree") map[a.key] = a.key === "Degree";
      else if (mode === "id_card") map[a.key] = ["Name", "Degree", PHOTO_KEY].includes(a.key);
      else if (mode === "all") map[a.key] = true;
      else map[a.key] = false;
    });
    setPicked((p) => ({ ...p, [cred.credential_id]: map }));
  }

  async function fetchFreshCode() {
    setErr("");
    try {
      const { nonce: fresh } = await api.challenge();
      localStorage.setItem(PENDING_KEY, fresh);
      setNonce(fresh);
      onFlowChange?.();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function share(cred) {
    setErr(""); setProof(null);
    const keys = Object.keys(picked[cred.credential_id] || {}).filter((k) => picked[cred.credential_id][k]);
    if (!keys.length) return setErr("Tick at least one attribute to share.");

    let activeNonce = nonce.trim();
    if (!activeNonce) {
      return setErr("Paste the verification request code from the employer first (or click 'Get fresh request code').");
    }
    try {
      const disclosed = cred.attributes
        .filter((a) => keys.includes(a.key))
        .map(({ key, value, salt, proof: mp }) => ({ key, value, salt, proof: mp }));
      const holder_signature = await sign(
        wallet.privateJwk,
        presentationMessage(activeNonce, cred.credential_id, cred.root, keys)
      );
      setProof({
        credential_id: cred.credential_id,
        issuer_id: cred.issuer_id,
        holder_id: cred.holder_id,
        root: cred.root,
        issuer_signature: cred.issuer_signature,
        nonce: activeNonce,
        disclosed,
        holder_signature,
      });
    } catch (e) { setErr(e.message); }
  }

  const proofText = proof ? JSON.stringify(proof, null, 2) : "";
  function sendToEmployer() {
    localStorage.setItem(SHARED_KEY, proofText);
    onFlowChange?.();
    goto("employer");
  }
  async function copy() { await navigator.clipboard.writeText(proofText); setCopied(true); setTimeout(() => setCopied(false), 1500); }
  function backup() {
    const blob = new Blob([JSON.stringify(wallet, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "chainid-wallet-backup.json"; a.click();
  }
  function restore(e) {
    const f = e.target.files[0]; if (!f) return;
    f.text().then((t) => { const w = JSON.parse(t); saveWallet(w); setWallet(w); onFlowChange?.(); }).catch(() => setErr("That file is not a wallet backup."));
  }
  function wipe() {
    if (confirm("Delete this wallet and its private key from this browser? Without a backup, you will need the university to revoke and reissue.")) {
      clearWallet(); setWallet(null); setProof(null); onFlowChange?.();
    }
  }

  if (!wallet) {
    return (
      <>
        <div className="role-banner">
          <div>
            <span className="role-pill">Tab 2 · Student Wallet (Holder)</span>
            <strong>This is you (the Student)</strong>
            <p className="small muted">
              When you create a wallet, your browser makes a secret cryptographic key that only you hold.
            </p>
          </div>
        </div>
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
      </>
    );
  }

  return (
    <>
      <div className="role-banner">
        <div>
          <span className="role-pill">Tab 2 · Student Wallet (Holder)</span>
          <strong>This is you (the Student)</strong>
          <p className="small muted">
            Your wallet stores your signed degree and photo privately. When an employer asks for proof, tick <b>only</b> the items you want to share—everything you don’t tick stays hidden.
          </p>
        </div>
        <div className="role-next">
          <button type="button" className="ghost small-btn" onClick={() => goto("university")}>
            ← 1. University
          </button>
          <button type="button" className="ghost small-btn" onClick={() => goto("employer")}>
            Next: 3. Employer →
          </button>
        </div>
      </div>

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

          <label>Verification request code (One-time challenge from employer)</label>
          <input value={nonce} onChange={(e) => setNonce(e.target.value)} placeholder="Paste the code from the employer" className="mono" />
          <div className="row">
            <button className="ghost" onClick={() => setNonce(localStorage.getItem(PENDING_KEY) || "")}>Use request from this browser</button>
            <button className="ghost" onClick={fetchFreshCode}>Get fresh request code</button>
          </div>
          <p className="small muted">
            Why a request code? Each code works only once so nobody can copy and replay an old proof.
          </p>
          {err && <p className="note err">{err}</p>}
        </section>

        <section className="card">
          <h2>Your credentials</h2>
          {wallet.credentials.length === 0 && (
            <div className="empty-state">
              <p className="muted">No credentials in your wallet yet. After the university issues one, press <b>Check for new credentials</b>.</p>
              <button type="button" className="primary small-btn" onClick={() => goto("university")}>
                Go to 1. University to issue your degree →
              </button>
            </div>
          )}
          {wallet.credentials.map((c) => {
            const photoAttr = c.attributes.find((a) => isImageDataUrl(a.value));
            const nameAttr = c.attributes.find((a) => a.key.toLowerCase() === "name");
            const degreeAttr = c.attributes.find((a) => a.key.toLowerCase() === "degree");
            const pickedMap = picked[c.credential_id] || {};
            const pickedCount = Object.values(pickedMap).filter(Boolean).length;

            return (
              <div key={c.credential_id} className="cred">
                <div className="cred-id-banner">
                  {photoAttr && (
                    <img src={photoAttr.value} alt="Student ID" className="cred-avatar" />
                  )}
                  <div style={{ flex: 1 }}>
                    <div className="credhead">
                      <strong>{c.issuer_name}</strong>
                      <span className="mono small">{c.credential_id}</span>
                    </div>
                    <div className="small muted">
                      {nameAttr ? `${nameAttr.value} · ` : ""}
                      {degreeAttr ? degreeAttr.value : "Signed Digital Credential"}
                    </div>
                  </div>
                </div>

                <div className="preset-bar" style={{ marginTop: 10 }}>
                  <span className="small muted">Tick what to share:</span>
                  <button type="button" className="chip-btn" onClick={() => selectPreset(c, "degree")}>
                    Only “Degree”
                  </button>
                  <button type="button" className="chip-btn" onClick={() => selectPreset(c, "id_card")}>
                    Name + Degree + Photo
                  </button>
                  <button type="button" className="chip-btn" onClick={() => selectPreset(c, "all")}>
                    Select all
                  </button>
                  <button type="button" className="chip-btn" onClick={() => selectPreset(c, "none")}>
                    Clear
                  </button>
                </div>

                <p className="small muted" style={{ margin: "6px 0" }}>
                  Tick only what the employer needs ({pickedCount} of {c.attributes.length} selected; {c.attributes.length - pickedCount} kept hidden):
                </p>

                {c.attributes.map((a) => {
                  const isChecked = !!pickedMap[a.key];
                  const isImg = isImageDataUrl(a.value);
                  return (
                    <label key={a.key} className={`check ${isChecked ? "checked" : ""}`}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(c.credential_id, a.key)}
                      />
                      <span>{a.key}</span>
                      {isImg ? (
                        <span className="check-photo-val">
                          <img src={a.value} alt={a.key} className="check-thumb" />
                          <b className="small">Verified Student Photo</b>
                        </span>
                      ) : (
                        <b>{a.value}</b>
                      )}
                      <em className={`privacy-pill ${isChecked ? "shared" : "hidden"}`}>
                        {isChecked ? "Will share" : "Hidden"}
                      </em>
                    </label>
                  );
                })}
                <button className="primary" onClick={() => share(c)}>Create proof</button>
              </div>
            );
          })}
          {proof && (
            <div className="proof">
              <h3>Proof ready</h3>
              <p className="small muted">
                Shares <b>{proof.disclosed.length}</b> attribute(s) ({proof.disclosed.map((d) => d.key).join(", ")}). Everything else stays completely hidden inside your wallet.
              </p>
              <textarea readOnly value={proofText} rows={7} className="mono" />
              <div className="row">
                <button className="primary" onClick={sendToEmployer}>Send to employer</button>
                <button className="ghost" onClick={copy}>{copied ? "Copied" : "Copy proof"}</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
