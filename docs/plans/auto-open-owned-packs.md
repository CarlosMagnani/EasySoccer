# Auto Open Owned Packs — implementation plan

Status: approved design, not yet implemented

## Outcome

Add an **Auto Open** action to the Ultimate Team **My Packs** screen. The user selects one aggregated Owned Pack type and an exact quantity, authorizes the batch once, and receives a Pack Batch Summary after sequential opening without pack animations.

The feature must never purchase a pack, activate on a purchasable Store offer, list an Item for sale, or use an Allowed Listing Range as a Market Quote.

## Confirmed behavior

- Catalog only packs where `pack.isMyPack === true`.
- Aggregate equivalent Owned Packs by a stable pack-type key plus tradeability. Localized pack names are display text, not identity.
- Select one aggregated pack type and an exact quantity between `1` and the available count.
- Re-fetch My Packs and revalidate the selection immediately before starting.
- Open sequentially without pack animation. Only one pack-open request may be in flight.
- The authorization screen must explicitly state that the batch may move or Quick Sell Tradeable Duplicates under the approved rule.
- Rank the five best packed players by rating, then rarity and discard value. This does not cause additional market searches.
- For each unique Tradeable Duplicate definition, obtain a Market Quote with no more than three bounded Transfer Market searches and cache it for ten minutes.
- Calculate `Net Market Value = Market Quote × 0.95`.
- If Net Market Value is greater than Quick Sell value, move the Item to the Transfer List without offering it for sale.
- If Net Market Value is less than or equal to Quick Sell value, Quick Sell the Item.
- If a quote is missing, stale, extinct, ambiguous, or fails, keep the Item for Transfer List/review; never Quick Sell it from the Allowed Listing Range.

EA treats automated or modified Web App interaction as unauthorized. The authorization screen and documentation must show that account-enforcement risk without claiming that delays or request limits make the feature safe.

## Paletools-inspired interface

Reproduce the useful interaction pattern independently; do not copy Paletools source, CSS, assets, branding, or private endpoints.

### My Packs action

- Place one EasySoccer **Auto Open** action in the My Packs view only.
- Show the total Owned Pack count as a badge.
- Do not install or override a purchase handler.

### Aggregated pack picker

Use the compact Paletools pattern as the reference:

- one row per aggregated pack type;
- pack art or native thumbnail when available;
- localized pack name and description;
- tradeable/untradeable tag;
- available-count badge;
- selected-row highlight;
- exact-quantity stepper and numeric input;
- no **Open All Packs** shortcut.

The confirmation area shows the selected pack, requested quantity, no-animation behavior, duplicate policy, missing-price fallback, and a single explicit **Start Pack Batch** action.

### Progress and Pack Batch Summary

During the run, keep the same panel open and replace selection controls with:

- opened/requested count;
- current pack state;
- Items collected;
- Tradeable Duplicates awaiting a decision;
- **Stop after current pack**.

The final Pack Batch Summary contains:

- completed, stopped, or failed status;
- requested/opened/failed pack counts;
- total Items and players;
- the five best players;
- duplicates moved to Transfer List;
- duplicates Quick Sold and Coins received;
- untradeable duplicates moved to SBC Storage;
- unresolved Items and the reason;
- Market Quote source/time for every automatic duplicate decision.

## Module design

Keep the production userscript installable as one file for now. Add clearly delimited modules inside `tampermonkey-ai-sbc.user.js`, following the existing pattern of exposing pure cores for Node tests. Do not introduce a bundler only for this feature.

### `OwnedPackCatalog` module

Interface:

```js
buildOwnedPackGroups(packs) => OwnedPackGroup[]
resolveOwnedPackSelection(freshPacks, selection) => Resolution
```

It hides strict `isMyPack` filtering, stable grouping keys, localized display data, availability, and start-time revalidation. Purchase price is never an inclusion rule.

### `PackAggregationStore` module

Interface:

```js
const aggregation = createPackAggregationStore(request)
aggregation.apply(event) => PackBatchSummary
aggregation.snapshot() => PackBatchSummary
```

Supported internal events include pack opened, disposition decided, action completed, action failed, stop requested, and batch finished. The implementation hides:

- idempotency by pack sequence and Item ID;
- totals and per-pack accounting;
- best-five ranking;
- duplicate outcome grouping;
- quote provenance;
- warnings and unresolved actions;
- immutable summary snapshots.

The store is session-scoped and account-scoped. It must not persist inventory or Item details to disk or browser storage. Deleting this module would force aggregation, deduplication, ranking, and failure accounting into the runner and UI, so it earns the seam.

### `MarketQuoteProvider` module

Interface:

```js
quote(item, { now, signal }) => MarketQuoteResult
```

Production uses the existing EA Transfer Market search primitive with a hard budget of three searches per uncached definition. Tests use a fake adapter. The module owns cache freshness, platform identity, Allowed Listing Range validation, and request-budget accounting.

### `DuplicateDispositionPolicy` module

Interface:

```js
decideDuplicate({ item, marketQuote, quickSellValue }) => DispositionDecision
```

This is a pure calculation. It returns Transfer List, Quick Sell, or Review and never performs an account action.

### `PackBatchRunner` module

Interface:

```js
runPackBatch(confirmedRequest, dependencies) => Promise<PackBatchSummary>
```

It owns sequencing and stop rules. It delegates catalog resolution, aggregation, pricing, policy, account actions, and rendering through the modules above. It never recursively calls itself.

### `OwnedPackAutoOpenView` module

Interface:

```js
mountOwnedPackAutoOpen({ catalog, onConfirm, onStop }) => ViewHandle
```

It owns DOM lifecycle, accessibility, responsive layout, and rendering immutable snapshots. It contains no pricing or disposition policy.

## Execution sequence

1. Detect My Packs and mount the Auto Open action once.
2. Fetch packs and build strict Owned Pack groups.
3. Open the picker and collect one group plus an exact quantity.
4. Present the immutable authorization summary.
5. On confirmation, re-fetch packs and resolve the selected instances.
6. Create one `PackAggregationStore` and begin the sequential runner.
7. Before every pack, ensure Unassigned is clear and no stop was requested.
8. Open one pack without animation and immediately record its Items.
9. Move normal Items to their valid destination.
10. For Tradeable Duplicates, request one cached/bounded quote per unique definition, apply the 5% policy, then perform the authorized action.
11. Move eligible untradeable duplicates to SBC Storage. If they cannot be stored, leave them unresolved and stop before opening another pack.
12. Confirm Unassigned is clear before continuing.
13. Finish once the exact quantity is opened or a stop condition occurs, then render the Pack Batch Summary.

## Stop and failure rules

| Condition | Required behavior |
| --- | --- |
| Owned Pack count changed before start | Reject confirmation and refresh the picker |
| User requests stop | Finish the current confirmed operation; do not open the next pack |
| Pack-open response is missing or uncertain | Stop the batch; never retry automatically |
| Market Quote missing/stale/extinct/error | Transfer List/review fallback; never Quick Sell |
| Transfer List is full | Leave the Item unresolved and stop before the next pack |
| SBC Storage is full | Leave the untradeable duplicate unresolved and stop |
| Quick Sell result is uncertain | Stop the batch; do not retry the irreversible action |
| Unassigned remains non-empty | Stop and show every unresolved Item in the summary |
| Session, rate-limit, or account error | Stop immediately and preserve the observed summary |

## Chrome inspection and verification

Chrome is a required implementation tool, not an optional final check.

### Baseline inspection

1. In Chrome, enable Paletools and disable EasySoccer to avoid competing DOM overrides.
2. Open Ultimate Team Store → My Packs.
3. Capture the Paletools aggregated-pack trigger, row anatomy, count badge, spacing, selected state, scrolling, and responsive behavior.
4. Record only observable interaction and layout facts. Do not inspect cookies, storage, credentials, protected network traffic, or copy extension code/assets.
5. Capture screenshots for implementation reference.

### EasySoccer verification

1. Disable Paletools, enable the updated EasySoccer userscript, and reload the Web App.
2. Verify the action appears only in My Packs and never on purchasable Store offers.
3. Compare the independent EasySoccer picker against the reference for information density and interaction flow, not pixel-for-pixel branding.
4. Exercise selection, count limits, confirmation, cancellation, keyboard focus, scrolling, and responsive widths without opening a pack.
5. With the user present, run one low-value Owned Pack as the first account-affecting smoke test.
6. Verify progress, no animation, duplicate fallback, and Pack Batch Summary.
7. Save before/after screenshots and record any DOM-anchor instability discovered in Chrome.

Current planning-session limitation: the Chrome control bridge rejected this repository's WSL path before connecting. Live baseline inspection therefore remains a mandatory pre-implementation checkpoint; it has not been represented as completed from static package inspection.

## Automated verification

Add Node tests around the same module interfaces used by production:

- strict `isMyPack` filtering excludes every Coin/Points offer, including zero-price-looking offers;
- stable grouping distinguishes tradeable and untradeable variants;
- fresh-pack revalidation prevents opening more than selected/available;
- the aggregation store is idempotent and produces immutable snapshots;
- best-five ranking is deterministic;
- the runner opens exactly the confirmed count and never runs concurrent opens;
- stop waits for the current operation and prevents the next pack;
- three-search budget and ten-minute quote cache;
- 5% calculation and equality → Quick Sell;
- missing/stale quote → Review/Transfer List fallback;
- Transfer List means move only, never create an auction;
- uncertain open/Quick Sell result has no automatic retry;
- full Transfer List/SBC Storage and remaining Unassigned stop the batch;
- the summary includes every completed and unresolved action.

Run:

```text
node --check tampermonkey-ai-sbc.user.js
node --test tests/runner-core.test.cjs
python -m unittest discover -s tests
git diff --check
```

## Incremental delivery

1. **Pure contracts and tests** — Owned Pack grouping, aggregation store, pricing policy, quote cache, and fixtures.
2. **Read-only picker** — My Packs action and Paletools-inspired aggregated catalog; no pack opening.
3. **Confirmed sequential runner** — exact quantity, no animation, stop behavior, aggregation, no automatic duplicate disposition yet.
4. **Duplicate review mode** — show quotes and proposed decisions in the summary without performing them.
5. **Authorized disposition actions** — Transfer List move and Quick Sell behind the explicit batch authorization and fail-closed rules.
6. **Chrome smoke test and documentation** — one low-value Owned Pack with the user present, screenshots, final README/changes update.

Each slice should be independently testable and leave the previous safe behavior intact.
