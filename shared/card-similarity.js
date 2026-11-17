export function cardWords(text) {
  return text.normalize('NFKC').toLowerCase().replace(/['’]/gu, '').match(/[\p{L}\p{N}]+/gu) ?? []
}

export function cardProfile(text) {
  const words = cardWords(text)
  const value = words.join(' ')
  const trigrams = new Set()
  for (let i = 0; i < value.length - 2; i++) trigrams.add(value.slice(i, i + 3))
  return { value, trigrams, words: new Set(words) }
}

function sharedCount(a, b) {
  if (b.size < a.size) [a,b] = [b,a]
  let count = 0
  for (const value of a) if (b.has(value)) count++
  return count
}

export function cardSimilarity(a, b) {
  if (!a.value || !b.value) return null
  if (a.value === b.value) return 'exact'
  if (Math.min(a.words.size, b.words.size) >= 5) {
    const shared = sharedCount(a.words, b.words)
    if (shared / (a.words.size + b.words.size - shared) >= .82) return 'similar'
  }
  const total = a.trigrams.size + b.trigrams.size
  if (Math.min(a.value.length, b.value.length) >= 18 &&
      2 * Math.min(a.trigrams.size, b.trigrams.size) / total >= .87 &&
      2 * sharedCount(a.trigrams, b.trigrams) / total >= .87) return 'similar'
  return null
}
