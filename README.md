# OFFDECK

OFFDECK is a first-person 3D party card game for **3–8 players** in a desktop browser. Invite friends to a private poker table, match a response card to the scenario, and vote for the funniest combination.

- Create a private room and share its invitation link. Each player joins with a nickname.
- Sit at an eight-seat 3D poker table with private floating hands, avatar reactions and a physical seven-card hand.
- Click the scenario card for a close-up. Submit and vote by clicking physical cards. A private marker confirms your vote.
- The edge-aligned HUD leaves the table clear. Voting rows adapt to the number of submitted cards.
- Earn one point for each vote received. Scenarios progress automatically until the deck is exhausted.
- Refresh or reconnect to the same seat. The room migrates the host when needed.
- Play with 100 original scenarios and 400 original responses. Adjust volume, camera sensitivity, graphics quality and motion locally.

## Screenshots

Captured from the production build with three connected browser clients using a three-scenario test deck.

![OFFDECK main menu and poker room](docs/screenshots/main-menu.png)
![First-person gameplay with a seven-card hand](docs/screenshots/gameplay.png)
![Anonymous responses in the voting phase](docs/screenshots/voting.png)

[Multiplayer lobby](docs/screenshots/lobby.png) · [Card inspection](docs/screenshots/card-inspection.png) · [Round results](docs/screenshots/round-results.png) · [Final leaderboard](docs/screenshots/final-results.png)

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

1. Choose a nickname. The browser remembers it for 365 days. Change it in **Settings**.
2. Create a room or open an invitation. The host can start when at least three players are connected.
3. Click the scenario for a closer look. Press **Esc**, click the scene again, or use **Close inspection** to return to the table. Hover over a response to read it, then click to submit. The default response timer is 45 seconds.
4. After the reveal, click another player’s response to vote. Each player who submitted a response can cast one vote. **Vote cast** appears on the chosen card in your view. The default voting timer is 30 seconds.
5. Read the authors and vote totals in the results. Each vote received is worth one point. The highest-voted response wins the round, with ties shared.
6. Play continues automatically. After the last scenario, the final leaderboard highlights the highest-scoring player or tied players. The host can play again in the same room.

Move the mouse to look around from your seat. Open **Card list** in the upper-left HUD for keyboard submission, voting and scenario inspection. Reduced motion holds the camera steady and settles cards directly into place. Graphics quality adjusts resolution and shadows. A newcomer joining an active match spectates and can play in the next one.

## Project structure

| Path | Contents |
| --- | --- |
| `client/` | JavaScript UI, Three.js scene, storage, card interactions and Web Audio cues |
| `server/` | Express, Socket.IO, room sessions, private state, deadlines and authoritative match rules |
| `shared/` | Protocol constants and nickname validation |
| `decks/` | Editable JSON arrays of English scenario and response text |
| `public/` | Browser assets and third-party license notices |
| `test/` | Node rules and transport tests plus Playwright multiplayer and visual tests |
| `docs/` | [Development milestones](docs/MILESTONES.md) and screenshots |

The app uses JavaScript, Vite, Three.js and Web Audio on the client, with Node.js, Express and Socket.IO on the server. The server maintains hands, deadlines, submissions, votes and scores. Each client receives a private, viewer-specific snapshot. Card text is loaded from the two JSON decks at server startup. Use unique, non-empty strings of up to 170 characters when editing either deck.

## Testing

```sh
npm test
npx playwright install chromium
npm run test:browser
```

The Node suite exercises the full 100-scenario deck at eight seats. Playwright completes a three-scenario match through physical cards and runs additional rounds with five and eight independent browser contexts. It also covers all three desktop viewports, reconnects, host migration, settings, audio and both rematch paths. See the [v0.2 verification record](docs/V0.2.md).

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
