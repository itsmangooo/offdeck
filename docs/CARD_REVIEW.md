# Pairing review

Run `node scripts/review-cards.js bench-031` for 12 five-card hands, two prompts in each category. Each hand includes one response from the prompt's category and four from other categories. The seed makes a review repeatable. Add `--all-responses` to draw from the whole approved response pool.

A response can have a **form** such as person, object, action, quote, admission or outcome. A scenario can list several forms it **accepts**. These are editorial notes for the reviewed examples. Context still decides whether a card works. The metadata stays in the source database and the review command. The game deals shuffled responses as before.

## First pass

Reviewed all 60 pairings with seed `bench-031`. Read the prompt and response aloud as two lines. A clean fit follows the prompt without explanation. A playable surprise changes its meaning or makes the listener infer a plausible story. A miss requires a second setup just to make sense.

| Category | Pair that works | Pair that exposes a limit |
| --- | --- | --- |
| Sex & Hookups | The hotel refund (`scenario-009`) and leaving a toothbrush to mark territory (`response-812)). The petty act works as a condition or the reason the guest wants a refund. | The hotel refund and the quiet roar of six adults declining to identify a body (`response-482)). A shared dark setting alone doesn't make the response a condition. |
| Dating & Relationships | An ex proving they've changed (`scenario-055`) and “It's only emotional cheating if you can spell their name” (`response-203`). The response is a terrible piece of evidence. | A marriage-license disclaimer (`scenario-074`) and a tattoo artist who works from police sketches (`response-639`). The topic isn't enough to turn a person into a disclaimer. |
| Men vs. Women | Mistaking something for emotional maturity (`scenario-094`) and “That's her drinking mug. You can use a glass” (`response-171`). A tiny courtesy distracts from an obvious problem. | The same maturity prompt and a bucket of unsolicited horses (`response-689`). There's no relationship observation left to carry the prop. |
| Dark Humor | The wrong eulogy (`scenario-129`) and “It's still our money. I just turned it into a kayak” (`response-272`). A private fight becomes a public last word. | The accident report (`scenario-148`) and leaving a toothbrush to mark territory (`response-812`). The old prompt asked how things could get worse. Reframed the prompt to ask for an embarrassing omitted detail, which can take a confession as well as a cause. |
| Social Disasters | Grandma asking for an explanation (`scenario-171`) and calling a cold sore a lip piercing (`response-556`). Both lines expose a small lie in a bad place. | The old book club prompt (`scenario-199`) and getting the silent treatment in two languages (`response-313`). The hand supplied reactions and excuses more often than causes. Reframed the prompt as the excuse given after the ban. |
| Unhinged | The bouncer accepting unusual ID (`scenario-227`) and a burner phone containing only “Pilates” (`response-136`). It's recognizable as dubious identification and a hint at a second life. | The same bouncer and “Calling the judge ‘king’” (`response-913`). A clean standalone response can still miss a slot that calls for evidence. |

The early intimacy confession (`scenario-005`) was too abstract when paired with observations and props. Giving the other person something they already saw made those responses easier to play. Keep the occasional narrower prompt where its setup earns the constraint, and allow the deal to supply occasional bad choices.
