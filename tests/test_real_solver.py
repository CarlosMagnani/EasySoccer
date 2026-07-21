import os
import sys
import tempfile
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import setup  # noqa: E402


class RealSolverSmokeTest(unittest.TestCase):
    @staticmethod
    def make_players(*, rating=80, special_index=None):
        players = []
        for index in range(11):
            players.append(
                {
                    "id": 1000 + index,
                    "name": f"Synthetic Player {index}",
                    "cardType": "Gold Common",
                    "assetId": 2000 + index,
                    "definitionId": 3000 + index,
                    "rating": rating,
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
                    "groups": [23] if index == special_index else [0],
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
        return players

    def test_selects_eleven_unique_players_without_writing_inventory_csv(self):
        players = self.make_players()

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

    def test_solves_the_10x_84_upgrade_requirement_shape(self):
        players = self.make_players(rating=83, special_index=0)
        sbc = {
            "constraints": [
                {
                    "scope": "GREATER",
                    "count": 1,
                    "requirementKey": "PLAYER_RARITY_GROUP",
                    "eligibilityValues": [23],
                },
                {
                    "scope": "GREATER",
                    "count": 11,
                    "requirementKey": "TEAM_RATING",
                    "eligibilityValues": [83],
                },
            ],
            "formation": [0] * 11,
            "brickIndices": [],
            "currentSolution": [None] * 11,
        }

        response = setup.runAutoSBC(sbc, players, 5)

        self.assertIn(response["status_code"], (2, 4))
        self.assertEqual(len(response["results"]), 11)
        selected_specials = [
            player
            for player in response["results"]
            if player.get("groups") == 23 or 23 in player.get("original_groups", [])
        ]
        self.assertGreaterEqual(len(selected_specials), 1)


if __name__ == "__main__":
    unittest.main()
