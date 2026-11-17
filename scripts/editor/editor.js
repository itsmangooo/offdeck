import { paintCardFace } from './card-face.js'
import { cardProfile, cardSimilarity } from './card-similarity.js'

const names = [
  'reload','stats','new-card','search','filter-type','filter-category','filter-status','filter-tag',
  'matches','cards','categories','edit-title','card-id','editor','card-fields','type','status','category',
  'text','length','tags','accepted-forms','form-options','response-form-label','response-form',
  'duplicates','disable','delete','preview','feedback'
]
const ui = Object.fromEntries(names.map(name => [name, document.getElementById(name)]))
const categoryNames = {
  hookups: 'Sex & Hookups', dating: 'Dating & Relationships', expectations: 'Men vs. Women',
  dark: 'Dark Humor', social: 'Social Disasters', unhinged: 'Unhinged'
}
const title = value => value[0].toUpperCase() + value.slice(1)
const context = ui.preview.getContext('2d')
let snapshot
let cards = []
let profiles = []
let selected = null
let busy = false

function options(control, values, labels = {}, any) {
  control.replaceChildren()
  if (any) control.add(new Option(any, ''))
  for (const value of values) control.add(new Option(labels[value] ?? title(value), value))
}

function configure(settings) {
  options(ui.type, settings.types)
  options(ui.status, settings.statuses)
  options(ui.category, settings.categories, categoryNames)
  options(ui['filter-type'], settings.types, {}, 'All types')
  options(ui['filter-status'], settings.statuses, {}, 'All statuses')
  options(ui['filter-category'], settings.categories, categoryNames, 'All categories')
  options(ui['response-form'], settings.forms, {}, 'Unspecified')
  ui.text.maxLength = settings.textLimit
  ui['form-options'].replaceChildren(...settings.forms.map(form => {
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.value = form
    const label = document.createElement('label')
    label.append(checkbox, document.createTextNode(title(form)))
    return label
  }))
}

function feedback(message, failed = false) {
  ui.feedback.textContent = message
  ui.feedback.classList.toggle('error', failed)
}

function renderStats() {
  const stats = [
    ['Scenarios', snapshot.library.scenario.length], ['Responses', snapshot.library.response.length],
    ...['approved','draft','disabled'].map(status =>
      [title(status), cards.filter(card => card.status === status).length])
  ]
  const pair = (key, value) => {
    const term = document.createElement('dt')
    const count = document.createElement('dd')
    term.textContent = key
    count.textContent = value
    return [term, count]
  }
  ui.stats.replaceChildren(...stats.map(([key,value]) => {
    const group = document.createElement('div')
    group.append(...pair(key,value))
    return group
  }))
  ui.categories.replaceChildren(...snapshot.settings.categories.flatMap(category =>
    pair(categoryNames[category], cards.filter(card => card.category === category).length)))
}

function renderList() {
  const search = ui.search.value.trim().toLowerCase()
  const type = ui['filter-type'].value
  const category = ui['filter-category'].value
  const status = ui['filter-status'].value
  const tag = ui['filter-tag'].value.trim().toLowerCase()
  const matches = cards.filter(card =>
    (!search || card.id.includes(search) || card.text.toLowerCase().includes(search)) &&
    (!type || card.type === type) && (!category || card.category === category) &&
    (!status || card.status === status) && (!tag || card.tags?.includes(tag)))
  ui.matches.textContent = matches.length + ' of ' + cards.length + ' cards'
  const rows = document.createDocumentFragment()
  for (const card of matches) {
    const item = document.createElement('li')
    const control = document.createElement('button')
    control.type = 'button'
    control.dataset.id = card.id
    if (card.id === selected) control.setAttribute('aria-current', 'true')
    const details = document.createElement('small')
    details.textContent = card.id + ' · ' + categoryNames[card.category] + ' · ' + title(card.status)
    control.append(card.text, details)
    item.append(control)
    rows.append(item)
  }
  ui.cards.replaceChildren(rows)
}

function showCard(card) {
  selected = card?.id ?? null
  ui['edit-title'].textContent = card ? 'Edit card' : 'New card'
  ui['card-id'].textContent = selected ?? 'Unsaved'
  ui.type.value = card?.type ?? 'scenario'
  ui.type.disabled = Boolean(selected)
  ui.status.value = card?.status ?? 'draft'
  ui.category.value = card?.category ?? snapshot.settings.categories[0]
  ui.text.value = card?.text ?? ''
  ui.tags.value = card?.tags?.join(', ') ?? ''
  ui['response-form'].value = card?.compatibility?.form ?? ''
  for (const control of ui['form-options'].querySelectorAll('input')) {
    control.checked = card?.compatibility?.accepts?.includes(control.value) ?? false
  }
  ui.disable.hidden = !selected || card.status === 'disabled'
  ui.delete.hidden = !selected
  updatePreview()
  renderList()
}

function updatePreview() {
  const { value: kind } = ui.type
  const text = ui.text.value.trim()
  ui['accepted-forms'].hidden = kind !== 'scenario'
  ui['response-form-label'].hidden = kind !== 'response'
  ui.length.textContent = text.length + ' / ' + snapshot.settings.textLimit
  paintCardFace(context, ui.preview.width, ui.preview.height, { kind, text })
  const candidate = cardProfile(text)
  const matches = []
  for (const { id, profile } of profiles) {
    if (id === selected) continue
    const match = cardSimilarity(candidate, profile)
    if (match) matches.push({ id, match })
  }
  const exact = matches.filter(entry => entry.match === 'exact')
  const near = matches.filter(entry => entry.match === 'similar')
  const list = rows => rows.slice(0, 5).map(row => row.id).join(', ')
  ui.duplicates.textContent = exact.length ? 'Duplicate text matches ' + list(exact) + '.' :
    near.length ? 'Review similar cards ' + list(near) + '.' : ''
}

async function request(path, payload) {
  const response = await fetch(path, payload && {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error)
  return result
}

function setBusy(value) {
  busy = value
  for (const control of [ui['card-fields'],ui['new-card'],ui.reload]) {
    control.disabled = value || (!snapshot && control !== ui.reload)
  }
}

function applySnapshot(result, id) {
  if (!snapshot) configure(result.settings)
  snapshot = result
  cards = [...result.library.scenario, ...result.library.response]
  profiles = cards.map(({ id, text }) => ({ id, profile: cardProfile(text) }))
  renderStats()
  showCard(cards.find(card => card.id === id) ?? (id ? null : cards[0]))
}

async function reload() {
  if (busy) return
  setBusy(true)
  try {
    applySnapshot(await request('/api/library'), selected)
    feedback('Source collection loaded.')
  } catch (error) {
    feedback(error.message, true)
  } finally {
    setBusy(false)
  }
}

function formCard(status = ui.status.value) {
  const card = {
    id: selected, type: ui.type.value, text: ui.text.value.trim().normalize('NFC'),
    category: ui.category.value, status
  }
  const tags = ui.tags.value.split(',').map(tag => tag.trim()).filter(Boolean)
  if (tags.length) card.tags = tags
  if (card.type === 'scenario') {
    const accepts = [...ui['form-options'].querySelectorAll('input:checked')].map(control => control.value)
    if (accepts.length) card.compatibility = { accepts }
  } else if (ui['response-form'].value) {
    card.compatibility = { form: ui['response-form'].value }
  }
  return card
}

async function mutate(payload, message) {
  if (busy) return
  setBusy(true)
  try {
    const result = await request('/api/cards', { ...payload, revision: snapshot.revision })
    applySnapshot(result, result.id)
    feedback(message)
  } catch (error) {
    feedback(error.message, true)
  } finally {
    setBusy(false)
  }
}

for (const control of [ui.search,ui['filter-type'],ui['filter-category'],ui['filter-status'],ui['filter-tag']]) {
  control.addEventListener('input', renderList)
}
ui.cards.addEventListener('click', event => {
  const control = event.target.closest('button[data-id]')
  if (!control || busy) return
  const card = cards.find(card => card.id === control.dataset.id)
  if (card) {
    showCard(card)
    ui.cards.querySelector('[aria-current="true"]')?.focus({ preventScroll: true })
  }
})
ui['new-card'].addEventListener('click', () => {
  showCard(null)
  ui.text.focus()
})
ui.editor.addEventListener('input', updatePreview)
ui.editor.addEventListener('submit', event => {
  event.preventDefault()
  mutate({ action: 'save', card: formCard() }, 'Card saved to source.')
})
ui.disable.addEventListener('click', () => {
  if (ui.editor.reportValidity()) mutate({ action: 'save', card: formCard('disabled') }, 'Card disabled.')
})
ui.delete.addEventListener('click', () => {
  if (selected && confirm('Permanently delete ' + selected + ' from the source collection?')) {
    mutate({ action: 'delete', id: selected, confirmation: selected }, 'Card deleted from source.')
  }
})
ui.reload.addEventListener('click', reload)
reload()
