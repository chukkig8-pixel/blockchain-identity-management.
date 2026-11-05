async function call(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
const post = (path, body) => call(path, { method: "POST", body: JSON.stringify(body || {}) });

export const api = {
  info: () => call("/info"),
  registerHolder: (public_key, label) => post("/holders", { public_key, label }),
  inbox: (id) => call(`/holders/${id}/inbox`),
  issue: (holder_id, attributes) => post("/issuer/issue", { holder_id, attributes }),
  credentials: () => call("/issuer/credentials"),
  revoke: (credential_id) => post("/issuer/revoke", { credential_id }),
  challenge: () => post("/verifier/challenge"),
  verify: (presentation) => post("/verifier/verify", presentation),
  ledger: () => call("/ledger"),
  tamperLedger: () => post("/demo/tamper-ledger"),
  reset: () => post("/demo/reset"),
};
