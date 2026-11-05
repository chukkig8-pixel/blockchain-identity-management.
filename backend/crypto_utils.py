"""ECDSA (P-256 / SHA-256) helpers.

* The university (issuer) key lives on the server. It can be encrypted at rest with
  ISSUER_KEY_PASSPHRASE and the file is written with mode 0600. No key is hard-coded.
* Holder (student) keys are generated in the browser with WebCrypto; only the public key
  is ever sent to the server. WebCrypto emits raw r||s signatures, converted here to DER.
"""
import base64
import os
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import (
    decode_dss_signature,
    encode_dss_signature,
)

from merkle import sha256_hex


def _b64url_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


class IssuerKey:
    def __init__(self, path: Path, passphrase: str | None = None):
        self.path = Path(path)
        self.passphrase = passphrase.encode() if passphrase else None
        self.private_key = self._load_or_create()
        self.public_key = self.private_key.public_key()

    def _load_or_create(self):
        if self.path.exists():
            return serialization.load_pem_private_key(self.path.read_bytes(), password=self.passphrase)
        key = ec.generate_private_key(ec.SECP256R1())
        enc = (
            serialization.BestAvailableEncryption(self.passphrase)
            if self.passphrase
            else serialization.NoEncryption()
        )
        pem = key.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, enc
        )
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_bytes(pem)
        os.chmod(self.path, 0o600)
        return key

    def sign(self, message: str) -> str:
        return self.private_key.sign(message.encode(), ec.ECDSA(hashes.SHA256())).hex()

    def public_pem(self) -> str:
        return self.public_key.public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
        ).decode()

    def fingerprint(self) -> str:
        der = self.public_key.public_bytes(
            serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
        )
        return "did:bcid:issuer:" + sha256_hex(der.hex())[:32]

    def verify(self, message: str, signature_hex: str) -> bool:
        try:
            self.public_key.verify(bytes.fromhex(signature_hex), message.encode(), ec.ECDSA(hashes.SHA256()))
            return True
        except (InvalidSignature, ValueError):
            return False


def holder_public_key(jwk: dict) -> ec.EllipticCurvePublicKey:
    if jwk.get("kty") != "EC" or jwk.get("crv") != "P-256":
        raise ValueError("Holder key must be an EC P-256 JWK")
    x = int.from_bytes(_b64url_decode(jwk["x"]), "big")
    y = int.from_bytes(_b64url_decode(jwk["y"]), "big")
    return ec.EllipticCurvePublicNumbers(x, y, ec.SECP256R1()).public_key()


def holder_id_from_jwk(jwk: dict) -> str:
    holder_public_key(jwk)  # validates the point is on the curve
    return "did:bcid:" + sha256_hex(f"{jwk['x']}.{jwk['y']}")[:40]


def verify_holder_signature(jwk: dict, message: str, signature_b64url: str) -> bool:
    """Verify a WebCrypto ECDSA signature (raw r||s, base64url)."""
    try:
        raw = _b64url_decode(signature_b64url)
        if len(raw) != 64:
            return False
        r, s = int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big")
        holder_public_key(jwk).verify(
            encode_dss_signature(r, s), message.encode(), ec.ECDSA(hashes.SHA256())
        )
        return True
    except (InvalidSignature, ValueError, KeyError):
        return False
