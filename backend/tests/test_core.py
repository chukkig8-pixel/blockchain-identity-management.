import base64
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

import merkle
from app import create_app
from ledger import LocalLedger


def b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


class Wallet:
    """Python stand-in for the browser wallet (P-256 key, raw r||s signatures like WebCrypto)."""

    def __init__(self):
        self.key = ec.generate_private_key(ec.SECP256R1())
        n = self.key.public_key().public_numbers()
        self.jwk = {"kty": "EC", "crv": "P-256", "x": b64u(n.x.to_bytes(32, "big")), "y": b64u(n.y.to_bytes(32, "big"))}

    def sign(self, msg):
        r, s = decode_dss_signature(self.key.sign(msg.encode(), ec.ECDSA(hashes.SHA256())))
        return b64u(r.to_bytes(32, "big") + s.to_bytes(32, "big"))


@pytest.fixture()
def env(tmp_path):
    app = create_app(ledger=LocalLedger(tmp_path / "ledger.json"), data_dir=tmp_path)
    return app, app.test_client(), Wallet()


ATTRS = {"Name": "Asha Rao", "Degree": "BCA Cyber Security", "Year": "2026", "CGPA": "8.7"}


def issue(client, wallet, attrs=ATTRS):
    hid = client.post("/api/holders", json={"public_key": wallet.jwk}).get_json()["holder_id"]
    r = client.post("/api/issuer/issue", json={"holder_id": hid, "attributes": attrs})
    assert r.status_code == 201
    pkg = client.get(f"/api/holders/{hid}/inbox").get_json()["credentials"][0]
    return hid, pkg


def present(client, wallet, pkg, keys, nonce=None):
    nonce = nonce or client.post("/api/verifier/challenge").get_json()["nonce"]
    p = {
        "credential_id": pkg["credential_id"], "issuer_id": pkg["issuer_id"], "holder_id": pkg["holder_id"],
        "root": pkg["root"], "issuer_signature": pkg["issuer_signature"], "nonce": nonce,
        "disclosed": [{k: a[k] for k in ("key", "value", "salt", "proof")} for a in pkg["attributes"] if a["key"] in keys],
    }
    msg = f"{nonce}|{p['credential_id']}|{p['root']}|{','.join(sorted(a['key'] for a in p['disclosed']))}"
    p["holder_signature"] = wallet.sign(msg)
    return p


def verify(client, p):
    return client.post("/api/verifier/verify", json=p).get_json()


# ---- Merkle ----
@pytest.mark.parametrize("n", [1, 2, 3, 5, 8])
def test_merkle_proofs(n):
    leaves = [merkle.leaf_hash("s", f"k{i}", f"v{i}") for i in range(n)]
    root = merkle.root_of(leaves)
    for i, leaf in enumerate(leaves):
        assert merkle.verify_proof(leaf, merkle.proof_for(leaves, i), root)
    assert not merkle.verify_proof(merkle.leaf_hash("s", "k0", "EVIL"), merkle.proof_for(leaves, 0), root)


# ---- Happy path + selective disclosure ----
def test_selective_disclosure_valid(env):
    _, c, w = env
    _, pkg = issue(c, w)
    p = present(c, w, pkg, {"Degree"})
    res = verify(c, p)
    assert res["valid"] and all(ch["passed"] for ch in res["checks"])
    assert [a["key"] for a in res["attributes"]] == ["Degree"]
    assert "CGPA" not in json.dumps(p) and "8.7" not in json.dumps(p)  # hidden data never leaves the wallet


def test_server_does_not_store_attribute_values(env):
    app, c, w = env
    issue(c, w)
    assert "Asha Rao" not in json.dumps(app.svc.state["credentials"])


# ---- Tamper detection (the Slide 7 demo) ----
def test_modified_attribute_is_detected(env):
    _, c, w = env
    _, pkg = issue(c, w)
    p = present(c, w, pkg, {"Degree"})
    p["disclosed"][0]["value"] = "BCA + PhD"
    res = verify(c, p)
    assert not res["valid"] and res["tampered"]
    integrity = next(ch for ch in res["checks"] if ch["id"] == "integrity")
    assert "Hash mismatch, tampering detected" in integrity["detail"]


def test_forged_issuer_signature_rejected(env):
    _, c, w = env
    _, pkg = issue(c, w)
    p = present(c, w, pkg, {"Degree"})
    p["issuer_signature"] = "00" * 70
    assert not verify(c, p)["valid"]


def test_credential_with_unanchored_root_rejected(env):
    _, c, w = env
    _, pkg = issue(c, w)
    leaves = [merkle.leaf_hash("x", "Degree", "PhD")]
    p = present(c, w, pkg, {"Degree"})
    p["root"] = merkle.root_of(leaves)
    p["disclosed"] = [{"key": "Degree", "value": "PhD", "salt": "x", "proof": []}]
    res = verify(c, p)
    assert not res["valid"]
    assert not next(ch for ch in res["checks"] if ch["id"] == "anchor")["passed"]


# ---- Replay, wrong holder, revocation ----
def test_replay_is_blocked(env):
    _, c, w = env
    _, pkg = issue(c, w)
    p = present(c, w, pkg, {"Degree"})
    assert verify(c, p)["valid"]
    assert not verify(c, p)["valid"]  # same nonce reused


def test_stolen_credential_without_holder_key_fails(env):
    _, c, w = env
    _, pkg = issue(c, w)
    thief = Wallet()
    p = present(c, thief, pkg, {"Degree"})
    res = verify(c, p)
    assert not res["valid"]
    assert not next(ch for ch in res["checks"] if ch["id"] == "holder")["passed"]


def test_revoked_credential_fails(env):
    _, c, w = env
    _, pkg = issue(c, w)
    assert c.post("/api/issuer/revoke", json={"credential_id": pkg["credential_id"]}).status_code == 200
    res = verify(c, present(c, w, pkg, {"Degree"}))
    assert not res["valid"]
    assert not next(ch for ch in res["checks"] if ch["id"] == "revocation")["passed"]


def test_unknown_nonce_fails(env):
    _, c, w = env
    _, pkg = issue(c, w)
    assert not verify(c, present(c, w, pkg, {"Degree"}, nonce="deadbeef"))["valid"]


# ---- Input validation ----
def test_issue_rejects_bad_input(env):
    _, c, w = env
    hid = c.post("/api/holders", json={"public_key": w.jwk}).get_json()["holder_id"]
    assert c.post("/api/issuer/issue", json={"holder_id": "nope", "attributes": ATTRS}).status_code == 404
    assert c.post("/api/issuer/issue", json={"holder_id": hid, "attributes": {}}).status_code == 400
    assert c.post("/api/issuer/issue", json={"holder_id": hid, "attributes": {"a|b": "x"}}).status_code == 400
    assert c.post("/api/holders", json={"public_key": {"kty": "RSA"}}).status_code == 400


# ---- Ledger tamper evidence ----
def test_local_ledger_detects_tampering(env):
    _, c, w = env
    issue(c, w)
    assert c.get("/api/ledger").get_json()["valid"]
    c.post("/api/demo/tamper-ledger")
    view = c.get("/api/ledger").get_json()
    assert not view["valid"] and view["broken_at"] is not None


def test_issuer_key_file_permissions_and_encryption(tmp_path):
    import os, stat
    from crypto_utils import IssuerKey
    k = IssuerKey(tmp_path / "k.pem", "secret-pass")
    assert stat.S_IMODE(os.stat(tmp_path / "k.pem").st_mode) == 0o600
    assert b"ENCRYPTED" in (tmp_path / "k.pem").read_bytes()
    assert IssuerKey(tmp_path / "k.pem", "secret-pass").fingerprint() == k.fingerprint()
