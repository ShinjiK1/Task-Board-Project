import { useEffect, useState } from 'react'
import './App.css'
import { checkSignIn, createNewAnon, getTasks, createTask, moveTask, deleteTask } from './lib/supabase'

const COLUMNS = ['To Do', 'In Progress', 'In Review', 'Done']
const PRIORITIES = ['Low', 'Medium', 'High']

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
  const [newPriority, setNewPriority] = useState('Medium')
  const [searchQuery, setSearchQuery] = useState('')
  // Which priorities are visible on the board; all checked by default
  const [visiblePriorities, setVisiblePriorities] = useState({
    Low: true,
    Medium: true,
    High: true,
  })
  const [boardLoading, setBoardLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState(null)

  useEffect(() => {
    checkSignIn().then(setUser).finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (!errorMessage) return
    const timer = setTimeout(() => setErrorMessage(null), 5000)
    return () => clearTimeout(timer)
  }, [errorMessage]);

  // Gets board information from database
  const refreshCards = async () => {
    try {
      setCards(await getTasks())
    } catch (error) {
      console.error(error)
      setErrorMessage('Could not load your tasks. Check your connection and reload.')
    }
  }

  // Load the board from the database whenever a user is signed in — covers
  // both fresh sign-ups and returning visitors with a stored session
  useEffect(() => {
    if (!user) return
    setBoardLoading(true)
    refreshCards().finally(() => setBoardLoading(false))
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
      const row = await createTask({
        title,
        status: newStatus,
        column_order: cards.filter((c) => c.column === newStatus).length + 1,
        priority: newPriority,
        user_id: user.id,
      })
      setCards((prev) => [
        ...prev,
        { id: row.id, column: row.status, order: row.column_order, text: row.title, priority: row.priority },
      ])
    } catch (error) {
      console.error(error)
      setErrorMessage('Could not create the task. Please try again.')
    }
    setNewTitle('')
    setNewStatus(COLUMNS[0])
    setNewPriority('Medium')
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
    const draggedId = event.dataTransfer.getData('text/plain')
    console.log(draggedId);
    clearDragState()
    if (draggedId) {
      setCards((prev) => deleteCard(prev, draggedId))
      deleteTask(draggedId).catch((error) => {
        console.error(error)
        setErrorMessage('Could not delete the task — the board was restored.')
        refreshCards() // failed on the server — snap back to its state
      })
    }
  }

  const dropPosition = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  }

  // Re-check every priority and clear the search so the whole board is
  // visible while placing
  const showAllTasks = () => {
    setVisiblePriorities(Object.fromEntries(PRIORITIES.map((p) => [p, true])))
    setSearchQuery('')
  }

  const handleDragStart = (event, cardId) => {
    event.dataTransfer.setData('text/plain', String(cardId))
    event.dataTransfer.effectAllowed = 'move'
    // Deferred alongside setDraggingId: re-rendering (unhiding cards) during
    // dragstart makes Chrome cancel the drag
    setTimeout(() => {
      setDraggingId(cardId)
      showAllTasks()
    }, 0)
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
    const draggedId = event.dataTransfer.getData('text/plain')
    const position = dropPosition(event)
    clearDragState()
    if (draggedId && draggedId !== card.id) {
      setCards((prev) => moveCard(prev, draggedId, card.column, card.id, position))
      moveTask(draggedId, { column: card.column, targetId: card.id, position }).catch((error) => {
        console.error(error)
        setErrorMessage('Could not save that move — the board was restored.')
        refreshCards() // failed on the server — snap back to its state
      })
    }
  }

  // For drags over a column's non-card areas. Tells which card is directly
  // below the cursor, so that the indicator can highlight where the dragged
  // card will be placed. Null means the cursor is below every card -> append to the end.
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
    const draggedId = event.dataTransfer.getData('text/plain')
    const targetId = findCardBelowCursor(event)
    clearDragState()
    if (draggedId) {
      setCards((prev) => moveCard(prev, draggedId, column, targetId, 'before'))
      moveTask(draggedId, { column, targetId, position: 'before' }).catch((error) => {
        console.error(error)
        setErrorMessage('Could not save that move — the board was restored.')
        refreshCards() // failed on the server — snap back to its state
      })
    }
  }

  const cardClass = (card) => {
    let cls = 'card'
    if (card.priority) cls += ` priority-${card.priority.toLowerCase()}`
    if (card.id === draggingId) cls += ' dragging'
    if (indicator?.targetId === card.id) cls += ` indicate-${indicator.position}`
    return cls
  }

  const errorToast = errorMessage && (
    <div className="error-toast" role="alert">
      <span>{errorMessage}</span>
      <button onClick={() => setErrorMessage(null)} aria-label="Dismiss">
        ✕
      </button>
    </div>
  )

  const loadingScreen = (message) => (
    <div className="loading-screen">
      <div className="spinner" />
      <p>{message}</p>
      {errorToast}
    </div>
  )

  if (checking) {
    return loadingScreen('Loading...')
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

  if (boardLoading) {
    return loadingScreen('Loading your board...')
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
      <aside className="filter-panel">
        <input
          type="search"
          className="search-input"
          placeholder="Search tasks"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <h2>Priority</h2>
        {PRIORITIES.map((priority) => (
          <label key={priority} className={`filter-option ${priority.toLowerCase()}`}>
            <input
              type="checkbox"
              checked={visiblePriorities[priority]}
              onChange={() =>
                setVisiblePriorities((prev) => ({ ...prev, [priority]: !prev[priority] }))
              }
            />
            <span className="dot" />
            {priority}
          </label>
        ))}
      </aside>
      <div className="columns">
        {COLUMNS.map((column) => {
          const query = searchQuery.trim().toLowerCase()
          const columnCards = cards
            .filter((card) => card.column === column)
            .filter((card) => !card.priority || visiblePriorities[card.priority])
            .filter((card) => !query || card.text.toLowerCase().includes(query))
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
              <h2>
                {column}
                <span className="count">{columnCards.length}</span>
              </h2>
              <div className="cards">
                {columnCards.length === 0 && (
                  <p className="empty-hint">Drop tasks here</p>
                )}
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
          <select
            value={newPriority}
            onChange={(event) => setNewPriority(event.target.value)}
          >
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
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
          onClick={() => {
            showAllTasks()
            setShowCreateForm(true)
          }}
        >
          Create Task
        </button>
      )}
      {errorToast}
    </main>
  )
}

export default App
