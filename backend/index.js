const express = require("express");

const app = express();
const PORT = 3001;

app.use(express.json());
app.use('/api/tasks', require('./routes/tasks'));

app.get("/", (req, res) => {
    res.send("This is the server base address");
})

module.exports = app;

// Listen only when run directly (npm run dev / nodemon). When imported by
// the Vercel serverless wrapper, no port is opened — Vercel passes requests
// to the exported app itself.
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Running on port ${PORT}`);
    });
}