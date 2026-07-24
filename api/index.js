// Vercel serverless entry point: every /api/* request invokes the Express
// app, which handles routing exactly as it does locally.
module.exports = require('../backend/index.js');
