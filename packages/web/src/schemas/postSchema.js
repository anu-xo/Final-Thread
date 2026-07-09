// schemas/postSchema.js
import { z } from 'zod';

export const postSchema = z.object({
  title: z.string().min(1, 'Title is required').max(300, 'Title too long'),
  postType: z.enum(['text', 'link', 'image']),
  body: z.string().optional(),
  linkUrl: z.string().url('Enter a valid URL').optional().or(z.literal('')),
  communityId: z.string().min(1, 'Choose a community'),
  flairId: z.string().optional(),
  media: z.array(z.string()).optional(),
}).refine(
  (data) => data.postType !== 'link' || (data.linkUrl && data.linkUrl.length > 0),
  { message: 'Link URL is required for link posts', path: ['linkUrl'] }
).refine(
  (data) => data.postType !== 'text' || (data.body && data.body.trim().length > 0),
  { message: 'Body is required for text posts', path: ['body'] }
).refine(
  (data) => data.postType !== 'image' || (data.media && data.media.length > 0),
  { message: 'Add at least one image for image posts', path: ['media'] }
);