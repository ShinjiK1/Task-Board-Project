const express = require("express");
const supabaseForUser = require("../lib/supabase");

const router = express.Router();

// Converts from DB task format to the task format that the frontend renders
const toCard = (row) => ({
    id: row.id,
    text: row.title,
    column: row.status,
    order: row.column_order,
    priority: row.priority
});

async function fetchCards(supabase) {
    const {data, error} = await supabase.from("Tasks").select('*');
    if (error) {
        throw new Error(error.message);
    }
    return data.map(toCard);
}

// When moving a card from one column to another, we need to first remove it from
// that column and then decrement column_order by 1 for all cards below/after the card
// in the column. Then we need to add our card to the place that the user placed the card
// in the new column (targetId, is the card we are placing our card next to, with position
// being whether our moved card goes before/after the targetId card) and then increment
// column_order by 1 for all cards below our new card.
function moveCard(cards, draggedId, toColumn, targetId, position) {
    const dragged = cards.find((c) => c.id === draggedId);
    if (!dragged || draggedId === targetId) {
        return cards;
    }
    
    // Function to get the order of any card after removing the dragged card from its original spot
    const adjusted = (c) => 
        (c.column === dragged.column && c.order > dragged.order) ? c.order - 1 : c.order;

    let insertOrder;
    if (targetId === null) {
        //Last position in column
        insertOrder = cards.filter((c) => c.column === toColumn && c.id !== draggedId).length + 1;
    }
    else {
        const target = cards.find((c) => c.id === targetId);
        if (!target) {
            return cards;
        }
        insertOrder = position === 'before' ? adjusted(target) : adjusted(target) + 1;
    }

    return cards.map((c) => {
        if (c.id === draggedId) {
            return {...c, column: toColumn, order: insertOrder};
        }
        //If the card is placed ahead of where the new card was dropped, increment order
        const increment = (c.column === toColumn && adjusted(c) >= insertOrder) ? 1 : 0;
        const newOrder = adjusted(c) + increment;
        return {...c, order: newOrder};
    })
}

// Shifts every card that sat below the removed card up by one
function closeGapAfterDelete(cards, removed) {
    return cards.map((c) =>
        c.column === removed.column && c.order > removed.order
            ? {...c, order: c.order - 1}
            : c
    );
}

// Writes back every card whose column/order differs between the two states
async function applyChanges(supabase, before, after) {
    for (const card of after) {
        const prev = before.find((c) => c.id === card.id);
        if (!prev || prev.column !== card.column || prev.order !== card.order) {
            const {error} = await supabase
                .from("Tasks")
                .update({status: card.column, column_order: card.order})
                .eq('id', card.id);
            if (error) {
                throw new Error(error.message);
            }
        }
    }
}

router.get('/', async (req, res) => {
    const supabase = supabaseForUser(req);
    try {
        const cards = await fetchCards(supabase);
        res.json(cards);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({error: error.message});
    }
});

router.post('/', async (req, res) => {
    const supabase = supabaseForUser(req);
    const {data, error} = await supabase.from("Tasks").insert({
        title: req.body.title, status: req.body.status, user_id: req.body.user_id,
        column_order: req.body.column_order, priority: req.body.priority
    }).select().single();
    if (error) {
        console.error(error);
        return res.status(500).json({error: error.message});
    }
    res.status(201).json(data);
});

router.post('/:id/move', async (req, res) => {
    const supabase = supabaseForUser(req);
    try {
        const cards = await fetchCards(supabase);
        const afterMove = moveCard(
            cards,
            req.params.id,
            req.body.column,
            req.body.targetId ?? null,
            req.body.position
        );
        await applyChanges(supabase, cards, afterMove);
        res.json({ok: true});
    }
    catch (error) {
        console.error(error);
        res.status(500).json({error: error.message});
    }
});

router.delete('/:id', async (req, res) => {
    const supabase = supabaseForUser(req);
    const id = req.params.id;
    try {
        const cards = await fetchCards(supabase);
        const removed = cards.find((c) => c.id === id);
        if (!removed) {
            return res.status(404).json({error: 'Task not found'});
        }
        const {error} = await supabase.from("Tasks").delete().eq('id', id);
        if (error) {
            throw new Error(error.message);
        }
        const remaining = cards.filter((c) => c.id !== id);
        await applyChanges(supabase, remaining, closeGapAfterDelete(remaining, removed));
        res.json({ok: true});
    } catch (err) {
        console.error(err);
        res.status(500).json({error: err.message});
    }
})

module.exports = router;
