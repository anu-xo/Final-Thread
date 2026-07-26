import mongoose from 'mongoose';

const performanceLogSchema = new mongoose.Schema({
  endpoint: String,
  ttftMs: Number,
  createdAt: { type: Date, default: Date.now },
});

const PerformanceLog = mongoose.model('PerformanceLog', performanceLogSchema);
export default PerformanceLog;
