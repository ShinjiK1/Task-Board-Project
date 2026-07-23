const express = require("express");

const app = express();
const PORT = 5173;

app.get("/", (req, res) => {
    res.send("This is the server base address");
})

app.listen(PORT, () => {
    console.log(`Running on port ${PORT}`);
})