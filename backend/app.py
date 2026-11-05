"""Flask API for the Blockchain-Based Identity Management system."""
import os
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from ledger import LedgerError, LocalLedger, make_ledger
from service import IdentityService, ServiceError

BASE = Path(__file__).parent
DATA_DIR = Path(os.environ.get("BCID_DATA_DIR", BASE / "data"))
DIST = BASE.parent / "frontend" / "dist"


def create_app(ledger=None, data_dir=None):
    app = Flask(__name__, static_folder=None)
    app.config["MAX_CONTENT_LENGTH"] = 128 * 1024
    CORS(app, origins=[o for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o])

    data_dir = Path(data_dir or DATA_DIR)
    ledger = ledger or make_ledger(data_dir)
    svc = IdentityService(data_dir, ledger, os.environ.get("ISSUER_NAME", "Demo University"),
                          os.environ.get("ISSUER_KEY_PASSPHRASE"))
    app.svc = svc

    @app.errorhandler(ServiceError)
    def _svc_err(e):
        return jsonify({"error": str(e)}), e.status

    @app.errorhandler(LedgerError)
    def _led_err(e):
        return jsonify({"error": str(e)}), 409

    @app.errorhandler(413)
    def _too_big(_):
        return jsonify({"error": "Request too large."}), 413

    @app.after_request
    def _headers(resp):
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Referrer-Policy"] = "no-referrer"
        return resp

    def body():
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            raise ServiceError("Expected a JSON object.")
        return data

    @app.get("/api/info")
    def info():
        return jsonify({"issuer_name": svc.issuer_name, "issuer_id": svc.issuer.fingerprint(),
                        "ledger": svc.ledger.kind, "ledger_label": svc.ledger.label})

    @app.post("/api/holders")
    def holders():
        d = body()
        return jsonify({"holder_id": svc.register_holder(d.get("public_key") or {}, d.get("label", ""))}), 201

    @app.get("/api/holders/<holder_id>/inbox")
    def inbox(holder_id):
        return jsonify({"credentials": svc.pop_inbox(holder_id)})

    @app.post("/api/issuer/issue")
    def issue():
        d = body()
        pkg = svc.issue(d.get("holder_id", ""), d.get("attributes"))
        return jsonify({"credential_id": pkg["credential_id"], "root": pkg["root"], "anchor": pkg["anchor"]}), 201

    @app.get("/api/issuer/credentials")
    def credentials():
        return jsonify({"credentials": svc.list_credentials()})

    @app.post("/api/issuer/revoke")
    def revoke():
        return jsonify(svc.revoke(body().get("credential_id", "")))

    @app.post("/api/verifier/challenge")
    def challenge():
        return jsonify(svc.new_challenge())

    @app.post("/api/verifier/verify")
    def verify():
        return jsonify(svc.verify(body()))

    @app.get("/api/ledger")
    def ledger_view():
        return jsonify(svc.ledger.describe())

    @app.post("/api/demo/tamper-ledger")
    def tamper():
        return jsonify({"tampered_block": svc.ledger.tamper_demo()})

    @app.post("/api/demo/reset")
    def reset():
        if not isinstance(svc.ledger, LocalLedger):
            raise ServiceError("Reset is only available with the local ledger.", 409)
        svc.reset()
        svc.ledger.path.unlink(missing_ok=True)
        svc.ledger.__init__(svc.ledger.path)
        return jsonify({"ok": True})

    # Serve the built React app when present (single-process deployment)
    @app.get("/", defaults={"path": ""})
    @app.get("/<path:path>")
    def spa(path):
        if DIST.exists():
            if path and (DIST / path).is_file():
                return send_from_directory(DIST, path)
            return send_from_directory(DIST, "index.html")
        return jsonify({"message": "API is running. Start the frontend with 'npm run dev' in /frontend."})

    return app


if __name__ == "__main__":
    create_app().run(host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", 5000)))
