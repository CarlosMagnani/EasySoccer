# Pack price sources: Paletools and FUTGenie

Research date: 2026-07-20

## Conclusion

There are two different values that must not be treated as equivalent:

- An **Allowed Listing Range** is the minimum and maximum price at which EA permits an Item to be listed. EA says that an Item's average Coin price fluctuates with supply and demand inside that range. The range is therefore validation metadata, not a current market-price estimate. [EA SPORTS FC rules](https://help.ea.com/en/articles/ea-sports-fc/fc-rules/)
- A **Market Price Estimate** requires recent listings or sales. The inspected tools obtain it through live Transfer Market searches, an external data provider, or their own aggregated data service.

The published clients do not expose a documented, reusable pricing API for EasySoccer:

- Paletools 26.0.28 defaults its external price provider to FUT.GG and contains an undocumented FUT.GG player-price URL. Its Companion exists to make cross-origin price retrieval possible; this is not evidence of a licensed public API.
- FUTGenie 2.9.7 performs live searches through the EA Web App and exchanges auction/sale observations and aggregate prices with FUTGenie's own authenticated `midas.futgenie.gg` backend. Its server-side upstream sources and aggregation algorithm are not public.

Neither implementation should be copied or used as an API contract. EasySoccer should use an authorized provider or user-confirmed price evidence; an unavailable or stale price must never trigger automatic Quick Sell.

## Method and inspection boundary

Only public, first-party materials and publicly distributed browser-extension packages were inspected. No account, cookie, session, credential, token, protected endpoint, or logged-in Web App traffic was accessed. Paletools' delivered script is obfuscated; it was not deobfuscated. FUTGenie's minified files were mechanically formatted for line-level inspection without changing their semantics.

Artifacts inspected:

- Paletools userscript 26.0.28 from [Paletools' official download URL](https://pale.tools/fifa/dist/latest/paletools.user.js), SHA-256 `28b6809c2ba5b6820ee58f75a953f38604b5a264f6f2c4c6ae8a70ff25a49b71`.
- Paletools Companion 1.1 from its [official Chrome Web Store listing](https://chromewebstore.google.com/detail/paletools-companion/ekfglbnoekobjohnkfpmjaffoidafmmm), CRX SHA-256 `096953f86db9c73516477d70b9941c712d8b8c0301cc9adfa0736c8a06f2cc10`.
- FUTGenie Extension 2.9.7 from its [official Chrome Web Store listing](https://chromewebstore.google.com/detail/futgenie-extension/olhalnjomgocehnhjpdemckdmeccnnfj), CRX SHA-256 `dc3944c3f843317edb4b5cffcadabcc420df468094f71e64937849b64a529903`.

Package-relative source citations below refer to those exact versions. The inspection copies are under `/tmp/easysoccer-price-research.V2DlDE/`.

## Paletools findings

### Public product description

Paletools' official site lists "Look for player lowest prices" as a Transfer Market feature. It also presents external FUTBIN and FUT.GG player-search actions as separate features in the distributed script. [Paletools official site](https://pale.tools/)

The official installation page explicitly says the Companion "allows Paletools to fetch prices." [Paletools installation page](https://pale.tools/fifa/paletools.html)

### External price provider

The public userscript header permits cross-origin userscript requests to `futwiz.com`, `futbin.com`, and `fut.gg` (`paletools.user.js:1-17`). Its default configuration sets:

- `externalServices.prices.providers = ['fut.gg']`
- `externalServices.prices.provider = 'fut.gg'`
- `externalServices.sbc.provider = 'futbin'`

Those literals appear in the delivered file at `paletools.user.js:21` around byte offset 227011. The same public file contains the literal URL `https://www.fut.gg/api/fut/player-prices/` at `paletools.user.js:21` around byte offset 938485.

This is strong evidence that Paletools' default external Item-price feed is FUT.GG, while FUTBIN is the default SBC provider and also a player-search destination. It is not evidence that FUT.GG documents or licenses that endpoint for third-party applications.

### What the Companion does

The Companion package has no JavaScript service worker or Paletools-owned pricing backend:

- Its manifest grants host access to EA, FUT.GG, FUTBIN, EasySBC, and Pale Tools (`Paletools Companion 1.1/manifest.json:11-20`).
- Its single network rule adds permissive CORS response headers to requests initiated from `www.ea.com` (`Paletools Companion 1.1/rules.json:4-41`).

This matches the official description: the Companion is a browser-side cross-origin bridge that lets the bookmarklet fetch third-party price data. The Tampermonkey edition instead declares `GM_xmlhttpRequest` and explicit `@connect` hosts (`paletools.user.js:7-17`).

### "Cheapest" remains two possible mechanisms

The delivered script contains distinct concepts for an external price provider, "Find lowest market price," and selecting the cheapest player. Because the runtime is obfuscated and was not deobfuscated, the exact data path behind every button cannot be proven from the public package alone.

Confidence:

- **High:** the default external price provider is FUT.GG.
- **High:** the Companion enables browser-side access to FUT.GG/FUTBIN rather than supplying a Paletools-owned price API.
- **Medium:** "Select cheapest" consumes the external Item-price feed.
- **Medium:** "Find lowest market price" performs a live EA Transfer Market comparison rather than using the external cached price. The official feature description supports this, but the exact call path is obscured.

## FUTGenie findings

### Its client talks to EA and FUTGenie-owned services

The extension manifest grants host access only to EA and FUTGenie's own website, `oracle.futgenie.gg`, and `midas.futgenie.gg`; it does not grant access to FUTBIN or FUT.GG (`FUTGenie 2.9.7/manifest.json:13-20`). The configuration names Oracle and Midas as its API bases (`FUTGenie 2.9.7/config.js:13-17`). No `futbin`, `fut.gg`, or `futgg` string occurs in the published package.

The public Chrome Web Store description advertises real-time price overlays and says data comes from "public APIs," but it does not identify those APIs. The inspected client is more specific: its direct price API is FUTGenie's own backend. [FUTGenie Chrome Web Store](https://chromewebstore.google.com/detail/futgenie-extension/olhalnjomgocehnhjpdemckdmeccnnfj)

### Aggregate price feed and telemetry

The content script:

- fetches `/api/average-prices` from Midas and requires FUTGenie authentication (`content.formatted.js:1936-1963`);
- posts auction-search observations to `/api/auction` and `/api/auction/direct` (`content.formatted.js:1964-2010`);
- posts sale observations to `/api/sale` (`content.formatted.js:2011-2028`).

The injected client caches the returned average-price data for one hour (`inject.formatted.js:2865-2934`). FUTGenie's privacy policy independently confirms that it collects pack outcomes and auction/Transfer Market activity initiated through its service. [FUTGenie privacy policy](https://www.futgenie.gg/privacy-policy)

It is therefore reasonable to infer that Midas maintains at least some FUTGenie-owned market dataset from client observations. Whether Midas supplements that dataset with another provider is unknown because the server implementation is not public.

### Live EA Transfer Market searches

FUTGenie also obtains current evidence directly in the Web App:

- `searchMarketStatsForDefinitionId` runs up to three Transfer Market searches, collects Buy Now/current-bid values, and calculates lowest, highest, and average prices (`inject.formatted.js:17293-17464`).
- `searchLowestPriceVia3Searches` searches the EA item service and selects the lowest valid Buy Now listing (`inject.formatted.js:16429-16670`).
- "List at Market Price" invokes that search before proposing a listing (`inject.formatted.js:21205-21317`).

The same observations are sent to FUTGenie's Midas service (`inject.formatted.js:17298-17319` for the direct observation and `inject.formatted.js:6984-7078` for ordinary search observations).

### Price ranges are local validation metadata

FUTGenie reads an Item's minimum/maximum listing range from the Web App model through `getPriceLimits()` or equivalent Item fields (`inject.formatted.js:37641-37657`). It uses the range to validate listing inputs and ensure selected Items share compatible limits (`inject.formatted.js:38221-38244`). It does not treat the maximum or minimum as the Item's current market value.

The current FUTGenie bulk-pack routing in the inspected version is configured by Item type, tradeability, duplicate state, destination, exceptions, and optional rating thresholds (`inject.formatted.js:36590-36642`). No evidence was found that its pack opener automatically chooses Transfer List versus Quick Sell by comparing Net Market Value with discard value.

Confidence:

- **High:** current prices can come from live EA Transfer Market searches.
- **High:** aggregate prices are fetched from FUTGenie's authenticated Midas backend.
- **High:** the client contributes auction and sale observations to Midas.
- **High:** no direct FUTBIN/FUT.GG integration exists in the published client.
- **Unknown:** Midas' server-side upstream sources, cleansing, aggregation formula, and licensing.

## API and reuse assessment

| Source or mechanism | Technically observable | Documented public integration API | Reusable by EasySoccer |
|---|---:|---:|---|
| EA Allowed Listing Range in the Web App Item model | Yes | No public developer contract located | Only as validation metadata; do not treat as market value |
| Live EA Transfer Market search | Yes | No public developer contract located | Not recommended: EA prohibits bots/automation and modified interactions |
| Paletools' FUT.GG price URL | Yes | No | No, unless FUT.GG grants express permission/API access |
| Paletools Companion CORS bridge | Yes | Not an API | No; reproducing it would facilitate undocumented third-party access |
| FUTGenie Midas/Oracle | Yes | No; client marks price endpoints authenticated | No; private service and protected implementation |
| Manual provider link or user-entered quote | Yes | Not needed | Yes, provided the user browses the provider normally |
| Licensed price provider | Depends on contract | Yes, if supplied by provider | Preferred automated source |

FUTBIN prohibits automated scraping/data mining without written permission, apart from a limited pricing-data exception for students and content creators that does not establish a production API license. [FUTBIN Terms, section 13](https://www.futbin.com/tos)

Stormstrike's terms, which govern FUT.GG, prohibit automated access/scraping unless expressly permitted and prohibit reverse engineering or copying its services. [Stormstrike terms](https://stormstrike.gg/terms)

FUTGenie's own terms prohibit reverse engineering or copying its service and warn that use may violate EA's terms. [FUTGenie terms](https://www.futgenie.gg/terms-of-service)

EA says users must use official, unmodified apps and must not use bots, automation, or auto-buying tools; it also warns against browser extensions. [EA SPORTS FC rules](https://help.ea.com/en/articles/ea-sports-fc/fc-rules/)

## Implications for EasySoccer

The duplicate-disposition design should separate three fields:

- `allowedListingRange`: EA minimum/maximum, used only to validate a possible listing.
- `marketQuote`: platform-specific market estimate with source, observation time, sample size/confidence, and freshness.
- `quickSellValue`: the Item's deterministic discard value.

The disposition rule remains:

`Net Market Value = Market Quote × 0.95`

- Net Market Value greater than Quick Sell value: make the Item a **Transfer List Candidate**.
- Net Market Value less than or equal to Quick Sell value: make it a **Quick Sell Candidate** only when the quote is authorized, fresh, platform-matched, and sufficiently reliable.

Required safety fallbacks:

1. An Allowed Listing Range alone must never authorize Quick Sell.
2. Missing, stale, extinct, ambiguous, or provider-error prices must pause for review or default to the non-destructive Transfer List Candidate path.
3. Provider provenance and observation time must be visible in the batch summary.
4. A provider adapter must fail closed; switching from licensed data to scraping must not be possible through configuration.
5. Automatic disposition should remain disabled until EasySoccer has written permission for a documented price API. A practical interim workflow is **Open batch → retain tradeable duplicates → show provider links/native Compare Price instructions → user confirms disposition**.

The generic architecture, terminology, freshness checks, and 5% calculation can be independently implemented. Paletools/FUTGenie code, private endpoints, undocumented third-party endpoints, CORS workarounds, and automated EA market searches are not reusable implementation assets.
