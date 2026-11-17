# OFFDECK

OFFDECK is a first-person 3D party card game for **3–8 adults** in a desktop browser. Invite friends to a private poker table, play an anonymous response, and vote for the funniest combination.

**18+ content warning.** OFFDECK contains explicit language, sexual humor, dark comedy, and mature themes. First-time visitors confirm they are 18 or older. The browser remembers this self-declaration locally.

The Unfiltered Update brings **1,000 original English cards** to the default game, with **250 scenarios** and **750 responses**. Cards span hookups, dating disasters, relationship expectations, dark humor, social taboos and surreal comedy. The server draws **20 unique scenarios** for each standard match. It balances categories and favors cards the room hasn't seen recently. Response cards are shuffled, dealt privately, and recycled only if the draw pile runs out. Recent card history stays with the room across rematches.

## Screenshots

Captured from the production build with three connected browser clients using a three-scenario test deck.

![OFFDECK main menu and poker room](docs/screenshots/main-menu.png)
![First-person gameplay with a five-card hand](docs/screenshots/gameplay.png)
![Anonymous responses in the voting phase](docs/screenshots/voting.png)

[18+ confirmation](docs/screenshots/age-confirmation.png) · [Multiplayer lobby](docs/screenshots/lobby.png) · [Card inspection](docs/screenshots/card-inspection.png) · [Round results](docs/screenshots/round-results.png) · [Final leaderboard](docs/screenshots/final-results.png)

## Quick start

Use Git, Node.js **22.12 or later** with npm, and a desktop browser with WebGL 2. The release was tested with Node.js 24 and Chromium.

```sh
git clone https://github.com/itsmangooo/offdeck.git
cd offdeck
npm ci
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The command starts the Vite frontend and Socket.IO server on the same origin. Use three Chromium profiles, a mix of browsers, or Playwright contexts to try a full local match with separate seats.

For friends on your LAN, set `HOST=0.0.0.0` in a local `.env` and have everyone open the server’s LAN address. The app generates its invitations from the address in the browser unless `PUBLIC_ORIGIN` is configured.

## How to play

1. Confirm you are 18 or older and choose a nickname. The browser remembers your nickname for 365 days. Change it in **Settings**.
2. Create a room and share its invitation link, or open an invitation. The host can start when at least three players are connected.
3. Click the scenario card for a close-up. Press **Esc** or choose **Close inspection** to return to the table. Hover over a response to read it and click to lock in one of your five cards.
4. Responses are revealed anonymously when everyone submits or the timer expires. If you submitted, cast one private vote for another player's card. **Vote cast** confirms your choice privately. Vote totals and response authors are revealed in the results.
5. Each vote received is worth one point. Ties are shared. Played responses are discarded, and a replacement brings each hand back to five for the next scenario.
6. Rounds advance automatically until the scenario deck runs out. The final leaderboard shows the overall winner or tied winners. The host can start a fresh match in the same room.

Move the mouse to look around from your seat. Open **Card list** in the upper-left HUD for keyboard submission, voting and scenario inspection. Reduced motion holds the camera steady and settles cards directly into place. Graphics quality adjusts resolution and shadows. A newcomer joining an active match spectates and can play in the next one.

## Project structure

| Path | Contents |
| --- | --- |
| `client/` | JavaScript UI, Three.js scene, storage, card interactions and Web Audio cues |
| `server/` | Express, Socket.IO, room sessions, private state, deadlines and authoritative match rules |
| `shared/` | Protocol constants and nickname validation |
| `decks/` | Editable JSON arrays of English cards with stable IDs, categories and text |
| `public/` | Browser assets and third-party license notices |
| `test/` | Node rules and transport tests plus Playwright multiplayer and visual tests |
| `docs/` | [v0.3 verification record](docs/V0.3.md) and screenshots |

The app uses JavaScript, Vite, Three.js and Web Audio on the client, with Node.js, Express and Socket.IO on the server. The server maintains hands, deadlines, submissions, votes and scores. Each client receives a private, viewer-specific snapshot. Card text is loaded from the two JSON decks at server startup. Keep each record's ID stable when editing. Card text should be unique, non-empty and at most 120 characters.

## Testing

```sh
npm test
npx playwright install chromium
npm run test:browser
```

The Node suite validates all 1,000 cards and simulates repeated 20-scenario matches at eight seats, including a separate draw-pile exhaustion test. Playwright completes a physical-card match and exercises two complete rematches, five- and eight-client sessions, all three desktop viewports, age confirmation, reconnects and host migration. See the [v0.3 verification record](docs/V0.3.md).

To run the browser suite against the production bundle, run `npm run build` and then use the command for your shell.

```sh
OFFDECK_BROWSER_PROD=1 npm run test:browser
```

```powershell
$env:OFFDECK_BROWSER_PROD = '1'
npm run test:browser
```

On Windows with installed Chrome, set `OFFDECK_CHROME_D3D11=1` to run the browser suite with hardware acceleration. After building, run `node test/measure-scene.js --chrome` for the reproducible 1440×900 sample.

## Deployment

```sh
npm ci
npm run build
npm start
```

Use [`.env.example`](.env.example) as the configuration reference. Run one Node process behind an HTTPS reverse proxy. Set `PUBLIC_ORIGIN` to the public HTTPS origin, such as `https://offdeckgames.com`. An invitation has the format `https://offdeckgames.com/sid/{sessionId}/`. Node serves the frontend package and handles direct navigation to those URLs.

Proxy HTTP requests and WebSocket upgrades to the same process. Preserve the original host and forward `Upgrade` and `Connection` for `/socket.io/`. The following Nginx example goes in the TLS virtual host, with the `map` in the surrounding `http` context. [Nginx WebSocket proxying documentation](https://nginx.org/en/docs/http/websocket.html)

```nginx
# http context
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

# HTTPS server context
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_read_timeout 75s;
}
```

`GET /healthz` is available for a local or proxy health check. Restart the process to load edited deck files. In-memory rooms are scoped to a single process and expire after 30 minutes of inactivity. A restart ends outstanding rooms. Disconnected seats are reserved for two minutes. An active match pauses while fewer than three participating players are connected, and ends as abandoned if too few reserved seats remain to resume.

## License and credits

The project source, starter decks and procedural room, avatars, artwork and sounds are available under the [MIT license](LICENSE).

- [Three.js](https://threejs.org/) under [MIT](public/licenses/three-MIT.txt).
- [Phosphor Icons](https://phosphoricons.com/) under [MIT](public/licenses/phosphor-MIT.txt).
- [Geist](https://vercel.com/font) under the [SIL Open Font License 1.1](public/licenses/geist-OFL.txt).
- [Socket.IO](https://socket.io/) and its client dependencies under the [included notices](public/licenses/).
