// End-to-end check against a running backend using the real wallet code from the frontend.
// Usage: node scripts/e2e_check.mjs [http://127.0.0.1:5000]
import { createKeys, sign, presentationMessage } from "../frontend/src/wallet.js";

const base = process.argv[2] || "http://127.0.0.1:5000";
const j = async (path, body) => {
  const r = await fetch(base + "/api" + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  return { status: r.status, data: await r.json() };
};
let failed = 0;
const check = (name, ok) => { console.log((ok ? "PASS  " : "FAIL  ") + name); if (!ok) failed++; };

const keys = await createKeys();
const { data: h } = await j("/holders", { public_key: keys.publicJwk, label: "e2e" });
const issue = await j("/issuer/issue", { holder_id: h.holder_id, attributes: { Name: "Asha Rao", Degree: "BCA Cyber Security", CGPA: "8.7" } });
check("university issues and anchors credential", issue.status === 201);
const { data: inbox } = await j(`/holders/${h.holder_id}/inbox`);
const cred = inbox.credentials[0];
check("wallet receives credential from inbox", !!cred);

async function present(keysToShare) {
  const { data: ch } = await j("/verifier/challenge", {});
  const disclosed = cred.attributes.filter((a) => keysToShare.includes(a.key)).map(({ key, value, salt, proof }) => ({ key, value, salt, proof }));
  return {
    credential_id: cred.credential_id, issuer_id: cred.issuer_id, holder_id: cred.holder_id, root: cred.root,
    issuer_signature: cred.issuer_signature, nonce: ch.nonce, disclosed,
    holder_signature: await sign(keys.privateJwk, presentationMessage(ch.nonce, cred.credential_id, cred.root, keysToShare)),
  };
}

let p = await present(["Degree"]);
let v = (await j("/verifier/verify", p)).data;
check("selective disclosure (Degree only) is VERIFIED", v.valid && v.attributes.length === 1 && v.attributes[0].value === "BCA Cyber Security");
check("hidden attributes are not in the proof", !JSON.stringify(p).includes("8.7") && !JSON.stringify(p).includes("Asha"));

v = (await j("/verifier/verify", p)).data;
check("replaying the same proof is rejected", !v.valid);

p = await present(["Degree"]);
p.disclosed[0].value = "BCA + PhD";
v = (await j("/verifier/verify", p)).data;
check("BCA + PhD edit -> hash mismatch, tampering detected", !v.valid && v.tampered && v.checks.find((c) => c.id === "integrity").detail.includes("Hash mismatch, tampering detected"));

const rev = await j("/issuer/revoke", { credential_id: cred.credential_id });
check("issuer revokes credential", rev.status === 200);
p = await present(["Degree"]);
v = (await j("/verifier/verify", p)).data;
check("revoked credential is rejected", !v.valid && !v.checks.find((c) => c.id === "revocation").passed);

const led = (await j("/ledger")).data;
check("ledger chain is valid with REGISTER + REVOKE blocks", led.valid && led.blocks.some((b) => b.type === "REGISTER") && led.blocks.some((b) => b.type === "REVOKE"));
console.log(failed ? `\n${failed} check(s) failed` : "\nAll end-to-end checks passed");
process.exit(failed ? 1 : 0);
