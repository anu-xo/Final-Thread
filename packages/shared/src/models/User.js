import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username:      { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 20 },
  email:         { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash:  { type: String, required: true },
  karma:         { type: Number, default: 0 },
  role:          { type: String, enum: ['user', 'mod', 'admin'], default: 'user' },
  refreshTokens: [{ type: String }],   // array enables rotation + blacklisting
  bio:           { type: String, maxlength: 300 },
  avatar:        { type: String },
  notifPrefs: {
    digest:    { type: Boolean, default: true },
    replies:   { type: Boolean, default: true },
    mentions:  { type: Boolean, default: true },
  },
}, { timestamps: true });

export default mongoose.model('User', userSchema);