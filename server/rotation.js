export const SCENARIO_HISTORY_MATCHES = 4
export const RESPONSE_HISTORY_LIMIT = 300

export function newScenarioPile(cards, count, previousMatches) {
  const recency = new Map()
  for (const [index, identifiers] of previousMatches.entries()) {
    for (const id of identifiers) recency.set(id, index + 1)
  }

  // Prefer unseen cards, then cards from the oldest retained match. Each age group
  // contains shuffled stacks by category, so equal choices still vary.
  const tiers = Array.from({ length: previousMatches.length + 1 }, () => new Map())
  for (const card of cards) {
    const tier = tiers[recency.get(card.id) ?? 0]
    if (!tier.has(card.category)) tier.set(card.category, [])
    tier.get(card.category).push(card)
  }

  const order = []
  const categoryCounts = new Map()
  let lastCategory
  for (const tier of tiers) {
    while (tier.size && order.length < count) {
      const available = [...tier.keys()]
      const alternatives = available.filter(category => category !== lastCategory)
      const eligible = alternatives.length ? alternatives : available
      const countFor = category => categoryCounts.get(category) ?? 0
      const category = eligible.reduce((best, candidate) =>
        countFor(candidate) < countFor(best) ? candidate : best)
      const stack = tier.get(category)
      order.push(stack.pop())
      if (!stack.length) tier.delete(category)
      categoryCounts.set(category, countFor(category) + 1)
      lastCategory = category
    }
  }
  return order.reverse()
}

export function beginScenarioHistory(previousMatches) {
  const played = new Set()
  previousMatches.push(played)
  if (previousMatches.length > SCENARIO_HISTORY_MATCHES) previousMatches.shift()
  return played
}

export function newResponsePile(cards, recentIds) {
  const recent = []
  const fresh = []
  for (const card of cards) (recentIds.has(card.id) ? recent : fresh).push(card)
  // Cards are drawn off the end. Keep both groups shuffled.
  return recent.concat(fresh)
}

export function rememberResponse(recentIds, id) {
  recentIds.delete(id)
  recentIds.add(id)
  if (recentIds.size > RESPONSE_HISTORY_LIMIT) recentIds.delete(recentIds.values().next().value)
}
