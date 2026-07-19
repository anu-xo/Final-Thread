// packages/server/src/routes/sitemap.js
import { Router } from 'express';
import Community from '../models/Community.js';
import Post from '../models/Post.js';

const router = Router();

router.get('/sitemap.xml', async (req, res) => {
  const [communities, posts] = await Promise.all([
    Community.find({}).select('slug').lean(),
    Post.find({ isRemoved: false })
      .select('_id updatedAt')
      .limit(5000)
      .lean(),
  ]);

  const base =
    process.env.PUBLIC_URL || 'https://threadverse.example.com';

  const urls = [
    `${base}/`,
    ...communities.map((c) => `${base}/community/${c.slug}`),
    ...posts.map((p) => `${base}/post/${p._id}`),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml');
  res.send(xml);
});

export default router;