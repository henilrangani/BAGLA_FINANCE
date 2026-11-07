"""Request IDs and safe error logging (no bodies, tokens or financial data in logs)."""
import logging

from app.main import app


async def test_every_response_has_a_request_id(client):
    r = await client.get("/health")
    assert len(r.headers["X-Request-ID"]) == 32
    r = await client.get("/health", headers={"X-Request-ID": "lb-trace-12345678"})
    assert r.headers["X-Request-ID"] == "lb-trace-12345678"
    r = await client.get("/health", headers={"X-Request-ID": "bad id <script>"})
    assert r.headers["X-Request-ID"] != "bad id <script>" and len(r.headers["X-Request-ID"]) == 32


async def test_unhandled_error_is_generic_and_logged_without_the_body(client, caplog):
    async def boom(request_body: dict):
        raise RuntimeError("secret detail that must not leak")

    app.add_api_route("/__test_boom", boom, methods=["POST"])
    try:
        with caplog.at_level(logging.ERROR, logger="bagla.http"):
            r = await client.post("/__test_boom", json={"password": "hunter2-hunter2", "amount_paise": 123456})
        assert r.status_code == 500
        body = r.json()
        assert body["detail"] == "Internal error. Please try again." and body["request_id"] == r.headers["X-Request-ID"]
        assert "secret detail" not in r.text
        logged = " ".join(rec.getMessage() for rec in caplog.records)
        assert r.headers["X-Request-ID"] in logged and "RuntimeError" in logged and "/__test_boom" in logged
        assert "hunter2" not in logged and "123456" not in logged and "secret detail" not in logged
    finally:
        app.router.routes = [rt for rt in app.router.routes if getattr(rt, "path", "") != "/__test_boom"]
