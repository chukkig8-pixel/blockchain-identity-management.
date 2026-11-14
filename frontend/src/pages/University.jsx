import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { createKeys, loadWallet, saveWallet } from "../wallet.js";
import { compressImageToDataUrl, createSampleStudentPhoto, PHOTO_KEY } from "../photoUtils.js";

const DEFAULTS = [
  ["Name", "Asha Rao"],
  ["Enrollment No", "BCA22017"],
  ["Degree", "BCA Cyber Security"],
  ["Graduation Year", "2026"],
  ["CGPA", "8.7"],
  ["Date of Birth", "2004-03-14"],
];

const QUICK_ATTRS = [
  ["Specialization", "Network & Cloud Security"],
  ["Blood Group", "O+"],
  ["Email", "asha.rao@student.edu"],
  ["Honors", "First Class with Distinction"],
];

export default function University({ goto, onFlowChange }) {
  const [holder, setHolder] = useState(() => loadWallet()?.holderId || "");
  const [rows, setRows] = useState(DEFAULTS);
  const [photo, setPhoto] = useState(() => createSampleStudentPhoto("Asha Rao"));
  const [photoStatus, setPhotoStatus] = useState("Sample passport photo ready (or browse / Ctrl+V paste your own)");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [list, setList] = useState([]);
  const fileInputRef = useRef(null);

  const refresh = () => api.credentials().then((r) => setList(r.credentials)).catch(() => {});
  useEffect(() => { refresh(); }, []);

  const setRow = (i, j, v) => setRows(rows.map((r, k) => (k === i ? r.map((c, l) => (l === j ? v : c)) : r)));

  async function handleImageFile(file, sourceLabel = "Uploaded photo") {
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setPhoto(dataUrl);
      setPhotoStatus(`${sourceLabel} (${Math.round(dataUrl.length / 1024)} KB compressed)`);
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  }

  async function handlePasteEvent(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const blob = item.getAsFile();
        await handleImageFile(blob, "Pasted photo from clipboard");
        return;
      }
    }
    const pastedText = e.clipboardData?.getData("text/plain")?.trim();
    if (pastedText && (pastedText.startsWith("data:image/") || /^https?:\/\/.+/i.test(pastedText))) {
      e.preventDefault();
      try {
        const dataUrl = await compressImageToDataUrl(pastedText);
        setPhoto(dataUrl);
        setPhotoStatus("Pasted image URL / data URI");
      } catch {
        setMsg({ ok: false, text: "Could not load image from pasted URL. Try copying the image itself and pressing Ctrl+V." });
      }
    }
  }

  async function pasteFromClipboardBtn() {
    setMsg(null);
    if (!navigator.clipboard) {
      setMsg({ ok: false, text: "Click inside the photo box and press Ctrl+V (or Cmd+V) to paste an image." });
      return;
    }
    try {
      if (navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imgType = item.types.find((t) => t.startsWith("image/"));
          if (imgType) {
            const blob = await item.getType(imgType);
            await handleImageFile(blob, "Pasted photo from clipboard");
            return;
          }
        }
      }
      if (navigator.clipboard.readText) {
        const txt = (await navigator.clipboard.readText()).trim();
        if (txt.startsWith("data:image/") || /^https?:\/\/.+/i.test(txt)) {
          const dataUrl = await compressImageToDataUrl(txt);
          setPhoto(dataUrl);
          setPhotoStatus("Pasted image link from clipboard");
          return;
        }
      }
      setMsg({ ok: false, text: "No image found in clipboard. Copy an image first or press Ctrl+V in the photo box." });
    } catch {
      setMsg({ ok: false, text: "Browser blocked direct clipboard read—click the photo box below and press Ctrl+V to paste." });
    }
  }

  function useSamplePhoto() {
    const studentName = rows.find(([k]) => k.toLowerCase() === "name")?.[1] || "Asha Rao";
    const sample = createSampleStudentPhoto(studentName);
    setPhoto(sample);
    setPhotoStatus(`Generated sample ID photo for ${studentName}`);
  }

  async function quickCreateWallet() {
    setMsg(null);
    try {
      const existing = loadWallet();
      if (existing?.holderId) {
        setHolder(existing.holderId);
        return;
      }
      const studentName = rows.find(([k]) => k.toLowerCase() === "name")?.[1] || "Asha";
      const keys = await createKeys();
      const { holder_id } = await api.registerHolder(keys.publicJwk, `${studentName}'s wallet`);
      const w = { ...keys, holderId: holder_id, label: `${studentName}'s wallet`, credentials: [] };
      saveWallet(w);
      setHolder(holder_id);
      onFlowChange?.();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
  }

  function addPresetAttr(key, defaultVal) {
    const existingIdx = rows.findIndex(([k]) => k.trim().toLowerCase() === key.toLowerCase());
    if (existingIdx >= 0) return;
    setRows([...rows, [key, defaultVal]]);
  }

  async function issue(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const attrs = Object.fromEntries(rows.filter(([k, v]) => k.trim() && v.trim()));
      if (photo) {
        attrs[PHOTO_KEY] = photo;
      }
      const r = await api.issue(holder.trim(), attrs);
      setMsg({
        ok: true,
        text: `Issued ${r.credential_id} (with ${Object.keys(attrs).length} attributes${photo ? " including Student Photo" : ""}) and anchored its fingerprint in block ${r.anchor.block}. It is now waiting in the student's wallet.`,
      });
      refresh();
      onFlowChange?.();
    } catch (err) { setMsg({ ok: false, text: err.message }); }
    setBusy(false);
  }

  async function revoke(id) {
    try { await api.revoke(id); refresh(); onFlowChange?.(); } catch (err) { setMsg({ ok: false, text: err.message }); }
  }

  return (
    <>
      <div className="role-banner">
        <div>
          <span className="role-pill">Tab 1 · University (Issuer)</span>
          <strong>College Records Office</strong>
          <p className="small muted">
            Fill in a student’s details and photo, then click <b>Sign and issue credential</b>. The university digitally signs the degree and writes only its cryptographic fingerprint on the blockchain.
          </p>
        </div>
        <div className="role-next">
          <span className="small muted">After issuing:</span>
          <button type="button" className="ghost small-btn" onClick={() => goto("wallet")}>
            Next: 2. Student wallet →
          </button>
        </div>
      </div>

      <div className="grid two">
        <section className="card">
          <h2>Issue a digital degree</h2>
          <p className="muted">
            Each attribute—including the student’s photo—is salted and hashed into a Merkle tree. Only the single root fingerprint goes on the blockchain, so no personal data or photo is ever public.
          </p>
          <form onSubmit={issue}>
            <label>1. Student holder ID (Wallet address)</label>
            <div className="row">
              <input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="did:bcid:..." required />
              <button type="button" className="ghost" onClick={() => {
                const w = loadWallet();
                if (w?.holderId) setHolder(w.holderId);
                else quickCreateWallet();
              }}>
                {loadWallet()?.holderId ? "Use this browser's wallet" : "Create & use student wallet"}
              </button>
            </div>
            {!holder && (
              <p className="small muted tip-line">
                Tip: Click <b>Create & use student wallet</b> above (or visit the <a href="#wallet" onClick={() => goto("wallet")}>Student wallet</a> tab) to generate a student key first.
              </p>
            )}

            <label>2. Student Photo attribute (Browse, Drag & Drop, or Copy-Paste)</label>
            <div
              className={`photo-dropzone ${dragOver ? "drag" : ""}`}
              tabIndex={0}
              onPaste={handlePasteEvent}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer?.files?.[0];
                if (f) handleImageFile(f, `Dropped ${f.name}`);
              }}
              aria-label="Student photo upload and paste area"
            >
              <div className="photo-preview-wrap">
                {photo ? (
                  <img src={photo} alt="Student preview" className="student-photo-img" />
                ) : (
                  <div className="photo-placeholder">No photo</div>
                )}
              </div>
              <div className="photo-controls">
                <strong>{photo ? "Student Photo included in credential" : "No Student Photo attached"}</strong>
                <p className="small muted">
                  {photoStatus}. You can also click this box and press <kbd>Ctrl</kbd>+<kbd>V</kbd> to paste any copied image.
                </p>
                <div className="row compact-row">
                  <button type="button" className="ghost small-btn" onClick={() => fileInputRef.current?.click()}>
                    Browse photo...
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImageFile(f, `Browsed ${f.name}`);
                      e.target.value = "";
                    }}
                  />
                  <button type="button" className="ghost small-btn" onClick={pasteFromClipboardBtn}>
                    Paste photo
                  </button>
                  <button type="button" className="ghost small-btn" onClick={useSamplePhoto}>
                    Use sample photo
                  </button>
                  {photo && (
                    <button
                      type="button"
                      className="ghost danger small-btn"
                      onClick={() => { setPhoto(""); setPhotoStatus("Photo removed (only text attributes will be issued)"); }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            <label>3. Credential attributes</label>
            {rows.map(([k, v], i) => (
              <div className="row" key={i}>
                <input value={k} onChange={(e) => setRow(i, 0, e.target.value)} aria-label="Attribute name" placeholder="Attribute name" />
                <input value={v} onChange={(e) => setRow(i, 1, e.target.value)} aria-label="Attribute value" placeholder="Value" />
                <button type="button" className="icon" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove attribute">×</button>
              </div>
            ))}

            <div className="preset-bar">
              <span className="small muted">Quick add:</span>
              {QUICK_ATTRS.map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  className="chip-btn"
                  onClick={() => addPresetAttr(k, v)}
                >
                  + {k}
                </button>
              ))}
              <button type="button" className="chip-btn" onClick={() => setRows([...rows, ["", ""]])}>
                + Custom field
              </button>
            </div>

            <div className="row">
              <button type="button" className="ghost" onClick={() => setRows([...rows, ["", ""]])}>Add attribute</button>
              <button className="primary" disabled={busy || !holder}>
                {busy ? "Signing and anchoring..." : "Sign and issue credential"}
              </button>
            </div>
          </form>
          {msg && (
            <div className={msg.ok ? "note ok" : "note err"}>
              <div>{msg.text}</div>
              {msg.ok && (
                <div className="row" style={{ marginTop: 8 }}>
                  <button type="button" className="primary small-btn" onClick={() => goto("wallet")}>
                    Go to 2. Student wallet to view & share →
                  </button>
                  <a href="#wallet" onClick={() => goto("wallet")} className="small">Open student wallet</a>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="card">
          <h2>Issued credentials</h2>
          {list.length === 0 ? (
            <p className="muted">Nothing issued yet. Create a wallet in the Student wallet tab (or use the quick button on the left), then issue a credential to its holder ID.</p>
          ) : (
            <ul className="plain">
              {list.map((c) => (
                <li key={c.credential_id} className="item">
                  <div>
                    <strong>{c.credential_id}</strong>
                    <div className="mono small">{c.holder_id}</div>
                    <div className="small muted">
                      Attributes ({c.attribute_names.length}): {c.attribute_names.join(", ")}
                    </div>
                  </div>
                  {c.revoked ? <span className="tag bad">Revoked</span> : <button className="ghost danger" onClick={() => revoke(c.credential_id)}>Revoke</button>}
                </li>
              ))}
            </ul>
          )}
          <p className="small muted">The server keeps only hashes and metadata here. Names, grades, and photos live only in the student's wallet.</p>
        </section>
      </div>
    </>
  );
}
