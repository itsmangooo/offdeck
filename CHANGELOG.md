# Changelog

## 0.3.2 — Game Rules & Interactive Tutorial

- Added Game Rules to the main menu, lobby, and match, including expandable explanations of timers, disconnects, and rematches.
- Added a seven-step practice table for inspecting cards, submitting a response, voting, and scoring.
- Added a first-visit tutorial offer that remembers completion or dismissal. Players can replay from the main menu or Settings outside a room.
- Added phase-specific gameplay hints with a Settings toggle.
- Verified the onboarding and match flows in Chrome and added screenshots of the rules and practice table.

## 0.3.1 — Content Overhaul

- Audited all 1,000 cards and rewrote or replaced more than 750. The collection remains 250 approved scenarios and 750 approved responses.
- Varied the adult scenarios with questions, overheard dialogue, messages, confessions and fill-ins. Most responses now read in two to twelve words.
- Added typed JSON records with stable IDs, approval states, tags and optional response-form notes. The game loads approved cards.
- Added a loopback-only content editor with search, filters, a card-face preview, duplicate warnings and validated writes to the source files.
- Added release validation and reproducible pairing review. Compatibility notes guide editing while the server continues to deal shuffled hands.
- Verified the full 20-scenario match with eight WebSocket clients, complete browser matches and every approved card face. See the [verification record](docs/V0.3.1.md).

## 0.3.0 — Unfiltered Update

- Replaced the default deck with 1,000 original English cards for adults, including 250 scenarios and 750 responses across six humor categories.
- Reduced hands to five responses. One replacement is drawn after each played card, and rounds advance automatically.
- Standard matches use 20 unique scenarios. Room history favors fresh cards between matches, balances scenario categories and delays response recycling until the draw pile runs out.
- Improved wrapping and legibility of longer jokes on the physical cards in hand, during voting and in results.
- Added a browser-local 18+ self-confirmation before starting or joining a game.
- Verified complete three-client matches and rematches, five- and eight-client rounds, reconnects, host migration and all three desktop sizes. See the [verification record](docs/V0.3.md).

## 0.2.0

- Reframed all eight seats with constrained camera movement and a reversible 3D scenario close-up.
- Refined card text, the seven-card fan and voting rows for up to eight submissions across 720p, 900p and 1080p desktop viewports.
- Added private floating hands, seat-status cues and restrained avatar reactions. Updated felt, rail stitching, reflections and clubhouse lighting.
- Moved match controls into an edge-aligned HUD. Added private vote confirmation, animated point gains and a ranked final leaderboard.
- Refined deal and reveal timing, restored reconnecting seats directly to the current table, and improved invitation copying and keyboard navigation.
- Verified the production build in three-, five- and eight-client browser sessions. See the [verification record](docs/V0.2.md) and [updated screenshots](docs/screenshots).
