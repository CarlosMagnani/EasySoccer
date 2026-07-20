import os
import sys
import tempfile
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import setup  # noqa: E402


class RealSolverSmokeTest(unittest.TestCase):
    def test_selects_eleven_unique_players_without_writing_inventory_csv(self):
        players = []
        for index in range(11):
            players.append(
                {
                    "id": 1000 + index,
                    "name": f"Synthetic Player {index}",
                    "cardType": "Gold Common",
                    "assetId": 2000 + index,
                    "definitionId": 3000 + index,
                    "rating": 80,
                    "teamId": 10 + index,
                    "leagueId": 20 + index,
                    "nationId": 30 + index,
                    "rarityId": 0,
                    "ratingTier": 3,
                    "isUntradeable": True,
                    "isDuplicate": False,
                    "isStorage": False,
                    "preferredPosition": 0,
                    "possiblePositions": [0],
                    "groups": [0],
                    "isFixed": False,
                    "concept": False,
                    "price": 100 + index,
                    "futggPrice": None,
                    "maxChem": 0,
                    "teamChem": [1, 2, 3],
                    "leagueChem": [1, 2, 3],
                    "nationChem": [1, 2, 3],
                    "normalizeClubId": 10 + index,
                }
            )

        sbc = {
            "constraints": [
                {
                    "scope": "GREATER",
                    "count": 11,
                    "requirementKey": "PLAYER_MIN_OVR",
                    "eligibilityValues": [75],
                }
            ],
            "formation": [0] * 11,
            "brickIndices": [],
            "currentSolution": [None] * 11,
        }

        with tempfile.TemporaryDirectory() as temp_directory:
            previous_directory = os.getcwd()
            try:
                os.chdir(temp_directory)
                response = setup.runAutoSBC(sbc, players, 5)
                csv_files = list(Path(temp_directory).glob("*.csv"))
            finally:
                os.chdir(previous_directory)

        self.assertIn(response["status_code"], (2, 4))
        self.assertEqual(len(response["results"]), 11)
        self.assertEqual(len({player["id"] for player in response["results"]}), 11)
        self.assertEqual(csv_files, [])


if __name__ == "__main__":
    unittest.main()
