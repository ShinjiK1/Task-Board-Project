const express = require("express");

const app = express();
const PORT = 3001;

app.use(express.json());
app.use('/api/tasks', require('./routes/tasks'));

app.get("/", (req, res) => {
    res.send("This is the server base address");
})

app.listen(PORT, () => {
    console.log(`Running on port ${PORT}`);
})