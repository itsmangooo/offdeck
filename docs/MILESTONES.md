# OFFDECK milestones

Each milestone requires implementation, relevant automated tests, and a check in the running application where applicable. Fix defects exposed at the gate before advancing. Record the evidence and commit the completed work.

| Milestone | Acceptance criteria | Brief sections |
| --- | --- | --- |
| 1. Foundation and rooms | A clean install builds and launches from one command. Three independent browser clients create and join one room by invitation. Verify seats, ready status, saved nickname, capacity, host migration, refresh recovery, and understandable room errors. | 1–2, 5–7, 18–19, 24 |
| 2. Authoritative match | At least 100 original scenarios and 400 original responses pass deck validation. Server tests cover legal and illegal actions, hand privacy, anonymity, timing, scoring, ties, recycling, pause/resume, spectators, deck exhaustion and rematch. Three browser clients play an entire small test deck through real networking. | 3–7, 14, 18–19, 24 |
| 3. 3D environment | A live lobby and match show the oval poker table, lighting, eight seats, remote heads and card backs, a seated constrained camera, and physical scenario, response and hand cards. Inspect the running environment from multiple seats and verify readability at supported desktop sizes. | 8–11, 17, 19, 24 |
| 4. Physical interactions | In a running match players can inspect, submit and vote with the 3D cards. Verify deal, shuffle, draw, transfer, flip, highlight and discard animations, disabled own-card voting, confirmations, and recovery across refresh and pause. | 4, 10–12, 18–19, 24 |
| 5. Interface and audio | Finish the flat menu, lobby, overlays, final results and help. Verify usable settings, persistence, all requested sound cues, mute/volume, graphics quality, reduced motion and loading feedback in the game. | 5, 13, 15–17, 19, 24 |
| 6. Integration and refinement | Run the complete loop and rematch with three independent browsers, verify eight-player capacity and failure handling, inspect each visible phase, measure scene/resource behavior, and fix failures. | 17–19, 24–25 |
| 7. Release | Capture six real screenshots, complete README, credits, license and reverse-proxy guidance, verify a clean setup and tests, then publish and verify the public `offdeck` GitHub repository. | 20–25 |

## Verification record

- **1. Verified** with the Vite production build, three Node tests and a Chromium test using independent browser contexts. The browser test covered shareable links, joining, readiness, refresh recovery, host departure, capacity and invalid invitation feedback. The development command served the application on port 3000.
- **2. Verified** with 100 original scenarios, 400 original responses, 9 passing Node tests, the production build and a three-context Chromium match covering three unique scenarios, private hands, response reveal, voting, tied scores, deck exhaustion and a rematch in the same room.
- **3. Verified** the rendered menu, lobby and live gameplay at 1440×900 and 1280×720 from two seats. Inspected the table, heads, private hand, remote backs and scenario card. Batched static meshes and made reduced-motion rendering event-driven. All three browser tests and nine Node tests passed.
- **4. Verified** direct canvas hover, submission, own-card blocking, anonymous voting and live pause/resume with three clients. Inspected captures of the raised physical card and the face-up vote layout with animation enabled. Node tests and the production build passed.
- **5. Verified** the revised menu, lobby, HUD and settings in Chromium. A three-client browser test checked live nickname changes, stored settings after reload, a lower WebGL buffer size and real Web Audio source playback and mute. Audio cues and settings are local to each player. The Vite build and Node tests passed.
