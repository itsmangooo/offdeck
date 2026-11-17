import play from '@phosphor-icons/core/regular/play.svg?raw'
import cards from '@phosphor-icons/core/regular/cards.svg?raw'
import door from '@phosphor-icons/core/regular/door-open.svg?raw'
import copy from '@phosphor-icons/core/regular/copy.svg?raw'
import gear from '@phosphor-icons/core/regular/gear.svg?raw'
import question from '@phosphor-icons/core/regular/question.svg?raw'
import signOut from '@phosphor-icons/core/regular/sign-out.svg?raw'
import trophy from '@phosphor-icons/core/regular/trophy.svg?raw'
import close from '@phosphor-icons/core/regular/x.svg?raw'
import check from '@phosphor-icons/core/regular/check.svg?raw'
import users from '@phosphor-icons/core/regular/users.svg?raw'
import stack from '@phosphor-icons/core/regular/stack.svg?raw'

const icons = { play, cards, door, copy, gear, question, signOut, trophy, close, check, users, stack }

export function icon(name) {
  return icons[name]?.replace('<svg ', '<svg aria-hidden="true" focusable="false" ') ?? ''
}
