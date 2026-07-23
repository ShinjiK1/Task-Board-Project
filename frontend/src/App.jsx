import { useEffect, useState } from 'react'
import './App.css'
import { checkSignIn, createNewAnon, getTasks, createTask, moveTask, deleteTask } from './lib/supabase'

const COLUMNS = ['To Do', 'In Progress', 'In Review', 'Done']

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

// Removes a card and closes the gap it leaves: every card below it in its
// column shifts up by one so orders stay contiguous.
function deleteCard(cards, cardId) {
  const removed = cards.find((c) => c.id === cardId)
  if (!removed) return cards
  return cards
    .filter((c) => c.id !== cardId)
    .map((c) =>
      c.column === removed.column && c.order > removed.order
        ? { ...c, order: c.order - 1 }
        : c
    )
}

function App() {
  const [cards, setCards] = useState([])
  const [draggingId, setDraggingId] = useState(null)
  const [dragOverColumn, setDragOverColumn] = useState(null)
  // Used to display where the dragged card will go, format is
  // { targetId, position: 'before' | 'after' } when hovering over a card,
  // { column } when the card would be placed at the end/bottom of a column.
  const [indicator, setIndicator] = useState(null)
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [trashHover, setTrashHover] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newStatus, setNewStatus] = useState(COLUMNS[0])

  useEffect(() => {
    checkSignIn().then(setUser).finally(() => setChecking(false));
  }, []);

  // Gets board information from database
  const refreshCards = async () => {
    try {
      setCards(await getTasks())
    } catch (error) {
      console.error(error)
    }
  }

  // Load the board from the database whenever a user is signed in — covers
  // both fresh sign-ups and returning visitors with a stored session
  useEffect(() => {
    if (user) refreshCards()
  }, [user]);

  const handleCreateAccount = async() => {
    setSigningIn(true);
    try {
      setUser(await createNewAnon());
    }
    catch (error) {
      console.error(error);
    }
    finally {
      setSigningIn(false);
    }
  }

  const handleCreateTask = async (event) => {
    event.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    try {
      // Wait for the insert so the local card carries the database's real id —
      // a locally-invented id would break later moves/deletes of this card
      const row = await createTask({
        title,
        status: newStatus,
        column_order: cards.filter((c) => c.column === newStatus).length + 1,
        user_id: user.id,
      })
      setCards((prev) => [
        ...prev,
        { id: row.id, column: row.status, order: row.column_order, text: row.title },
      ])
    } catch (error) {
      console.error(error)
    }
    setNewTitle('')
    setNewStatus(COLUMNS[0])
    setShowCreateForm(false)
  }

  const clearDragState = () => {
    setDraggingId(null)
    setDragOverColumn(null)
    setIndicator(null)
    setTrashHover(false)
  }

  const handleTrashDrop = (event) => {
    event.preventDefault()
    console.log("At start of trash drop");
    const draggedId = event.dataTransfer.getData('text/plain')
    console.log(draggedId);
    clearDragState()
    if (draggedId) {
      console.log("Trash drop");
      setCards((prev) => deleteCard(prev, draggedId))
      deleteTask(draggedId).catch((error) => {
        console.error(error)
        refreshCards() // failed on the server — snap back to its state
      })
    }
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
    console.log("At start of card drop");
    const draggedId = event.dataTransfer.getData('text/plain')
    const position = dropPosition(event)
    clearDragState()
    if (draggedId && draggedId !== card.id) {
      console.log("Card dropped");
      setCards((prev) => moveCard(prev, draggedId, card.column, card.id, position))
      moveTask(draggedId, { column: card.column, targetId: card.id, position }).catch((error) => {
        console.error(error)
        refreshCards() // failed on the server — snap back to its state
      })
    }
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
        return el.dataset.cardId
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
    console.log("At start of column drop");
    const draggedId = event.dataTransfer.getData('text/plain')
    const targetId = findCardBelowCursor(event)
    clearDragState()
    if (draggedId) {
      console.log("Column drop");
      setCards((prev) => moveCard(prev, draggedId, column, targetId, 'before'))
      moveTask(draggedId, { column, targetId, position: 'before' }).catch((error) => {
        console.error(error)
        refreshCards() // failed on the server — snap back to its state
      })
    }
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
      <div className="signup-screen">
        <button
          className="signup-button"
          onClick={handleCreateAccount}
          disabled={signingIn}
        >
          {signingIn ? 'Creating...' : 'Create an anonymous account' }
        </button>
      </div>
    )
  }

  return (
    <main className="board">
      <header className="board-header">
        <h1>Task Board</h1>
        <img
          src={trashHover ? '/OpenTrash.png' : '/ClosedTrash.png'}
          alt="Drag a task here to delete it"
          className={`trash${trashHover ? ' open' : ''}`}
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
          }}
          onDragEnter={() => setTrashHover(true)}
          onDragLeave={() => setTrashHover(false)}
          onDrop={handleTrashDrop}
        />
      </header>
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
      {showCreateForm ? (
        <form className="create-form" onSubmit={handleCreateTask}>
          <input
            type="text"
            placeholder="Task title"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            autoFocus
          />
          <select
            value={newStatus}
            onChange={(event) => setNewStatus(event.target.value)}
          >
            {COLUMNS.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
          <button type="submit">Add</button>
          <button type="button" onClick={() => setShowCreateForm(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button
          className="create-task-button"
          onClick={() => setShowCreateForm(true)}
        >
          Create Task
        </button>
      )}
    </main>
  )
}

export default App
