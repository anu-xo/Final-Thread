// packages/server/src/services/emailService.js
import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Post from '../models/Post.js';
import Comment from '../models/Comment.js';

// Recreate __dirname for ES modules to find your .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const transporter = nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587,
  auth: {
    user: 'apikey', // literal string, per SendGrid SMTP docs
    pass: process.env.SENDGRID_API_KEY,
  },
});

export async function sendVerificationEmail(toEmail, token) {
  const verifyUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}`;
  await transporter.sendMail({
    from: '"ThreadVerse" <noreply@threadverse.app>',
    to: toEmail,
    subject: 'Verify your ThreadVerse account',
    html: `<p>Click <a href="${verifyUrl}">here</a> to verify your email. This link expires in 1 hour.</p>`,
  });
}

export async function sendPasswordResetEmail(toEmail, token) {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
  await transporter.sendMail({
    from: '"ThreadVerse" <noreply@threadverse.app>',
    to: toEmail,
    subject: 'Reset your ThreadVerse password',
    html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 30 minutes.</p>`,
  });
}

export async function sendWeeklyDigest() {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const users = await User.find({
    'notifPrefs.digest': true,
    isBanned: false,
  }).select('username email');

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const posts = await Post.find({
        author: user._id,
        createdAt: { $gte: oneWeekAgo },
        isDeleted: false,
      }).select('title score commentCount createdAt');

      const comments = await Comment.find({
        author: user._id,
        createdAt: { $gte: oneWeekAgo },
        isRemoved: false,
      }).select('body post createdAt');

      if (posts.length === 0 && comments.length === 0) {
        skipped++;
        continue;
      }

      const postRows = posts.length
        ? `<ul>${posts.map((p) =>
            `<li><strong>${p.title}</strong> — ${p.score} pts, ${p.commentCount} comments</li>`
          ).join('')}</ul>`
        : '<p>No new posts this week.</p>';

      const commentRows = comments.length
        ? `<p>You left ${comments.length} comment${comments.length > 1 ? 's' : ''} this week.</p>`
        : '';

      const siteUrl = process.env.CLIENT_URL || 'https://threadverse.app';

      await transporter.sendMail({
        from: '"ThreadVerse" <noreply@threadverse.app>',
        to: user.email,
        subject: 'Your ThreadVerse Weekly Digest',
        html: `
          <h2>Hey ${user.username}, here's your week on ThreadVerse</h2>
          <h3>Posts</h3>
          ${postRows}
          ${commentRows}
          <p><a href="${siteUrl}">Visit ThreadVerse</a></p>
        `,
      });
      sent++;
    } catch (err) {
      console.error(`[digestCron] failed to send digest to ${user.email}:`, err.message);
      failed++;
    }
  }

  return { sent, skipped, failed };
}