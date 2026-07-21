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

test("matches locale-prefixed EA Web App URLs", () => {
  const metadataEnd = source.indexOf("// ==/UserScript==");
  assert.notEqual(metadataEnd, -1, "userscript metadata end marker must exist");

  const metadata = source.slice(0, metadataEnd);
  assert.match(
    metadata,
    /^\/\/ @match\s+https:\/\/www\.ea\.com\/\*\/ea-sports-fc\/ultimate-team\/web-app\/\*$/m
  );
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
