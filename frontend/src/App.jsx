import { useEffect, useState } from 'react'
import './App.css'
import { checkSignIn, createNewAnon } from './lib/supabase'

const COLUMNS = ['To Do', 'In Progress', 'In Review', 'Done']

const INITIAL_CARDS = [
  { id: 1, column: 'To Do', order: 1, text: 'Placeholder task one' },
  { id: 2, column: 'To Do', order: 2, text: 'Placeholder task two' },
  { id: 3, column: 'In Progress', order: 1, text: 'Placeholder task three' },
  { id: 4, column: 'In Progress', order: 2, text: 'Placeholder task four' },
  { id: 5, column: 'In Review', order: 1, text: 'Placeholder task five' },
  { id: 6, column: 'Done', order: 1, text: 'Placeholder task six' },
]

// Moves a card to "toColumn", inserting at the position(before/after) the card with
// "targetId", or appending to the end of the column when targetId is null.
// Order starts from 1 (closest to top) and goes up as cards go down in a column
function moveCard(cards, draggedId, toColumn, targetId, position) {
  const dragged = cards.find((c) => c.id === draggedId)
  if (!dragged || draggedId === targetId) return cards

  // Order each card would have once the dragged card is removed.
  const adjusted = (c) =>
    c.column === dragged.column && c.order > dragged.order
      ? c.order - 1
      : c.order

  let insertOrder
  if (targetId === null) {
    insertOrder =
      cards.filter((c) => c.column === toColumn && c.id !== draggedId).length + 1
  } else {
    const target = cards.find((c) => c.id === targetId)
    if (!target) return cards
    insertOrder = position === 'before' ? adjusted(target) : adjusted(target) + 1
  }

  return cards.map((c) => {
    if (c.id === draggedId) return { ...c, column: toColumn, order: insertOrder }
    const order =
      adjusted(c) + (c.column === toColumn && adjusted(c) >= insertOrder ? 1 : 0)
    return order === c.order ? c : { ...c, order }
  })
}

function App() {
  const [cards, setCards] = useState(INITIAL_CARDS)
  const [draggingId, setDraggingId] = useState(null)
  const [dragOverColumn, setDragOverColumn] = useState(null)
  // Used to display where the dragged card will go, format is
  // { targetId, position: 'before' | 'after' } when hovering over a card,
  // { column } when the card would be placed at the end/bottom of a column.
  const [indicator, setIndicator] = useState(null)
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    checkSignIn().then(setUser).finally(() => setChecking(false));
  }, []);

  const handleCreateAccount = async() => {
    setSigningIn(true);
    try {
      setUser(await createNewAnon());
    }
    catch {
      console.error(error);
    }
    finally {
      setSigningIn(false);
    }
  }

  const clearDragState = () => {
    setDraggingId(null)
    setDragOverColumn(null)
    setIndicator(null)
  }

  const dropPosition = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  }

  const handleDragStart = (event, cardId) => {
    event.dataTransfer.setData('text/plain', String(cardId))
    event.dataTransfer.effectAllowed = 'move'
    setTimeout(() => setDraggingId(cardId), 0)
  }

  const handleCardDragOver = (event, card) => {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    if (card.id === draggingId) {
      setIndicator(null)
      return
    }
    const position = dropPosition(event)
    setIndicator((prev) =>
      prev && prev.targetId === card.id && prev.position === position
        ? prev
        : { targetId: card.id, position }
    )
  }

  const handleCardDrop = (event, card) => {
    event.preventDefault()
    event.stopPropagation()
    const draggedId = Number(event.dataTransfer.getData('text/plain'))
    if (draggedId) {
      const position = dropPosition(event)
      setCards((prev) => moveCard(prev, draggedId, card.column, card.id, position))
    }
    clearDragState()
  }

  // For drags over a column's non-card areas (header, gaps between cards,
  // space below the last card): the card the cursor sits above, i.e. the
  // first card whose vertical midpoint is below the cursor. Cards come back
  // from querySelectorAll in document order, which matches the sorted render
  // order. Null means the cursor is below every card — append to the end.
  const findCardBelowCursor = (event) => {
    for (const el of event.currentTarget.querySelectorAll('[data-card-id]')) {
      const rect = el.getBoundingClientRect()
      if (event.clientY < rect.top + rect.height / 2) {
        return Number(el.dataset.cardId)
      }
    }
    return null
  }

  const handleColumnDragOver = (event, column) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const targetId = findCardBelowCursor(event)
    if (targetId === null) {
      setIndicator((prev) => (prev && prev.column === column ? prev : { column }))
    } else if (targetId === draggingId) {
      setIndicator(null)
    } else {
      setIndicator((prev) =>
        prev && prev.targetId === targetId && prev.position === 'before'
          ? prev
          : { targetId, position: 'before' }
      )
    }
  }

  const handleColumnDrop = (event, column) => {
    event.preventDefault()
    const draggedId = Number(event.dataTransfer.getData('text/plain'))
    if (draggedId) {
      const targetId = findCardBelowCursor(event)
      setCards((prev) => moveCard(prev, draggedId, column, targetId, 'before'))
    }
    clearDragState()
  }

  const cardClass = (card) => {
    let cls = 'card'
    if (card.id === draggingId) cls += ' dragging'
    if (indicator?.targetId === card.id) cls += ` indicate-${indicator.position}`
    return cls
  }

  if (checking) {
    return <p>Loading...</p>
  }

  if (!user) {
    return (
      <button onClick={handleCreateAccount} disabled={signingIn}>
        {signingIn ? 'Creating...' : 'Create an anonymous account' }
      </button>
    )
  }

  return (
    <main className="board">
      <h1>Task Board</h1>
      <div className="columns">
        {COLUMNS.map((column) => {
          const columnCards = cards
            .filter((card) => card.column === column)
            .sort((a, b) => a.order - b.order)
          return (
            <section
              key={column}
              className={`column${dragOverColumn === column ? ' drag-over' : ''}`}
              onDragOver={(event) => handleColumnDragOver(event, column)}
              onDragEnter={() => setDragOverColumn(column)}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setDragOverColumn(null)
                  setIndicator(null)
                }
              }}
              onDrop={(event) => handleColumnDrop(event, column)}
            >
              <h2>{column}</h2>
              <div className="cards">
                {columnCards.map((card) => (
                  <article
                    key={card.id}
                    data-card-id={card.id}
                    className={cardClass(card)}
                    draggable
                    onDragStart={(event) => handleDragStart(event, card.id)}
                    onDragEnd={clearDragState}
                    onDragOver={(event) => handleCardDragOver(event, card)}
                    onDrop={(event) => handleCardDrop(event, card)}
                  >
                    {card.text}
                  </article>
                ))}
                {indicator?.column === column && <div className="drop-end" />}
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}

export default App
