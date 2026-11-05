"""Salted-attribute Merkle tree used for selective disclosure.

Each attribute becomes a leaf:  SHA256("leaf|" + salt + "|" + key + "|" + value)
The random per-attribute salt stops anyone brute-forcing hidden values from the root.
"""
import hashlib


def sha256_hex(data: str) -> str:
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def leaf_hash(salt: str, key: str, value: str) -> str:
    return sha256_hex(f"leaf|{salt}|{key}|{value}")


def _pair(left: str, right: str) -> str:
    return sha256_hex(f"node|{left}|{right}")


def build_levels(leaves):
    if not leaves:
        raise ValueError("Cannot build a Merkle tree without leaves")
    levels = [list(leaves)]
    while len(levels[-1]) > 1:
        cur = levels[-1]
        nxt = []
        for i in range(0, len(cur), 2):
            left = cur[i]
            right = cur[i + 1] if i + 1 < len(cur) else cur[i]  # duplicate last if odd
            nxt.append(_pair(left, right))
        levels.append(nxt)
    return levels


def root_of(leaves):
    return build_levels(leaves)[-1][0]


def proof_for(leaves, index):
    """Return the sibling path for the leaf at `index`."""
    levels = build_levels(leaves)
    proof = []
    for level in levels[:-1]:
        sib = index ^ 1
        sibling = level[sib] if sib < len(level) else level[index]
        proof.append({"hash": sibling, "position": "right" if index % 2 == 0 else "left"})
        index //= 2
    return proof


def verify_proof(leaf, proof, root):
    cur = leaf
    for step in proof:
        cur = _pair(cur, step["hash"]) if step["position"] == "right" else _pair(step["hash"], cur)
    return cur == root
