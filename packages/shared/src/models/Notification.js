import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:       { type: String, enum: ['reply', 'mention', 'mod_action', 'ai_response'], required: true },
  actor:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  target:     { type: mongoose.Schema.Types.ObjectId },
  targetType: { type: String, enum: ['post', 'comment'] },
  read:       { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model('Notification', notificationSchema);