const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const userscriptPath = path.join(
  __dirname,
  "..",
  "tampermonkey-ai-sbc.user.js"
);
const source = fs.readFileSync(userscriptPath, "utf8");

const protectionStart = source.indexOf(
  "const EASY_SOCCER_PROTECTED_ITEMS_STORAGE_PREFIX"
);
const protectionEnd = source.indexOf(
  "\nlet cachedLockedItems = null;",
  protectionStart
);
assert.notEqual(protectionStart, -1, "protected items core marker must exist");
assert.notEqual(protectionEnd, -1, "protected items core end marker must exist");

const protectionContext = {};
vm.createContext(protectionContext);
vm.runInContext(
  `${source.slice(
    protectionStart,
    protectionEnd
  )}\nglobalThis.__protectedItemsCore = EasySoccerProtectedItemsCore;`,
  protectionContext
);
const protectedItemsCore = protectionContext.__protectedItemsCore;

const protectedFeatureEnd = source.indexOf(
  "\nlet FIXED_ITEMS_KEY",
  protectionStart
);
assert.notEqual(
  protectedFeatureEnd,
  -1,
  "protected items feature end marker must exist"
);
const protectedStorage = new Map();
const protectedFeatureContext = {
  localStorage: {
    getItem(key) {
      return protectedStorage.has(key) ? protectedStorage.get(key) : null;
    },
    setItem(key, value) {
      protectedStorage.set(key, String(value));
    },
  },
  services: {
    User: {
      getUser() {
        return {
          getSelectedPersona() {
            return { id: "test-account" };
          },
        };
      },
    },
  },
};
vm.createContext(protectedFeatureContext);
vm.runInContext(
  `${source.slice(protectionStart, protectedFeatureEnd)}
globalThis.__protectedFeature = {
  lockItem,
  unlockItem,
  getLockedItems,
  ensureChallengeHasNoProtectedItems,
  getEasySoccerLayoutPreferences,
  saveEasySoccerLayoutPreferences,
  EasySoccerClubUiCore
};`,
  protectedFeatureContext
);
const protectedFeature = protectedFeatureContext.__protectedFeature;

test("matches locale-prefixed EA Web App URLs", () => {
  const metadataEnd = source.indexOf("// ==/UserScript==");
  assert.notEqual(metadataEnd, -1, "userscript metadata end marker must exist");

  const metadata = source.slice(0, metadataEnd);
  assert.match(
    metadata,
    /^\/\/ @match\s+https:\/\/www\.ea\.com\/\*\/ea-sports-fc\/ultimate-team\/web-app\/\*$/m
  );
});

test("brands EasySoccer-owned controls and Tampermonkey entry", () => {
  const metadataEnd = source.indexOf("// ==/UserScript==");
  const metadata = source.slice(0, metadataEnd);

  assert.match(metadata, /^\/\/ @name\s+EasySoccer - EAFC 26 Auto SBC$/m);
  const metadataIcon = metadata.match(
    /^\/\/ @icon\s+data:image\/png;base64,([A-Za-z0-9+/=]+)$/m
  );
  const embeddedIcon = source.match(
    /const EASY_SOCCER_LOGO_DATA_URL = "data:image\/png;base64,([A-Za-z0-9+/=]+)";/
  );
  assert.ok(metadataIcon, "Tampermonkey icon must be embedded");
  assert.ok(embeddedIcon, "UI icon must be embedded");
  assert.equal(metadataIcon[1], embeddedIcon[1]);
  assert.equal(
    Buffer.from(metadataIcon[1], "base64").subarray(1, 4).toString("ascii"),
    "PNG"
  );
  assert.match(source, /createEasySoccerLayoutBrand\(\)/);
  assert.match(source, /createEasySoccerLogoImage\("esq-header-logo"/);
  assert.match(source, /src="\$\{EASY_SOCCER_LOGO_DATA_URL\}" alt="EasySoccer"/);
});

test("protects an exact club item instead of every copy of a card", () => {
  const protectedIds = protectedItemsCore.add([], {
    id: 101,
    definitionId: 9001,
  });

  assert.deepEqual(Array.from(protectedIds), [101]);
  assert.equal(protectedItemsCore.includes(protectedIds, { id: 101 }), true);
  assert.equal(
    protectedItemsCore.includes(protectedIds, {
      id: 102,
      definitionId: 9001,
    }),
    false
  );
});

test("finds protected items in SBC squad slots without duplicates", () => {
  const protectedItems = protectedItemsCore.findProtectedItems(
    [
      { _item: { id: 42, name: "Protected" } },
      { item: { id: 42, name: "Protected duplicate slot" } },
      { data: { _item: { id: 77, name: "Allowed" } } },
    ],
    [42]
  );

  assert.equal(protectedItems.length, 1);
  assert.equal(protectedItems[0].id, 42);
});

test("fails closed when a protected item reaches SBC submission", () => {
  protectedFeature.lockItem({ id: 42, definitionId: 9001 });

  let submissionError;
  try {
    protectedFeature.ensureChallengeHasNoProtectedItems({
      squad: {
        getFieldPlayers() {
          return [{ _item: { id: 42, name: "Protected" } }];
        },
      },
    });
  } catch (error) {
    submissionError = error;
  }

  assert.equal(submissionError?.code, "EASY_SOCCER_PROTECTED_ITEM");
  assert.deepEqual(Array.from(submissionError?.protectedItemIds || []), [42]);
  assert.match(submissionError?.message || "", /Envio bloqueado/);
});

test("enables persistent Grid and Wide modes by default", () => {
  assert.match(
    source,
    /const EASY_SOCCER_LAYOUT_STORAGE_KEY = "easySoccer\.layout\.v1";/
  );
  assert.match(
    source,
    /const EASY_SOCCER_LAYOUT_DEFAULTS = Object\.freeze\(\{\s*gridMode: true,\s*wideMode: true,/m
  );
  assert.match(source, /id = EASY_SOCCER_LAYOUT_CONTROLS_ID;/);

  const defaults = protectedFeature.getEasySoccerLayoutPreferences();
  assert.equal(defaults.gridMode, true);
  assert.equal(defaults.wideMode, true);
  assert.equal(defaults.cardInfo, true);

  protectedFeature.saveEasySoccerLayoutPreferences({
    gridMode: false,
    wideMode: true,
    cardInfo: false,
  });
  const stored = protectedFeature.getEasySoccerLayoutPreferences();
  assert.equal(stored.gridMode, false);
  assert.equal(stored.wideMode, true);
  assert.equal(stored.cardInfo, false);
});

test("enhances club pages and builds an exact FUT.GG player URL", () => {
  const clubUi = protectedFeature.EasySoccerClubUiCore;

  assert.equal(clubUi.normalizePageSize(20), 100);
  assert.equal(clubUi.normalizePageSize(undefined), 100);
  assert.equal(clubUi.normalizePageSize(91), 91);
  assert.equal(clubUi.normalizePageSize(20, false), 20);
  assert.equal(clubUi.getPositionLabel(25), "ST");
  assert.equal(clubUi.getPositionLabel("cam"), "CAM");
  assert.equal(
    clubUi.getFutGgUrl({
      definitionId: 84145277,
      firstName: "Nicolas",
      lastName: "Jackson",
    }),
    "https://www.fut.gg/players/259197-nicolas-jackson/26-84145277/"
  );

  let requestedPageSize = null;
  let gridEnabled = true;
  class FakeClubController {}
  FakeClubController.prototype._requestItems = function (marker) {
    requestedPageSize = this.clubViewModel.numItemsPerPage;
    return marker;
  };
  assert.equal(
    clubUi.installControllerPageSize(FakeClubController, () => gridEnabled),
    true
  );
  const controller = new FakeClubController();
  controller.clubViewModel = { numItemsPerPage: 20 };
  assert.equal(controller._requestItems("requested"), "requested");
  assert.equal(requestedPageSize, 100);
  gridEnabled = false;
  controller._requestItems("requested-again");
  assert.equal(requestedPageSize, 20);

  assert.match(source, /installEasySoccerClubSearchPageSize\(\)/);
  assert.match(source, /EasySoccer · Copiar ID da versão/);
  assert.match(source, /EasySoccer · Copiar nome/);
  assert.match(source, /EasySoccer · Abrir no FUT\.GG/);
  assert.match(source, /EasySoccer · Menor preço no mercado/);
});

const start = source.indexOf("const AUTO_SBC_REPEATABLE_MAX_COMPLETIONS");
const endMarker = "\nlet repeatableBatchState =";
const end = source.indexOf(endMarker, start);
assert.notEqual(start, -1, "runner core start marker must exist");
assert.notEqual(end, -1, "runner core end marker must exist");

const context = {};
vm.createContext(context);
vm.runInContext(
  `${source.slice(start, end)}
globalThis.__runnerCore = AutoSbcRunnerCore;
globalThis.__ownedPackModules = {
  OwnedPackCatalog,
  PackAggregationStore,
  MarketQuoteProvider,
  DuplicateDispositionPolicy,
  PackBatchRunner
};`,
  context
);
const core = context.__runnerCore;
const ownedPackModules = context.__ownedPackModules;

test("detects unlimited and bounded repeatable sets", () => {
  const unlimited = core.getRepeatabilityInfo({
    repeatabilityMode: "UNLIMITED",
  });
  assert.equal(unlimited.repeatable, true);
  assert.equal(unlimited.remaining, Infinity);

  const bounded = core.getRepeatabilityInfo({
    repeatabilityMode: "LIMITED",
    repeats: 5,
    timesCompleted: 2,
  });
  assert.equal(bounded.repeatable, true);
  assert.equal(bounded.remaining, 3);
});

test("keeps unlimited repeatables visible when EA reports zero remaining", () => {
  const info = core.getRepeatabilityInfo({
    repeatabilityMode: "UNLIMITED",
    timesCompleted: 35,
    isRepeatable() {
      return true;
    },
    getRepeatsRemaining() {
      return 0;
    },
  });

  assert.equal(info.repeatable, true);
  assert.equal(info.remaining, Infinity);

  const numericMode = core.getRepeatabilityInfo(
    {
      repeatabilityMode: 9,
      getRepeatsRemaining() {
        return 0;
      },
    },
    { UNLIMITED: 9 }
  );
  assert.equal(numericMode.repeatable, true);
  assert.equal(numericMode.remaining, Infinity);
});

test("resolves numeric EA repeatability enums", () => {
  const info = core.getRepeatabilityInfo(
    { repeatabilityMode: 7, repeats: 2, timesCompleted: 0 },
    { REFRESH: 7 }
  );
  assert.equal(info.mode, "REFRESH");
  assert.equal(info.repeatable, true);
  assert.equal(info.remaining, 2);
});

test("rejects zero, infinite and over-limit completion counts", () => {
  const repeatability = { remaining: 3 };
  assert.equal(core.validateCompletionCount(1, repeatability).ok, true);
  assert.equal(core.validateCompletionCount(3, repeatability).ok, true);
  assert.equal(core.validateCompletionCount(0, repeatability).ok, false);
  assert.equal(core.validateCompletionCount(-1, repeatability).ok, false);
  assert.equal(core.validateCompletionCount(4, repeatability).ok, false);
  assert.equal(core.validateCompletionCount(Infinity, repeatability).ok, false);
});

test("resolves exact and maximum targets for a queued pack", () => {
  const bounded = { repeatable: true, remaining: 5 };
  const unlimited = { repeatable: true, remaining: Infinity };

  assert.deepEqual(
    { ...core.resolveQueueTarget({ mode: "exact", count: 3 }, bounded) },
    { ok: true, count: 3, limit: 5, mode: "exact" }
  );
  assert.deepEqual(
    { ...core.resolveQueueTarget({ mode: "max" }, bounded) },
    { ok: true, mode: "max", count: 5, limit: 5 }
  );
  assert.equal(
    core.resolveQueueTarget({ mode: "max" }, unlimited).count,
    50
  );
});

test("validates an ordered multi-pack queue and rejects duplicate sets", () => {
  const repeatability = {
    1187: { repeatable: true, remaining: 5 },
    1302: { repeatable: true, remaining: 3 },
  };
  const entries = [
    {
      setId: 1187,
      nameSnapshot: "10x 84+ Upgrade",
      target: { mode: "max" },
    },
    {
      setId: 1302,
      nameSnapshot: "3x 85+ Upgrade",
      target: { mode: "exact", count: 2 },
    },
  ];

  const plan = core.validateQueuePlan(entries, repeatability);
  assert.equal(plan.ok, true);
  assert.deepEqual(
    Array.from(plan.entries, (entry) => entry.setId),
    ["1187", "1302"]
  );
  assert.equal(plan.maximumCompletions, 7);
  assert.equal(plan.entries[0].unlimited, false);

  const duplicate = core.validateQueuePlan(
    [...entries, { ...entries[0] }],
    repeatability
  );
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.error, /duas vezes/);
});

test("continues maximum mode only for safe exhaustion failures", () => {
  for (const code of [
    "SET_NOT_FOUND",
    "NOT_REPEATABLE",
    "NO_INCOMPLETE_CHALLENGE",
    "SBC_NOT_AVAILABLE",
    "SOLVER_FAILED",
  ]) {
    assert.equal(core.isSafeMaximumExhaustion({ error: code }), true);
  }
  assert.equal(core.isSafeMaximumExhaustion({ error: "SUBMIT_FAILED" }), false);
  assert.equal(
    core.isSafeMaximumExhaustion({ code: "SUBMIT_NOT_CONFIRMED" }),
    false
  );
});

test("keeps a special card when its rarity group is required by the SBC", () => {
  const sbcData = {
    constraints: [
      {
        requirementKey: "PLAYER_RARITY_GROUP",
        scope: "GREATER",
        count: 1,
        eligibilityValues: [83],
      },
      {
        requirementKey: "TEAM_RATING",
        scope: "GREATER",
        count: -1,
        eligibilityValues: [84],
      },
    ],
  };

  const requiredGroups = core.getRequiredRarityGroups(sbcData);
  assert.deepEqual(Array.from(requiredGroups), [83]);
  assert.equal(
    core.matchesRequiredRarityGroup({ groups: [12, "83"] }, requiredGroups),
    true
  );
  assert.equal(
    core.matchesRequiredRarityGroup({ groups: [23] }, requiredGroups),
    false
  );
});

test("uses the visual multi-pack catalog without a native confirm dialog", () => {
  const catalogStart = source.indexOf(
    "const openRepeatableQueueCatalogDialog = async () =>"
  );
  const catalogEnd = source.indexOf("\nconst createSBCButtons", catalogStart);
  assert.notEqual(catalogStart, -1);
  assert.notEqual(catalogEnd, -1);
  const catalog = source.slice(catalogStart, catalogEnd);

  assert.match(catalog, /Montar fila de Packs/);
  assert.match(catalog, /Sua fila/);
  assert.match(catalog, /Revisar fila/);
  assert.match(catalog, /Máximo/);
  assert.match(catalog, /getRepeatableModeLabel\(info\)/);
  assert.match(source, /return "ILIMITADO"/);
  assert.match(catalog, /Parar com segurança/);
  assert.doesNotMatch(catalog, /window\.confirm/);
  assert.match(source, /await openRepeatableQueueCatalogDialog\(\)/);
});

test("classifies known EA softban/rate-limit codes", () => {
  for (const code of [429, 426, 512]) {
    const failure = core.classifyFailure({ error: { code } });
    assert.equal(failure.softban, true);
    assert.equal(failure.code, code);
  }
  assert.equal(core.classifyFailure({ code: 500 }).softban, false);
});

test("preserves the backend's structured solver error and Portuguese message", () => {
  const failure = core.classifyFailure({
    error: "SOLVER_FAILED",
    status: "INFEASIBLE",
    failure: {
      code: "MISSING_REQUIRED_PLAYERS",
      message:
        "Falta 1 carta elegível para o requisito especial (encontradas: 0).",
    },
  });

  assert.equal(failure.code, "MISSING_REQUIRED_PLAYERS");
  assert.match(failure.message, /Falta 1 carta elegível/);
  assert.equal(failure.softban, false);
});

test("shows the validation detail returned by the local backend", () => {
  const message = core.getBackendErrorMessage({
    status: 422,
    response: {
      detail: [
        {
          loc: ["body", "sbcData", "constraints", 0, "count"],
          msg: "Input should be greater than or equal to -1",
        },
      ],
    },
  });

  assert.match(message, /422/);
  assert.match(message, /sbcData\.constraints\.0\.count/);
  assert.match(message, /greater than or equal to -1/);
});

test("authorizes submission only for a user-confirmed managed batch", () => {
  assert.equal(core.isSubmissionAuthorized({}), false);
  assert.equal(core.isSubmissionAuthorized({ managedBatch: true }), false);
  assert.equal(core.isSubmissionAuthorized({ userConfirmed: true }), false);
  assert.equal(
    core.isSubmissionAuthorized({ managedBatch: true, userConfirmed: true }),
    true
  );
});

test("catalogs only strict Owned Packs and separates tradeability", () => {
  const { OwnedPackCatalog } = ownedPackModules;
  const packs = [
    {
      id: 20059,
      packType: "CARDPACK",
      packName: "PACK_A",
      packDesc: "PACK_A_DESC",
      isMyPack: true,
      tradable: false,
      state: "active",
      open() {},
    },
    {
      id: 20059,
      packType: "CARDPACK",
      packName: "PACK_A",
      packDesc: "PACK_A_DESC",
      isMyPack: true,
      tradable: false,
      state: "active",
      open() {},
    },
    {
      id: 20059,
      packType: "CARDPACK",
      packName: "PACK_A",
      isMyPack: true,
      tradable: true,
      state: "active",
      open() {},
    },
    {
      id: 999,
      packType: "CARDPACK",
      packName: "COIN_OFFER",
      isMyPack: false,
      prices: { COINS: 0 },
      open() {},
    },
  ];

  const groups = OwnedPackCatalog.buildOwnedPackGroups(packs);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].available, 2);
  assert.equal(groups[0].tradeable, false);
  assert.equal(groups[1].available, 1);
  assert.equal(groups[1].tradeable, true);
  assert.equal(OwnedPackCatalog.countEligibleOwnedPacks(packs), 3);
});

test("keeps unsupported Owned Packs visible but ineligible", () => {
  const { OwnedPackCatalog } = ownedPackModules;
  const groups = OwnedPackCatalog.buildOwnedPackGroups([
    {
      id: 300,
      packType: "PLAYERPICK",
      packName: "PLAYER_PICK",
      isMyPack: true,
      isPlayerPickPack: true,
      state: "active",
      open() {},
    },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].totalCount, 1);
  assert.equal(groups[0].available, 0);
  assert.equal(groups[0].eligible, false);
  assert.match(groups[0].disabledReasons[0], /manualmente/);
});

test("rejects a Pack Batch when the Owned Pack count changes", () => {
  const { OwnedPackCatalog } = ownedPackModules;
  const pack = (suffix) => ({
    id: 42,
    packType: "CARDPACK",
    packName: "PACK_42",
    isMyPack: true,
    state: "active",
    instance: suffix,
    open() {},
  });
  const initial = [pack("a"), pack("b")];
  const group = OwnedPackCatalog.buildOwnedPackGroups(initial)[0];
  const result = OwnedPackCatalog.resolveOwnedPackSelection([pack("fresh")], {
    groupKey: group.key,
    quantity: 1,
    availableAtConfirmation: 2,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "owned-count-changed");
});

test("aggregates idempotently and ranks Top 5 by rating only", () => {
  const { PackAggregationStore } = ownedPackModules;
  const store = PackAggregationStore.createPackAggregationStore({ quantity: 2 });
  const player = (id, name, rating, extra = {}) => ({
    id,
    definitionId: 1000 + id,
    name,
    rating,
    isPlayer() {
      return true;
    },
    isTradeable() {
      return true;
    },
    ...extra,
  });
  const items = [
    player(1, "First 90", 90),
    player(2, "Second 90", 90),
    player(3, "Loan 95", 95, {
      loans: 7,
      isLimitedUse() {
        return true;
      },
    }),
    player(4, "Duplicate 91", 91, { duplicateId: 44 }),
  ];

  store.apply({ type: "batch-started" });
  store.apply({ type: "pack-opened", packSequence: 1, items });
  store.apply({ type: "pack-opened", packSequence: 1, items });
  store.apply({
    type: "disposition-completed",
    itemKey: "item:4",
    destination: "transfer-list",
  });
  const summary = store.snapshot();

  assert.equal(summary.counts.opened, 1);
  assert.equal(summary.totalItems, 4);
  assert.equal(summary.loanOrTimeLimitedPlayers, 1);
  assert.deepEqual(
    Array.from(summary.topPlayers, (item) => item.name),
    ["Duplicate 91", "First 90", "Second 90"]
  );
  assert.equal(summary.duplicates.transferList.length, 1);
  assert.equal(Object.isFrozen(summary), true);
  assert.equal(Object.isFrozen(summary.topPlayers), true);
});

test("quotes the lowest corroborated Buy Now and caches it for ten minutes", async () => {
  const { MarketQuoteProvider } = ownedPackModules;
  let searches = 0;
  const provider = MarketQuoteProvider.createMarketQuoteProvider({
    clock: () => 1000,
    async search(item) {
      searches += 1;
      return [
        { id: 1, definitionId: item.definitionId, _auction: { buyNowPrice: 1000, tradeState: "active" } },
        { id: 2, definitionId: item.definitionId, _auction: { buyNowPrice: 1100, tradeState: "active" } },
        { id: 3, definitionId: item.definitionId, _auction: { buyNowPrice: 1200, tradeState: "active" } },
      ];
    },
  });

  const first = await provider.quote(
    { definitionId: 777 },
    { platform: "PSN", now: 1000 }
  );
  const second = await provider.quote(
    { definitionId: 777 },
    { platform: "PSN", now: 2000 }
  );

  assert.equal(first.price, 1000);
  assert.equal(first.reliableForQuickSell, true);
  assert.equal(first.searchCount, 1);
  assert.equal(second.cached, true);
  assert.equal(searches, 1);
});

test("uses at most three Market searches and fails closed on weak evidence", async () => {
  const { MarketQuoteProvider } = ownedPackModules;
  let searches = 0;
  const provider = MarketQuoteProvider.createMarketQuoteProvider({
    async search(item, { searchNumber }) {
      searches += 1;
      return [
        {
          id: searchNumber,
          definitionId: item.definitionId,
          _auction: {
            buyNowPrice: searchNumber === 1 ? 1000 : searchNumber === 2 ? 1600 : 2200,
            tradeState: "active",
          },
        },
      ];
    },
  });

  const quote = await provider.quote(
    { definitionId: 888 },
    { platform: "PSN", now: 10 }
  );
  assert.equal(searches, 3);
  assert.equal(quote.searchCount, 3);
  assert.equal(quote.reliableForQuickSell, false);
  assert.match(quote.reason, /20%/);
});

test("applies the fail-closed duplicate disposition policy", () => {
  const { DuplicateDispositionPolicy } = ownedPackModules;
  const base = {
    key: "item:1",
    player: true,
    duplicate: true,
    tradeable: true,
    loanOrTimeLimited: false,
    storageEligible: false,
  };

  assert.equal(
    DuplicateDispositionPolicy.decideDuplicate({
      item: base,
      marketQuote: { status: "ok", price: 1000, reliableForQuickSell: true },
      quickSellValue: 950,
    }).destination,
    "quick-sell"
  );
  assert.equal(
    DuplicateDispositionPolicy.decideDuplicate({
      item: base,
      marketQuote: { status: "missing" },
      quickSellValue: 950,
    }).destination,
    "transfer-list"
  );
  assert.equal(
    DuplicateDispositionPolicy.decideDuplicate({
      item: { ...base, tradeable: false, storageEligible: true },
      quickSellValue: 0,
    }).destination,
    "sbc-storage"
  );
  assert.equal(
    DuplicateDispositionPolicy.decideDuplicate({
      item: { ...base, player: false },
    }).destination,
    "review"
  );
  assert.equal(
    DuplicateDispositionPolicy.decideDuplicate({
      item: { ...base, loanOrTimeLimited: true },
    }).destination,
    "review"
  );
});

test("retries dispositions only for explicit confirmed non-applied failures", async () => {
  const { PackBatchRunner } = ownedPackModules;
  let attempts = 0;
  const retried = await PackBatchRunner.performDisposition(async () => {
    attempts += 1;
    if (attempts < 3) {
      return {
        ok: false,
        explicit: true,
        applied: false,
        retryable: true,
      };
    }
    return { ok: true };
  }, { maxRetries: 2 });
  assert.equal(retried.ok, true);
  assert.equal(retried.attempts, 3);

  attempts = 0;
  const uncertain = await PackBatchRunner.performDisposition(async () => {
    attempts += 1;
    throw Object.assign(new Error("uncertain"), { uncertain: true });
  }, { maxRetries: 2 });
  assert.equal(uncertain.ok, false);
  assert.equal(uncertain.attempts, 1);
  assert.equal(attempts, 1);
});

test("runs exactly the confirmed pack count sequentially", async () => {
  const {
    OwnedPackCatalog,
    DuplicateDispositionPolicy,
    PackBatchRunner,
  } = ownedPackModules;
  const packs = [1, 2].map((instance) => ({
    id: 500,
    packType: "CARDPACK",
    packName: "PACK_500",
    isMyPack: true,
    state: "active",
    instance,
    open() {},
  }));
  const group = OwnedPackCatalog.buildOwnedPackGroups(packs)[0];
  let activeOpens = 0;
  let maxActiveOpens = 0;
  let opened = 0;
  const summary = await PackBatchRunner.runPackBatch(
    {
      authorized: true,
      groupKey: group.key,
      quantity: 2,
      availableAtConfirmation: 2,
      packName: "Pack 500",
    },
    {
      async getContext() {
        return { valid: true };
      },
      async preflight() {
        return { ok: true };
      },
      async fetchPacks() {
        return packs;
      },
      async fetchUnassigned() {
        return [];
      },
      async openPack() {
        activeOpens += 1;
        maxActiveOpens = Math.max(maxActiveOpens, activeOpens);
        opened += 1;
        await Promise.resolve();
        activeOpens -= 1;
        return {
          items: [
            {
              id: 9000 + opened,
              definitionId: 8000 + opened,
              rating: 80 + opened,
              isPlayer() {
                return true;
              },
              isTradeable() {
                return false;
              },
              isMovable() {
                return true;
              },
            },
          ],
        };
      },
      async quote() {
        throw new Error("normal Items must not be quoted");
      },
      decideDuplicate: DuplicateDispositionPolicy.decideDuplicate,
      actions: {
        async club() {
          return { ok: true };
        },
      },
      shouldStop() {
        return false;
      },
    }
  );

  assert.equal(summary.status, "completed");
  assert.equal(summary.counts.opened, 2);
  assert.equal(opened, 2);
  assert.equal(maxActiveOpens, 1);
});

test("stops after completing the current pack and never opens the next one", async () => {
  const {
    OwnedPackCatalog,
    DuplicateDispositionPolicy,
    PackBatchRunner,
  } = ownedPackModules;
  const packs = [1, 2].map((instance) => ({
    id: 501,
    packType: "CARDPACK",
    packName: "PACK_501",
    isMyPack: true,
    state: "active",
    instance,
    open() {},
  }));
  const group = OwnedPackCatalog.buildOwnedPackGroups(packs)[0];
  let stopRequested = false;
  let opened = 0;

  const summary = await PackBatchRunner.runPackBatch(
    {
      authorized: true,
      groupKey: group.key,
      quantity: 2,
      availableAtConfirmation: 2,
    },
    {
      async getContext() {
        return { valid: true };
      },
      async preflight() {
        return { ok: true };
      },
      async fetchPacks() {
        return packs;
      },
      async fetchUnassigned() {
        return [];
      },
      async openPack() {
        opened += 1;
        return {
          items: [{
            id: 9100 + opened,
            definitionId: 8100 + opened,
            rating: 82,
            isPlayer() { return true; },
            isTradeable() { return false; },
          }],
        };
      },
      async quote() {
        throw new Error("normal Items must not be quoted");
      },
      decideDuplicate: DuplicateDispositionPolicy.decideDuplicate,
      actions: {
        async club() {
          stopRequested = true;
          return { ok: true };
        },
      },
      shouldStop() {
        return stopRequested;
      },
    }
  );

  assert.equal(summary.status, "stopped");
  assert.equal(summary.counts.opened, 1);
  assert.equal(summary.items[0].finalDestination, "club");
  assert.equal(opened, 1);
});

test("never retries an uncertain pack-open response", async () => {
  const { OwnedPackCatalog, PackBatchRunner } = ownedPackModules;
  const packs = [{
    id: 502,
    packType: "CARDPACK",
    packName: "PACK_502",
    isMyPack: true,
    state: "active",
    open() {},
  }];
  const group = OwnedPackCatalog.buildOwnedPackGroups(packs)[0];
  let attempts = 0;

  const summary = await PackBatchRunner.runPackBatch(
    {
      authorized: true,
      groupKey: group.key,
      quantity: 1,
      availableAtConfirmation: 1,
    },
    {
      async getContext() { return { valid: true }; },
      async preflight() { return { ok: true }; },
      async fetchPacks() { return packs; },
      async fetchUnassigned() { return []; },
      async openPack() {
        attempts += 1;
        throw Object.assign(new Error("resultado incerto"), { uncertain: true });
      },
    }
  );

  assert.equal(summary.status, "failed");
  assert.equal(summary.counts.uncertain, 1);
  assert.equal(summary.counts.opened, 0);
  assert.equal(attempts, 1);
});

test("fails closed when a supposedly standard pack returns an interactive reward", async () => {
  const { OwnedPackCatalog, PackBatchRunner } = ownedPackModules;
  const packs = [{
    id: 504,
    packType: "CARDPACK",
    packName: "PACK_504",
    isMyPack: true,
    state: "active",
    open() {},
  }];
  const group = OwnedPackCatalog.buildOwnedPackGroups(packs)[0];
  const item = {
    id: 9300,
    definitionId: 8300,
    rating: 90,
    isPlayer() { return true; },
    isTradeable() { return false; },
  };

  const summary = await PackBatchRunner.runPackBatch(
    {
      authorized: true,
      groupKey: group.key,
      quantity: 1,
      availableAtConfirmation: 1,
    },
    {
      async getContext() { return { valid: true }; },
      async preflight() { return { ok: true }; },
      async fetchPacks() { return packs; },
      async fetchUnassigned() { return []; },
      async openPack() { return { items: [item], interactive: true }; },
    }
  );

  assert.equal(summary.status, "failed");
  assert.equal(summary.counts.opened, 1);
  assert.equal(summary.unresolvedItems.length, 1);
  assert.match(summary.unresolvedItems[0].outcomeReason, /escolha manual/);
});

test("marks a supposedly moved Item unresolved when it remains Unassigned", async () => {
  const {
    OwnedPackCatalog,
    DuplicateDispositionPolicy,
    PackBatchRunner,
  } = ownedPackModules;
  const packs = [{
    id: 503,
    packType: "CARDPACK",
    packName: "PACK_503",
    isMyPack: true,
    state: "active",
    open() {},
  }];
  const group = OwnedPackCatalog.buildOwnedPackGroups(packs)[0];
  const item = {
    id: 9200,
    definitionId: 8200,
    rating: 83,
    isPlayer() { return true; },
    isTradeable() { return false; },
  };
  let unassignedChecks = 0;

  const summary = await PackBatchRunner.runPackBatch(
    {
      authorized: true,
      groupKey: group.key,
      quantity: 1,
      availableAtConfirmation: 1,
    },
    {
      async getContext() { return { valid: true }; },
      async preflight() { return { ok: true }; },
      async fetchPacks() { return packs; },
      async fetchUnassigned() {
        unassignedChecks += 1;
        return unassignedChecks === 1 ? [] : [item];
      },
      async openPack() { return { items: [item] }; },
      async quote() { throw new Error("normal Items must not be quoted"); },
      decideDuplicate: DuplicateDispositionPolicy.decideDuplicate,
      actions: { async club() { return { ok: true }; } },
      shouldStop() { return false; },
    }
  );

  assert.equal(summary.status, "failed");
  assert.equal(summary.unresolvedItems.length, 1);
  assert.equal(summary.unresolvedItems[0].finalDestination, "unresolved");
  assert.match(summary.unresolvedItems[0].outcomeReason, /Unassigned/);
});

test("uses authoritative Unassigned state before deciding SBC Storage", async () => {
  const {
    OwnedPackCatalog,
    DuplicateDispositionPolicy,
    PackBatchRunner,
  } = ownedPackModules;
  const packs = [{
    id: 505,
    packType: "CARDPACK",
    packName: "PACK_505",
    isMyPack: true,
    state: "active",
    tradable: false,
    open() {},
  }];
  const group = OwnedPackCatalog.buildOwnedPackGroups(packs)[0];
  const provisionalItem = {
    id: 9400,
    definitionId: 8400,
    rating: 84,
    isPlayer() { return true; },
    isTradeable() { return false; },
    isStorable() { return false; },
  };
  const authoritativeDuplicate = {
    ...provisionalItem,
    duplicateId: 4400,
    isStorable() { return true; },
  };
  let unassignedChecks = 0;
  const destinations = [];

  const summary = await PackBatchRunner.runPackBatch(
    {
      authorized: true,
      groupKey: group.key,
      quantity: 1,
      availableAtConfirmation: 1,
    },
    {
      async getContext() { return { valid: true }; },
      async preflight() { return { ok: true }; },
      async fetchPacks() { return packs; },
      async fetchUnassigned() {
        unassignedChecks += 1;
        if (unassignedChecks === 1) return [];
        return [];
      },
      async refreshOpenedItems() {
        unassignedChecks += 1;
        return [authoritativeDuplicate];
      },
      async openPack() { return { items: [provisionalItem] }; },
      async quote() { throw new Error("untradeable duplicates must not be quoted"); },
      decideDuplicate: DuplicateDispositionPolicy.decideDuplicate,
      actions: {
        async club() {
          destinations.push("club");
          return { ok: true };
        },
        async "sbc-storage"(item) {
          destinations.push("sbc-storage");
          assert.equal(item, authoritativeDuplicate);
          return { ok: true };
        },
      },
      shouldStop() { return false; },
    }
  );

  assert.equal(summary.status, "completed");
  assert.deepEqual(destinations, ["sbc-storage"]);
  assert.equal(summary.duplicates.sbcStorage.length, 1);
});

test("wires Auto Open only to My Packs with direct open and move-only review fallback", () => {
  const featureStart = source.indexOf(
    "const EASY_SOCCER_AUTO_OPEN_TRIGGER_ID"
  );
  const featureEnd = source.indexOf("\nconst createSBCButtons", featureStart);
  assert.notEqual(featureStart, -1);
  assert.notEqual(featureEnd, -1);
  const feature = source.slice(featureStart, featureEnd);

  assert.match(feature, /\.ut-store-hub-view > \.ea-filter-bar-view/);
  assert.match(feature, /tabs\[0\]\.classList\.contains\("selected"\)/);
  assert.match(feature, /pack\.open\(\)/);
  assert.doesNotMatch(feature, /showPack\s*\(/);
  assert.match(feature, /services\.Item\.move\(\[item\], ItemPile\.TRANSFER\)/);
  assert.doesNotMatch(feature, /createAuction|purchasePack|buyPack|listItem/i);
  assert.match(source, /OwnedPackAutoOpenView\.mountOwnedPackAutoOpen\(\)/);
});

test("shows EasySoccer pack shortcuts and visually distinguishes duplicates", () => {
  const featureStart = source.indexOf(
    "const EASY_SOCCER_AUTO_OPEN_TRIGGER_ID"
  );
  const featureEnd = source.indexOf("\nconst createSBCButtons", featureStart);
  const feature = source.slice(featureStart, featureEnd);

  assert.match(feature, /createOwnedPackShortcutBar/);
  assert.match(feature, /event\.code === "KeyR"/);
  assert.match(feature, /event\.code === "KeyS"/);
  assert.match(feature, /event\.code === "KeyN"/);
  assert.match(feature, /event\.code === "Digit1"/);
  assert.match(feature, /esao-player-card\.is-duplicate/);
  assert.match(feature, /esao-duplicate-badge/);
  assert.match(feature, /esao-lock-badge/);
});
