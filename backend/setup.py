import json

import optimize
import pandas as pd
from logger import add_log


SUPPORTED_REQUIREMENT_KEYS = frozenset(
    {
        "ALL_PLAYERS_CHEMISTRY_POINTS",
        "CHEMISTRY_POINTS",
        "CLUB_COUNT",
        "CLUB_ID",
        "LEAGUE_COUNT",
        "LEAGUE_ID",
        "NATION_COUNT",
        "NATION_ID",
        "PLAYER_EXACT_OVR",
        "PLAYER_LEVEL",
        "PLAYER_MAX_OVR",
        "PLAYER_MIN_OVR",
        "PLAYER_QUALITY",
        "PLAYER_RARITY",
        "PLAYER_RARITY_GROUP",
        "SAME_CLUB_COUNT",
        "SAME_LEAGUE_COUNT",
        "SAME_NATION_COUNT",
        "TEAM_RATING",
    }
)


class UnsupportedRequirementError(ValueError):
    pass


RARITY_GROUP_FALLBACK_LABELS = {
    83: "TOTW/TOTS/FOF",
}

MINIMUM_MEMBERSHIP_REQUIREMENT_KEYS = frozenset(
    {
        "CLUB_ID",
        "LEAGUE_ID",
        "NATION_ID",
        "PLAYER_EXACT_OVR",
        "PLAYER_QUALITY",
        "PLAYER_RARITY",
        "PLAYER_RARITY_GROUP",
    }
)


def validate_sbc_requirements(sbc):
    constraints = sbc.get("constraints") if isinstance(sbc, dict) else None
    if not isinstance(constraints, list):
        raise ValueError("sbcData.constraints must be an array")

    for index, requirement in enumerate(constraints):
        if not isinstance(requirement, dict):
            raise ValueError(f"sbcData.constraints[{index}] must be an object")
        requirement_key = requirement.get("requirementKey")
        if requirement_key not in SUPPORTED_REQUIREMENT_KEYS:
            raise UnsupportedRequirementError(
                f"Unsupported requirementKey at constraints[{index}]: "
                f"{requirement_key!r}"
            )


def _requirement_condition(df, requirement):
    key = requirement["requirementKey"]
    values = requirement.get("eligibilityValues", [])
    scope = requirement.get("scope")

    if key == "PLAYER_RARITY_GROUP":
        return df["groups"].apply(
            lambda groups: any(
                item in values
                for item in (groups if isinstance(groups, list) else [groups])
            )
        )
    if key == "PLAYER_QUALITY":
        if scope in ["GREATER", "EXACT"]:
            return df["ratingTier"] >= values[0]
        if scope == "LOWER":
            return df["ratingTier"] <= values[0]
    if key == "CLUB_ID":
        return df["teamId"].isin(values)
    if key == "LEAGUE_ID":
        return df["leagueId"].isin(values)
    if key == "NATION_ID":
        return df["nationId"].isin(values)
    if key == "PLAYER_RARITY":
        return df["rarityId"].isin(values)
    if key == "PLAYER_EXACT_OVR":
        return df["rating"].isin(values)
    return pd.Series(True, index=df.index)


def find_unmet_minimum_requirements(df, sbc):
    failures = []
    for requirement in sbc["constraints"]:
        minimum = int(requirement.get("count", 0))
        # EA uses -1 for rules that apply to the whole squad, such as team rating.
        if (
            minimum <= 0
            or requirement["requirementKey"]
            not in MINIMUM_MEMBERSHIP_REQUIREMENT_KEYS
        ):
            continue

        condition = _requirement_condition(df, requirement)
        matches = df.loc[condition]
        found = int(matches["id"].nunique()) if "id" in matches else len(matches)
        if found >= minimum:
            continue

        failure = {
            "requirementKey": requirement["requirementKey"],
            "required": minimum,
            "found": found,
            "eligibilityValues": requirement.get("eligibilityValues", []),
        }
        failures.append(failure)
        add_log(
            f"Failed requirement: {failure['requirementKey']} requires at least "
            f"{minimum} players, found {found}."
        )
    return failures


def _rarity_group_diagnostic(sbc, eligibility_values):
    diagnostics = sbc.get("filterDiagnostics", {}).get("rarityGroups", [])
    wanted = {str(value) for value in eligibility_values}
    return next(
        (
            item
            for item in diagnostics
            if str(item.get("groupId")) in wanted
        ),
        {},
    )


def build_missing_requirement_failure(sbc, failures):
    first = failures[0]
    if first["requirementKey"] == "PLAYER_RARITY_GROUP":
        diagnostic = _rarity_group_diagnostic(sbc, first["eligibilityValues"])
        fallback_id = next(iter(first["eligibilityValues"]), None)
        label = diagnostic.get("label") or RARITY_GROUP_FALLBACK_LABELS.get(
            fallback_id, f"grupo especial {fallback_id}"
        )
        raw_matches = int(diagnostic.get("rawMatches", first["found"]) or 0)
        eligible_matches = int(
            diagnostic.get("eligibleMatches", first["found"]) or 0
        )
        missing = max(1, first["required"] - first["found"])
        if raw_matches == 0:
            message = (
                f"Falta {missing} carta elegível para {label}: nenhuma carta desse "
                "tipo foi encontrada no clube."
            )
        elif eligible_matches == 0:
            message = (
                f"Falta {missing} carta elegível para {label}. Você possui "
                f"{raw_matches}, mas todas foram removidas por filtros, proteção, "
                "limite de preço ou por serem negociáveis."
            )
        else:
            message = (
                f"Falta {missing} carta elegível para {label}: necessárias "
                f"{first['required']}, encontradas {first['found']}."
            )
    else:
        message = (
            f"Não há cartas suficientes para {first['requirementKey']}: "
            f"necessárias {first['required']}, encontradas {first['found']}."
        )

    return {
        "code": "MISSING_REQUIRED_PLAYERS",
        "message": message,
        "requirements": failures,
    }


def build_solver_failure(status, status_code):
    if status_code == 3 or status == "INFEASIBLE":
        message = (
            "Não foi possível montar um elenco que cumpra todas as exigências com "
            "as cartas permitidas. Revise média, química, cartas protegidas, "
            "negociáveis e filtros do Auto SBC."
        )
        code = "NO_VALID_SQUAD"
    elif status_code == 0 or status == "UNKNOWN":
        message = (
            "O tempo de busca terminou antes de encontrar uma solução. Aumente o "
            "tempo máximo ou libere mais cartas nos filtros do Auto SBC."
        )
        code = "SOLVER_TIMEOUT"
    else:
        message = f"O montador não concluiu o desafio ({status or 'erro desconhecido'})."
        code = "SOLVER_FAILED"
    return {"code": code, "message": message}

# Preprocess the club dataset obtained from api.


def preprocess_data(df: pd.DataFrame, sbc, export_debug_csv=False):
    validate_sbc_requirements(sbc)
    if export_debug_csv:
        df.to_csv("allPlayers.csv")
    groupings = []
    # Remove concept players with missing futggPrice
    df = df[~(df["concept"] & df["futggPrice"].isna())]
    df["price"] = df["price"].fillna(
        15000000
    )  # set price to 15m if missing so it will only use the player if really necessary
    expPP = False

    expPR = False
    rarityGroups = []
    for req in sbc["constraints"]:
        if req["count"] == 11 - len(sbc["brickIndices"]):
            # Filter the players to only include those that meet this requirement
            # since we need all players to satisfy this constraint
            add_log(
                f"Filtering players for '{req['requirementKey']}' requirement. Current player count: {len(df)}"
            )
            if req["requirementKey"] == "PLAYER_RARITY_GROUP":
                # Filter players where any element in the groups array matches any eligibility value
                df = df[
                    df["groups"].apply(
                        lambda x: any(g in req["eligibilityValues"] for g in x)
                    )
                ]
            elif req["requirementKey"] == "PLAYER_QUALITY":
                if req["scope"] == "GREATER" or req["scope"] == "EXACT":
                    df = df[df["ratingTier"] >= req["eligibilityValues"][0]]
                if req["scope"] == "LOWER" or req["scope"] == "EXACT":
                    df = df[df["ratingTier"] <= req["eligibilityValues"][0]]
            elif req["requirementKey"] == "CLUB_ID":
                df = df[df["teamId"].isin(req["eligibilityValues"])]
            elif req["requirementKey"] == "LEAGUE_ID":
                df = df[df["leagueId"].isin(req["eligibilityValues"])]
            elif req["requirementKey"] == "NATION_ID":
                df = df[df["nationId"].isin(req["eligibilityValues"])]
            elif req["requirementKey"] == "PLAYER_RARITY":
                df = df[df["rarityId"].isin(req["eligibilityValues"])]
            elif req["requirementKey"] == "PLAYER_EXACT_OVR":
                df = df[df["rating"].isin(req["eligibilityValues"])]

        if (
            req["requirementKey"] == "CHEMISTRY_POINTS"
            or req["requirementKey"] == "ALL_PLAYERS_CHEMISTRY_POINTS"
        ):
            # Add league, nation, and team to groupings
            groupings.extend(["leagueId", "nationId", "teamId"])
            expPP = True
        if req["requirementKey"] == "PLAYER_RARITY_GROUP":
            groupings.extend(["groups"])
            expPR = True
            rarityGroups = rarityGroups + req["eligibilityValues"]
        if req["requirementKey"] == "SAME_LEAGUE_COUNT":
            groupings.extend(["leagueId"])
        if req["requirementKey"] == "SAME_NATION_COUNT":
            groupings.extend(["nationId"])
        if req["requirementKey"] == "SAME_CLUB_COUNT":
            groupings.extend(["teamId"])
        if req["requirementKey"] == "NATION_COUNT":
            groupings.extend(["nationId"])
        if req["requirementKey"] == "LEAGUE_COUNT":
            groupings.extend(["leagueId"])
        if req["requirementKey"] == "CLUB_COUNT":
            groupings.extend(["teamId"])
        if req["requirementKey"] == "CLUB_ID":
            groupings.extend(["teamId"])
        if req["requirementKey"] == "LEAGUE_ID":
            groupings.extend(["leagueId"])
        if req["requirementKey"] == "NATION_ID":
            groupings.extend(["nationId"])
        if req["requirementKey"] == "PLAYER_RARITY":
            groupings.extend(["rarityId"])
        if (
            req["requirementKey"] == "PLAYER_MIN_OVR"
            or req["requirementKey"] == "PLAYER_MAX_OVR"
            or req["requirementKey"] == "TEAM_RATING"
        ):
            groupings.extend(["rating"])
        if req["requirementKey"] == "PLAYER_LEVEL":
            groupings.extend(["ratingTier"])
            # Creating separate entries of a particular player for each alternate position.
    if expPP:
        df = df.assign(
            possiblePositions=[
                [x for x in l if x in sbc["formation"]] for l in df["possiblePositions"]
            ]
        )
        df["possiblePositions"] = df["possiblePositions"].apply(
            lambda y: [99] if len(y) == 0 else y
        )

        df = df.explode("possiblePositions")
    else:
        df = df.assign(possiblePositions=0)
    if expPR:
        df["original_groups"] = df["groups"]
        df = df.assign(
            groups=[[x for x in l if x in rarityGroups] for l in df["groups"]]
        )

        df["groups"] = df["groups"].apply(lambda y: [99] if len(y) == 0 else y)
        df = df.explode("groups")
    else:
        df = df.assign(groups=0)
    # Select the cheapest players based on groupings
    groupings = list(set(groupings))  # Remove duplicates
    # Log the detected groupings

    add_log(
        f"Detected groupings for player filtering: {', '.join(groupings) if groupings else 'none'}"
    )
    # If groupings are defined, filter to keep the lowest priced players in each group
    if groupings:
        # Create a composite grouping key for each unique combination of grouping values
        if len(groupings) > 0:
            # Keep only the top 11 cheapest players for each unique grouping combination
            # First, sort by price
            df = df.sort_values("price")

            # Create a grouping key based on the identified groupings
            if len(groupings) == 1:
                group_key = df[groupings[0]].astype(str)
            else:
                group_key = df[groupings].apply(
                    lambda x: "_".join(x.astype(str)), axis=1
                )

            # Keep only the top 11 cheapest players for each group
            df = df.groupby(group_key).head(11).reset_index(drop=True)

            print(
                f"Filtered to {len(df)} players after keeping top 11 cheapest per group"
            )
    if export_debug_csv:
        df.to_csv("filteredPlayers.csv")
    df["Original_Idx"] = df.index
    df = df.reset_index(drop=True)

    return df


def runAutoSBC(sbc, players, maxSolveTime, export_debug_csv=False):
    validate_sbc_requirements(sbc)
    add_log("Starting SBC solver process")
    # Log SBC configuration with dynamic key-value pairs
    add_log("Starting SBC configuration processing:")
    for key, value in sbc.items():
        if isinstance(value, (list, dict)):
            if isinstance(value, dict):
                add_log(f"  {key}: Dictionary with {len(value)} items")
                for k, v in value.items():
                    add_log(f"    - {k}: {v}")
            else:  # list
                add_log(f"  {key}: List with {len(value)} items")
                if len(value) <= 5:  # Limit output for large lists
                    for item in value:
                        add_log(f"    - {item}")
                else:
                    add_log(f"    - First 5 items: {value[:5]}")
        else:
            add_log(f"  {key}: {value}")
    print(f"Processing SBC: {sbc['name'] if 'name' in sbc else 'Unknown SBC'}")
    df = pd.json_normalize(players)
    # Remove All Players not matching quality first
    df = df[df["price"] > 0]
    for req in sbc["constraints"]:
        if req["requirementKey"] == "1TEAM_RATING" and len(sbc["brickIndices"]) > 0:
            sbc["constraints"].append(
                {
                    "scope": "EXACT",
                    "count": len(sbc["brickIndices"]),
                    "requirementKey": "CLUB_ID",
                    "eligibilityValues": [999],
                }
            )
            #   df = df.assign(newgroups=[[x for x in l if x in req['eligibilityValues']] for l in df['groups']])
            #   df['groups'] = df['newgroups'].apply(lambda y: [99] if y!=req['eligibilityValues'] else y)
            #   df = df[df["groups"][0] != [-1]]
        if req["requirementKey"] == "PLAYER_QUALITY":
            if req["scope"] == "GREATER" or req["scope"] == "EXACT":
                df = df[df["ratingTier"] >= req["eligibilityValues"][0]]
            if req["scope"] == "LOWER" or req["scope"] == "EXACT":
                df = df[df["ratingTier"] <= req["eligibilityValues"][0]]

    brick_rows = len(sbc["brickIndices"])
    for i in range(brick_rows):
        # Create brick DataFrame with brick rows
        brick_data = {
            "id": i,
            "name": "BRICK{}".format(i),
            "cardType": "BRICK",
            "assetId": i,
            "definitionId": i,
            "rating": 55,
            "teamId": 999,
            "leagueId": 999,
            "nationId": 999,
            "rarityId": 999,
            "ratingTier": 999,
            "isUntradeable": "",
            "isDuplicate": "",
            "preferredPosition": "0",
            "possiblePositions": [0],
            "groups": 999,
            "isFixed": "",
            "concept": "",
            "price": 15000000,
            "futBinPrice": "",
        }

        brick_df = pd.DataFrame([brick_data])

        # Concatenate the original DataFrame with the brick DataFrame
        # df = pd.concat([df, brick_df], ignore_index=True)
    df = preprocess_data(df, sbc, export_debug_csv=export_debug_csv)
    add_log(f"Processing {len(players)} players for SBC")
    failures = find_unmet_minimum_requirements(df, sbc)
    if failures:
        add_log("One or more minimum requirements were not met.")
        failure = build_missing_requirement_failure(sbc, failures)
        add_log(failure["message"])
        return {
            "results": [],
            "status": "INFEASIBLE",
            "status_code": 3,
            "failure": failure,
        }
    final_players, status, status_code = optimize.SBC(df, sbc, maxSolveTime)
    results = []
    # if status != 2 and status != 4:
    #      return "{'status': {}, 'status_code': {}}".format(status, status_code)
    if final_players:
        df_out = df.iloc[final_players].copy()
        df_out.insert(5, "Is_Pos", df_out.pop("Is_Pos"))
        df_out.insert(6, "Chemistry", df_out.pop("Chemistry"))
        print(f"Total Chemistry: {df_out['Chemistry'].sum()}")
        squad_rating = calc_squad_rating(df_out["rating"].tolist())
        print(f"Squad Rating: {squad_rating}")
        print(f"Total Cost: {df_out['price'].sum()}")
        df_out["Org_Row_ID"] = df_out["Original_Idx"] + 2
        df_out.pop("Original_Idx")
        if export_debug_csv:
            df_out.to_csv("final_players.csv")
        print(sbc, status, status_code)
        results = json.loads(df_out.to_json(orient="records"))
        # add_log(f"Results: {results}")
        add_log(status)
        return {"results": results, "status": status, "status_code": status_code}
    add_log(status)
    response = {"results": [], "status": status, "status_code": status_code}
    if status_code not in [2, 4]:
        response["failure"] = build_solver_failure(status, status_code)
        add_log(response["failure"]["message"])
    return response


def calc_squad_rating(ratings):
    total_rating = sum(ratings)
    squad_size = len(ratings)
    excess = sum(
        rating - total_rating / 11 for rating in ratings if rating > total_rating / 11
    )
    adjusted_rating = total_rating + excess
    squad_rating = round(adjusted_rating)
    print(
        "total_rating:",
        total_rating,
        "average rating:",
        total_rating / 11,
        "squad_size:",
        squad_size,
        "adjusted_rating:",
        adjusted_rating,
        "excess:",
        excess,
        "squad_rating:",
        squad_rating,
    )
    return min(max(round(squad_rating / 11, 2), 0), 99)
