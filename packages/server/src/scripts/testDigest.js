import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

import { sendWeeklyDigest } from '../services/emailService.js';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const result = await sendWeeklyDigest();
  console.log('Digest result:', result);

  await mongoose.disconnect();
  console.log('Done');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
