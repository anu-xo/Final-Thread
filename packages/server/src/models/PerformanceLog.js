// server/src/models/PerformanceLog.js
const mongoose = require('mongoose');
const performanceLogSchema = new mongoose.Schema({
  endpoint: String,
  ttftMs: Number,
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('PerformanceLog', performanceLogSchema);