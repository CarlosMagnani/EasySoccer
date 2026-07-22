# Auto Open Owned Packs — implementation plan

Status: implemented; automated verification complete; installed-browser and one-pack smoke test pending

## Outcome

Add an **Auto Open** action to the Ultimate Team **My Packs** screen. The user selects one aggregated Owned Pack type and an exact quantity, authorizes the batch once, and receives a Pack Batch Summary after sequential opening without pack animations.

The feature must never purchase a pack, activate on a purchasable Store offer, list an Item for sale, or use an Allowed Listing Range as a Market Quote.

## Confirmed behavior

- Catalog only packs where `pack.isMyPack === true`.
- Aggregate equivalent Owned Packs by a stable pack-type key plus tradeability. Localized pack names are display text, not identity.
- Select one aggregated pack type and an exact quantity between `1` and the available count.
- Keep the feature entirely inside EasySoccer. It must not depend on Paletools at runtime.
- Include only standard, deterministic Owned Packs. Exclude Player Picks, other interactive rewards, loans/time-limited rewards, and unsupported pack responses from automatic processing.
- Keep temporarily unavailable standard Owned Packs visible as disabled cards with a reason. The My Packs action badge counts only currently eligible Owned Packs and remains visible as disabled **Auto Open (0)** when none are eligible.
- Re-fetch My Packs and revalidate the selection immediately before starting.
- Refuse to start unless Unassigned is empty and the selected pack's safe duplicate destination has capacity.
- Open sequentially without pack animation. Only one pack-open request may be in flight.
- Allow only one EA account operation in flight at a time, including Market searches and Item disposition actions.
- The authorization screen must explicitly state that the batch may move or Quick Sell Tradeable Duplicates under the approved rule.
- Rank the five best non-loan players by rating only. Equal ratings preserve pack and Item response order. This does not cause additional market searches.
- For each unique Tradeable Duplicate definition, obtain a Market Quote with no more than three bounded Transfer Market searches and cache it for ten minutes.
- Market Quotes come only from exact-definition live EA Transfer Market searches; there is no Paletools, FUT.GG, FUTBIN, or other external-provider dependency.
- Use the lowest valid active Buy Now listing as the quote. A quote can authorize Quick Sell only when at least three matching active listings exist and the three lowest prices fall within 20% of one another.
- Calculate `Net Market Value = Market Quote × 0.95`.
- If Net Market Value is greater than Quick Sell value, move the Item to the Transfer List without offering it for sale.
- If Net Market Value is less than or equal to Quick Sell value, Quick Sell the Item.
- If a quote is missing, stale, extinct, ambiguous, or fails, keep the Item for Transfer List/review; never Quick Sell it from the Allowed Listing Range.
- Automatic duplicate disposition applies only to player Items. Non-player duplicates remain unresolved and stop the batch.
- Move every SBC-Storage-eligible untradeable player duplicate to SBC Storage regardless of Quick Sell value. Storage-ineligible untradeable duplicates remain unresolved and are never automatically Quick Sold.
- Send every non-duplicate Item to its normal valid Club destination without a Market Quote.
- Refresh and reconcile Unassigned immediately after each successful open. Use that authoritative Item instance for duplicate and SBC Storage eligibility instead of trusting provisional pack-response flags.
- Retry a Quick Sell, Transfer List move, or SBC Storage move at most twice only after EA explicitly confirms a retryable failure where no action was applied. Never retry a missing or uncertain response.

EA treats automated or modified Web App interaction as unauthorized. The authorization screen and documentation must show that account-enforcement risk without claiming that delays or request limits make the feature safe.

## Chrome-observed interaction reference

Chrome inspection on 2026-07-21 showed that current Paletools aggregates six identical Owned Packs into one native-style pack card with a prominent count badge. Its My Packs surface also exposes a pack-type filter, search, responsive toolbar wrapping, and horizontally scrollable Store tabs. It does not provide exact batch quantity, authorization, progress, or a Pack Batch Summary.

Reuse only those observable aggregation and information-density ideas. Implement the complete workflow independently in EasySoccer's established queue visual language; do not copy Paletools source, CSS, assets, branding, private endpoints, or runtime behavior.

### My Packs action

- Place one EasySoccer **Auto Open** action in the My Packs view only.
- Place it beside the active My Packs controls rather than in the permanent EasySoccer sidebar.
- Show the eligible Owned Pack count as a badge and keep a disabled **Auto Open (0)** action in the empty state.
- Do not install or override a purchase handler.

### Aggregated pack picker

Use the existing EasySoccer queue modal and compact cards:

- one card per aggregated pack type, preserving the first-seen EA My Packs order;
- pack art or native thumbnail when available;
- localized pack name and description;
- tradeable/untradeable tag;
- available-count badge;
- selected-row highlight;
- exact-quantity stepper and numeric input;
- no **Open All Packs** shortcut.
- name/description search and **All / Tradeable / Untradeable** filters;
- a persistent **Seu Pack Batch** summary instead of multi-pack queue controls;
- selecting a different card replaces the draft and resets quantity to `1`.

The review area shows the selected pack, requested quantity, no-animation behavior, duplicate policy, missing-price fallback, reload/non-resumability warning, and EA account-enforcement risk. A required checkbox authorizes exactly one batch; there is no remembered authorization. It ends with one explicit **Start Pack Batch** action.

On narrow screens, use a single-column catalog and a sticky Pack Batch summary. Trap keyboard focus, allow `Escape` only during selection/review, and return focus to **Auto Open** when the modal closes.

Show the supported EasySoccer keys in the modal: `/` search, arrow-key navigation, `+`/`-` quantity, `R` review, `1` back/close, `S` stop after the current pack, and `N` start another batch. Duplicate player cards use a distinct red border/background/badge. These are independent EasySoccer interactions; unrelated Paletools sniping, SBC-builder, and destructive bulk Quick Sell shortcuts are out of scope.

### Progress and Pack Batch Summary

During the run, keep the same panel open and replace selection controls with:

- opened/requested count;
- current pack state;
- Items collected;
- Tradeable Duplicates awaiting a decision;
- **Stop after current pack**.

Normal dismissal and `Escape` are disabled while running. Leaving My Packs behaves like **Stop after current pack**.

The final Pack Batch Summary contains:

- completed, stopped, or failed status;
- requested/opened/failed/uncertain pack counts;
- total Items and players;
- the five best players as compact EasySoccer cards with image, name, rating, pack number, tradeability, duplicate state, and final destination;
- duplicates moved to Transfer List;
- duplicates Quick Sold and Coins received;
- untradeable duplicates moved to SBC Storage;
- unresolved Items and the reason;
- Market Quote source/time for every automatic duplicate decision.

Normal Items remain aggregate totals. Every duplicate and unresolved Item is listed individually in expandable sections, grouped by outcome and ordered by pack/response order. Confirmed Coins exclude attempted or uncertain Quick Sells. Every terminal outcome renders a summary, including failures before the first pack. The summary offers **Close** and **Start Another Batch**; the latter re-fetches My Packs.

Batch and Item details are memory-only for the current Web App session. Dismissing the summary discards them.

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
mountOwnedPackAutoOpen() => void
```

It installs the My Packs lifecycle observer and owns DOM lifecycle, accessibility, responsive layout, and rendering immutable snapshots. Pricing and disposition policy stay in the modules above.

## Execution sequence

1. Detect My Packs and mount the Auto Open action once.
2. Fetch packs and build strict Owned Pack groups.
3. Open the picker and collect one group plus an exact quantity.
4. Present the immutable authorization summary.
5. On confirmation, verify account/platform/session identity, empty Unassigned, destination capacity, then re-fetch packs and resolve the selected instances.
6. Create one `PackAggregationStore` and begin the sequential runner.
7. Before every pack, ensure Unassigned is clear and no stop was requested.
8. Open one pack without animation and immediately record its Items.
9. Refresh Unassigned, reconcile every response Item by exact Item ID (or one unambiguous definition fallback), and use the refreshed objects for all disposition decisions.
10. Move normal Items to their valid destination.
11. For Tradeable player Duplicates, request one cached/bounded quote per unique definition, verify three-listing/20% confidence before Quick Sell, apply the 5% policy, then perform the authorized action.
12. Move eligible untradeable duplicates to SBC Storage. If they cannot be stored, leave them unresolved and stop before opening another pack.
13. Confirm Unassigned is clear before continuing.
14. Finish once the exact quantity is opened or a stop condition occurs, then render the Pack Batch Summary.

## Stop and failure rules

| Condition | Required behavior |
| --- | --- |
| Owned Pack count changed before start | Reject confirmation and refresh the picker |
| User requests stop | Finish the current confirmed operation; do not open the next pack |
| Pack-open response is missing or uncertain | Stop the batch; never retry automatically |
| Market Quote missing/stale/extinct/error | Transfer List/review fallback; never Quick Sell |
| Transfer List is full | Leave the Item unresolved and stop before the next pack |
| SBC Storage is full | Leave the untradeable duplicate unresolved and stop |
| Explicit retryable disposition failure with no applied action | Retry at most twice; three total attempts |
| Quick Sell or move result is missing/uncertain | Stop the batch; never retry the uncertain action |
| Unassigned remains non-empty | Stop and show every unresolved Item in the summary |
| Session, rate-limit, or account error | Stop immediately and preserve the observed summary |
| Web App navigation leaves My Packs | Finish the current confirmed operation, then stop before the next pack |

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

The previous WSL-path limitation is resolved. Chrome inspection successfully captured the signed-in My Packs surface, Paletools aggregation behavior, the existing EasySoccer queue modal, selected-card quantity controls, desktop layout, and narrow-width behavior. No pack was opened. Final verification still requires Paletools disabled and the updated EasySoccer userscript enabled.

A final read-only Chrome check after implementation confirmed that the native anchor `.ut-store-hub-view > .ea-filter-bar-view` is still present and that the first button is the selected **My Packs** tab. Paletools remained disabled and EA rendered the six Owned Packs as separate native cards. The installed Tampermonkey copy is still the previous EasySoccer build, so the new trigger was correctly absent; no browser extension state or account Item was changed during this check.

A follow-up Chrome inspection of Paletools v26.0.28 confirmed its aggregated My Packs tab/card counts, pack-type selector, search, hide-locked control, shortcut hints, duplicate-highlighting option, and its configurable Unassigned keyboard map. EasySoccer reuses only the observable information hierarchy and shortcut discoverability. It does not copy Paletools source, assets, branding, or destructive bulk-action behavior.

## Automated verification

Add Node tests around the same module interfaces used by production:

- strict `isMyPack` filtering excludes every Coin/Points offer, including zero-price-looking offers;
- stable grouping distinguishes tradeable and untradeable variants;
- fresh-pack revalidation prevents opening more than selected/available;
- the aggregation store is idempotent and produces immutable snapshots;
- best-five ranking uses rating only and preserves packed order for ties;
- the runner opens exactly the confirmed count and never runs concurrent opens;
- stop waits for the current operation and prevents the next pack;
- three-search budget, ten-minute quote cache, exact definition/platform identity, and three-listing/20% confidence;
- 5% calculation and equality → Quick Sell;
- missing/stale quote → Review/Transfer List fallback;
- Transfer List means move only, never create an auction;
- uncertain open/Quick Sell result has no automatic retry;
- explicit retryable, non-applied disposition failures allow at most two retries;
- player-only automatic duplicate policy and SBC Storage priority for eligible untradeable duplicates;
- interactive packs, loans/time-limited players, and non-player duplicates fail closed;
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
