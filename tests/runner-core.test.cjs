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
  `${source.slice(start, end)}\nglobalThis.__runnerCore = AutoSbcRunnerCore;`,
  context
);
const core = context.__runnerCore;

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

test("authorizes submission only for a user-confirmed managed batch", () => {
  assert.equal(core.isSubmissionAuthorized({}), false);
  assert.equal(core.isSubmissionAuthorized({ managedBatch: true }), false);
  assert.equal(core.isSubmissionAuthorized({ userConfirmed: true }), false);
  assert.equal(
    core.isSubmissionAuthorized({ managedBatch: true, userConfirmed: true }),
    true
  );
});
