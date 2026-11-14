"""Core identity logic: issuing credentials, anchoring them, and verifying presentations."""
import json
import os
import re
import secrets
import time
from pathlib import Path

import crypto_utils as cu
import merkle
from ledger import LedgerError

KEY_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_ ]{0,39}$")
IMAGE_DATA_RE = re.compile(r"^data:image/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\s]+$")
MAX_ATTRIBUTES = 20
MAX_VALUE_LEN = 500
MAX_IMAGE_LEN = 300_000
CHALLENGE_TTL = 600  # seconds


class ServiceError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


class IdentityService:
    def __init__(self, data_dir, ledger, issuer_name="Demo University", passphrase=None):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.state_path = self.data_dir / "state.json"
        self.ledger = ledger
        self.issuer_name = issuer_name
        self.issuer = cu.IssuerKey(self.data_dir / "issuer_key.pem", passphrase)
        self.state = (
            json.loads(self.state_path.read_text())
            if self.state_path.exists()
            else {"holders": {}, "credentials": {}, "inbox": {}, "challenges": {}}
        )

    def _save(self):
        self.state_path.write_text(json.dumps(self.state, indent=2))

    # ---------- holders ----------
    def register_holder(self, jwk, label=""):
        try:
            holder_id = cu.holder_id_from_jwk(jwk)
        except Exception:
            raise ServiceError("Invalid public key. Expected an EC P-256 JWK.")
        self.state["holders"][holder_id] = {
            "jwk": {k: jwk[k] for k in ("kty", "crv", "x", "y")},
            "label": str(label)[:60],
            "created_at": int(time.time()),
        }
        self._save()
        return holder_id

    def pop_inbox(self, holder_id):
        items = self.state["inbox"].pop(holder_id, [])
        self._save()
        return items

    # ---------- issuing ----------
    def issue(self, holder_id, attributes):
        if holder_id not in self.state["holders"]:
            raise ServiceError("Unknown holder ID. Ask the student to create a wallet first.", 404)
        if not isinstance(attributes, dict) or not attributes:
            raise ServiceError("Provide at least one attribute.")
        if len(attributes) > MAX_ATTRIBUTES:
            raise ServiceError(f"At most {MAX_ATTRIBUTES} attributes per credential.")
        clean = {}
        for k, v in attributes.items():
            k, v = str(k).strip(), str(v).strip()
            is_img = v.startswith("data:image/")
            max_len = MAX_IMAGE_LEN if is_img else MAX_VALUE_LEN
            if not KEY_RE.match(k) or not v or len(v) > max_len or "|" in k + v:
                raise ServiceError(f"Invalid attribute '{k}'. Names are plain text, values 1-{MAX_VALUE_LEN} chars (or valid image), no '|'.")
            if is_img and not IMAGE_DATA_RE.match(v):
                raise ServiceError(f"Invalid image format for '{k}'. Expected a base64 PNG, JPEG, WebP, or GIF image.")
            clean[k] = v

        keys = sorted(clean)
        salts = {k: secrets.token_hex(16) for k in keys}
        leaves = [merkle.leaf_hash(salts[k], k, clean[k]) for k in keys]
        root = merkle.root_of(leaves)
        credential_id = "cred-" + secrets.token_hex(8)
        issuer_id = self.issuer.fingerprint()
        signature = self.issuer.sign(f"{credential_id}|{holder_id}|{root}|{issuer_id}")
        try:
            anchor = self.ledger.register(root)
        except LedgerError as e:
            raise ServiceError(f"Ledger rejected the credential: {e}", 502)

        package = {
            "credential_id": credential_id,
            "issuer_id": issuer_id,
            "issuer_name": self.issuer_name,
            "holder_id": holder_id,
            "root": root,
            "issuer_signature": signature,
            "issued_at": int(time.time()),
            "anchor": anchor,
            "attributes": [
                {"key": k, "value": clean[k], "salt": salts[k], "proof": merkle.proof_for(leaves, i)}
                for i, k in enumerate(keys)
            ],
        }
        # The server keeps only metadata. Attribute values go to the student's wallet.
        self.state["credentials"][credential_id] = {
            "credential_id": credential_id, "holder_id": holder_id, "root": root,
            "issued_at": package["issued_at"], "attribute_names": keys, "anchor": anchor,
        }
        self.state["inbox"].setdefault(holder_id, []).append(package)
        self._save()
        return package

    def list_credentials(self):
        out = []
        for c in self.state["credentials"].values():
            rec = self.ledger.lookup(c["root"])
            out.append({**c, "revoked": rec["revoked"]})
        return sorted(out, key=lambda c: c["issued_at"], reverse=True)

    def revoke(self, credential_id):
        c = self.state["credentials"].get(credential_id)
        if not c:
            raise ServiceError("Unknown credential.", 404)
        try:
            return self.ledger.revoke(c["root"])
        except LedgerError as e:
            raise ServiceError(str(e), 409)

    # ---------- verification ----------
    def new_challenge(self):
        now = int(time.time())
        self.state["challenges"] = {
            n: c for n, c in self.state["challenges"].items() if now - c["created"] < CHALLENGE_TTL
        }
        nonce = secrets.token_hex(16)
        self.state["challenges"][nonce] = {"created": now}
        self._save()
        return {"nonce": nonce, "expires_in": CHALLENGE_TTL}

    @staticmethod
    def holder_message(p):
        keys = ",".join(sorted(a["key"] for a in p["disclosed"]))
        return f"{p['nonce']}|{p['credential_id']}|{p['root']}|{keys}"

    def verify(self, p):
        required = ("credential_id", "issuer_id", "holder_id", "root", "issuer_signature",
                    "disclosed", "nonce", "holder_signature")
        if not isinstance(p, dict) or any(k not in p for k in required) or not isinstance(p["disclosed"], list):
            raise ServiceError("Malformed presentation.")
        checks, disclosed_out = [], []

        def add(cid, label, ok, detail):
            checks.append({"id": cid, "label": label, "passed": bool(ok), "detail": detail})

        # 1. Fresh challenge (blocks replay of a captured presentation)
        ch = self.state["challenges"].get(p["nonce"])
        fresh = bool(ch) and int(time.time()) - ch["created"] < CHALLENGE_TTL
        add("challenge", "Fresh verification request", fresh,
            "Challenge is valid and unused." if fresh else "Challenge is unknown, expired or already used (possible replay).")

        # 2. Attribute integrity via Merkle proofs
        bad = []
        for a in p["disclosed"]:
            try:
                leaf = merkle.leaf_hash(str(a["salt"]), str(a["key"]), str(a["value"]))
                ok = merkle.verify_proof(leaf, a["proof"], p["root"])
            except (KeyError, TypeError):
                ok = False
            disclosed_out.append({"key": a.get("key"), "value": a.get("value"), "verified": ok})
            if not ok:
                bad.append(str(a.get("key")))
        add("integrity", "Attribute hashes match credential root", not bad and bool(p["disclosed"]),
            "All disclosed attributes match the issued hashes." if not bad and p["disclosed"]
            else ("Hash mismatch, tampering detected in: " + ", ".join(bad)) if bad else "No attributes disclosed.")

        # 3. Issuer signature
        trusted = p["issuer_id"] == self.issuer.fingerprint()
        msg = f"{p['credential_id']}|{p['holder_id']}|{p['root']}|{p['issuer_id']}"
        sig_ok = trusted and self.issuer.verify(msg, str(p["issuer_signature"]))
        add("issuer_signature", "Issuer digital signature", sig_ok,
            f"Signed by {self.issuer_name}." if sig_ok else
            ("Issuer is not trusted." if not trusted else "Signature does not match the credential."))

        # 4 + 5. Blockchain anchor and revocation
        try:
            rec = self.ledger.lookup(p["root"])
        except Exception:
            rec = {"exists": False, "issuer": None, "revoked": False}
        anchored = rec["exists"] and rec["issuer"] == self.ledger.issuer_identity
        add("anchor", "Anchored on blockchain by the issuer", anchored,
            "Credential root found on the ledger." if anchored else "Root is not registered by the trusted issuer.")
        add("revocation", "Credential not revoked", anchored and not rec["revoked"],
            "Credential is active." if anchored and not rec["revoked"] else
            ("Credential was revoked by the issuer." if rec["revoked"] else "Cannot check revocation."))

        # 6. Holder binding (proof of key possession)
        holder = self.state["holders"].get(p["holder_id"])
        bound = False
        if holder:
            try:
                bound = (cu.holder_id_from_jwk(holder["jwk"]) == p["holder_id"]
                         and cu.verify_holder_signature(holder["jwk"], self.holder_message(p), str(p["holder_signature"])))
            except Exception:
                bound = False
        add("holder", "Presented by the credential owner", bound,
            "Holder signed this request with their private key." if bound else
            "Holder signature is missing or invalid.")

        valid = all(c["passed"] for c in checks)
        if fresh and valid:  # consume the challenge so it cannot be replayed
            self.state["challenges"].pop(p["nonce"], None)
            self._save()
        return {
            "valid": valid,
            "checks": checks,
            "attributes": disclosed_out if valid else [],
            "tampered": bool(bad),
            "issuer_name": self.issuer_name if sig_ok else None,
            "issued_at": rec.get("issued_at"),
        }

    def reset(self):
        self.state = {"holders": {}, "credentials": {}, "inbox": {}, "challenges": {}}
        self._save()
