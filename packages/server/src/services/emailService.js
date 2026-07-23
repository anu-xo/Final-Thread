// packages/server/src/services/emailService.js
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import User from '../models/User.js';
import CommunityMember from '../models/CommunityMember.js';
import Post from '../models/Post.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const transporter = nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587,
  auth: {
    user: 'apikey',
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

function buildDigestHtml({ username, posts, unsubscribeUrl }) {
  const siteUrl = process.env.CLIENT_URL || 'https://threadverse.app';

  const postCards = posts.map((p, i) => `
    <tr>
      <td style="padding:16px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f8fa;border-radius:8px;border:1px solid #e2e5ea;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">
                ${p.community?.name || 'Community'}
              </p>
              <p style="margin:0 0 8px;font-size:17px;font-weight:700;color:#111827;">
                <a href="${siteUrl}/c/${p.community?.slug}/post/${p._id}" style="color:#111827;text-decoration:none;">${p.title}</a>
              </p>
              <table cellpadding="0" cellspacing="0" style="font-size:13px;color:#6b7280;">
                <tr>
                  <td style="padding-right:16px;">&#9650; ${p.score} pts</td>
                  <td>&#128172; ${p.commentCount} comments</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px 0;">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 24px;text-align:center;">
              <h1 style="margin:0;font-size:24px;color:#ffffff;font-weight:800;">ThreadVerse</h1>
              <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.85);">Your Weekly Digest</p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:28px 24px 8px;">
              <p style="margin:0;font-size:16px;color:#374151;">Hey <strong>${username}</strong>,</p>
              <p style="margin:8px 0 0;font-size:15px;color:#6b7280;">Here are the top posts from your communities this week.</p>
            </td>
          </tr>

          <!-- Post Cards -->
          ${postCards}

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:12px 24px 28px;">
              <a href="${siteUrl}" style="display:inline-block;padding:12px 32px;background-color:#6366f1;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">Browse ThreadVerse</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 24px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                You received this because you opted in to weekly digests.<br>
                <a href="${unsubscribeUrl}" style="color:#6366f1;text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendDigestEmail({ to, username, posts, unsubscribeUrl }) {
  const html = buildDigestHtml({ username, posts, unsubscribeUrl });
  await transporter.sendMail({
    from: '"ThreadVerse" <noreply@threadverse.app>',
    to,
    subject: 'Your ThreadVerse Weekly Digest',
    html,
  });
}

export async function sendWeeklyDigest() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  let sent = 0, skipped = 0, failed = 0;

  const users = await User.find({ 'notifPrefs.digest': true, isBanned: false })
    .select('username email')
    .lean();

  for (const user of users) {
    try {
      const memberships = await CommunityMember.find({ user: user._id })
        .select('community')
        .lean();
      const communityIds = memberships.map((m) => m.community);
      if (!communityIds.length) { skipped++; continue; }

      const topPosts = await Post.aggregate([
        { $match: { community: { $in: communityIds }, createdAt: { $gte: sevenDaysAgo }, isRemoved: false } },
        { $sort: { score: -1 } },
        { $group: { _id: '$community', posts: { $push: '$$ROOT' } } },
        { $project: { posts: { $slice: ['$posts', 5] } } },
        { $unwind: '$posts' },
        { $replaceRoot: { newRoot: '$posts' } },
        { $lookup: { from: 'communities', localField: 'community', foreignField: '_id', as: 'community' } },
        { $unwind: '$community' },
        { $project: { title: 1, score: 1, commentCount: 1, 'community.name': 1, 'community.slug': 1 } },
      ]);

      if (!topPosts.length) { skipped++; continue; }

      const unsubToken = jwt.sign(
        { userId: user._id, purpose: 'digest-unsub' },
        process.env.JWT_UNSUB_SECRET,
        { expiresIn: '30d' },
      );

      await sendDigestEmail({
        to: user.email,
        username: user.username,
        posts: topPosts,
        unsubscribeUrl: `${process.env.APP_URL}/api/email/unsubscribe?token=${unsubToken}`,
      });
      sent++;
    } catch (err) {
      console.error(`[digestCron] failed to send digest to ${user.email}:`, err.message);
      failed++;
    }
  }

  return { sent, skipped, failed };
}