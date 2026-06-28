import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  reporter:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  target:     { type: mongoose.Schema.Types.ObjectId, required: true },
  targetType: { type: String, enum: ['post', 'comment'], required: true },
  reason:     { type: String, required: true },
  detail:     { type: String },
  status:     { type: String, enum: ['pending', 'approved', 'removed', 'dismissed'], default: 'pending' },
  community:  { type: mongoose.Schema.Types.ObjectId, ref: 'Community', required: true },
}, { timestamps: true });

export default mongoose.model('Report', reportSchema);