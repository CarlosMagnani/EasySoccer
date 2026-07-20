import asyncio
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import main  # noqa: E402
import pandas as pd  # noqa: E402
import setup  # noqa: E402


async def asgi_request(method, path, *, json_body=None, headers=None):
    body = b"" if json_body is None else json.dumps(json_body).encode("utf-8")
    request_headers = [(b"host", b"testserver")]
    if json_body is not None:
        request_headers.append((b"content-type", b"application/json"))
    for name, value in (headers or {}).items():
        request_headers.append((name.lower().encode("ascii"), value.encode("ascii")))

    messages = []
    request_sent = False

    async def receive():
        nonlocal request_sent
        if request_sent:
            return {"type": "http.disconnect"}
        request_sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message):
        messages.append(message)

    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("ascii"),
        "query_string": b"",
        "root_path": "",
        "headers": request_headers,
        "client": ("127.0.0.1", 12345),
        "server": ("127.0.0.1", 8000),
    }
    await main.app(scope, receive, send)

    start = next(message for message in messages if message["type"] == "http.response.start")
    response_body = b"".join(
        message.get("body", b"")
        for message in messages
        if message["type"] == "http.response.body"
    )
    response_headers = {
        key.decode("latin-1"): value.decode("latin-1")
        for key, value in start["headers"]
    }
    payload = json.loads(response_body) if response_body else None
    return start["status"], response_headers, payload


class BackendApiTests(unittest.TestCase):
    @staticmethod
    def solve_payload(*, max_solve_time=30, requirement_key="TEAM_RATING"):
        return {
            "clubPlayers": [{"id": 1}],
            "sbcData": {
                "constraints": [
                    {
                        "scope": "GREATER",
                        "count": 11,
                        "requirementKey": requirement_key,
                        "eligibilityValues": [80],
                    }
                ],
                "formation": [0] * 11,
                "brickIndices": [],
            },
            "maxSolveTime": max_solve_time,
        }

    def test_health_reports_local_service_ready(self):
        status, _, payload = asyncio.run(asgi_request("GET", "/health"))

        self.assertEqual(status, 200)
        self.assertEqual(payload, {"status": "ok", "service": "auto-sbc-local"})

    def test_cors_allows_only_ea_origins_without_credentials(self):
        for origin in ("https://www.ea.com", "https://ea.com"):
            status, headers, _ = asyncio.run(
                asgi_request("GET", "/health", headers={"origin": origin})
            )
            self.assertEqual(status, 200)
            self.assertEqual(headers.get("access-control-allow-origin"), origin)
            self.assertNotIn("access-control-allow-credentials", headers)

        _, headers, _ = asyncio.run(
            asgi_request(
                "GET", "/health", headers={"origin": "https://attacker.example"}
            )
        )
        self.assertNotIn("access-control-allow-origin", headers)

    def test_server_binds_only_to_loopback(self):
        with (
            patch.object(main.uvicorn, "Config") as config,
            patch.object(main.uvicorn, "Server") as server,
            patch.object(main.signal, "signal"),
        ):
            main.start()

        self.assertEqual(config.call_args.kwargs["host"], "127.0.0.1")
        server.return_value.run.assert_called_once_with()

    def test_invalid_solve_payload_is_rejected_before_solver(self):
        cases = (
            (self.solve_payload(max_solve_time=0), "maxSolveTime"),
            (self.solve_payload(max_solve_time=181), "maxSolveTime"),
            (self.solve_payload(requirement_key="UNKNOWN_RULE"), "UNKNOWN_RULE"),
            ({"sbcData": {}, "maxSolveTime": 30}, "clubPlayers"),
        )

        with patch.object(main.setup, "runAutoSBC") as solver:
            for payload, expected_error in cases:
                with self.subTest(expected_error=expected_error):
                    status, _, response = asyncio.run(
                        asgi_request("POST", "/solve", json_body=payload)
                    )
                    self.assertEqual(status, 422)
                    self.assertIn(expected_error, json.dumps(response))

        solver.assert_not_called()

    def test_arbitrary_http_relay_is_disabled(self):
        status, _, response = asyncio.run(
            asgi_request(
                "POST",
                "/relay",
                json_body={"url": "http://127.0.0.1/private", "method": "GET"},
            )
        )

        self.assertEqual(status, 410)
        self.assertIn("disabled", response["detail"].lower())

    def test_solver_input_errors_have_a_clear_fastapi_response(self):
        with patch.object(
            main.setup, "runAutoSBC", side_effect=KeyError("rating")
        ):
            status, _, response = asyncio.run(
                asgi_request(
                    "POST", "/solve", json_body=self.solve_payload()
                )
            )

        self.assertEqual(status, 422)
        self.assertIn("invalid solver payload", response["detail"].lower())
        self.assertIn("rating", response["detail"])


class SolverPreprocessingTests(unittest.TestCase):
    def test_inventory_csv_export_is_opt_in_and_expensive_cards_are_retained(self):
        players = pd.DataFrame(
            [
                {"id": 1, "concept": False, "futggPrice": 500, "price": 500},
                {
                    "id": 2,
                    "concept": False,
                    "futggPrice": 75000,
                    "price": 75000,
                },
            ]
        )
        sbc = {"constraints": [], "formation": [], "brickIndices": []}

        with patch.object(pd.DataFrame, "to_csv") as to_csv:
            result = setup.preprocess_data(players.copy(), sbc)

        self.assertEqual(set(result["id"]), {1, 2})
        to_csv.assert_not_called()

        with patch.object(pd.DataFrame, "to_csv") as to_csv:
            setup.preprocess_data(players.copy(), sbc, export_debug_csv=True)

        self.assertEqual(to_csv.call_count, 2)

    def test_solver_results_are_a_json_array(self):
        players = [
            {
                "id": 7,
                "concept": False,
                "futggPrice": 1200,
                "price": 1200,
                "rating": 80,
            }
        ]
        sbc = {
            "constraints": [
                {
                    "scope": "GREATER",
                    "count": 11,
                    "requirementKey": "TEAM_RATING",
                    "eligibilityValues": [80],
                }
            ],
            "formation": [0] * 11,
            "brickIndices": [],
        }

        def solved(df, *_args):
            df["Chemistry"] = 0
            df["Is_Pos"] = 0
            return [0], "OPTIMAL", 4

        with patch.object(setup.optimize, "SBC", side_effect=solved):
            response = setup.runAutoSBC(sbc, players, 30)

        self.assertIsInstance(response, dict)
        self.assertIsInstance(response["results"], list)
        self.assertEqual(response["results"][0]["id"], 7)


if __name__ == "__main__":
    unittest.main()
