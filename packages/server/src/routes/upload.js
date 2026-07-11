// packages/server/src/routes/upload.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import cloudinary from '../config/cloudinary.js';

const router = express.Router();

router.post('/sign', authMiddleware, (req, res) => {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const folder = 'threadverse/posts';

    // Guard clause to ensure Cloudinary credentials are set up
    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(500).json({
        data: null,
        error: 'Cloudinary is not configured on the server',
        meta: null,
      });
    }

    const timestamp = Math.round(Date.now() / 1000);
    
    // Generate the secure signature using the v2 SDK utility
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder },
      apiSecret
    );

    return res.json({
      data: {
        signature,
        timestamp,
        apiKey,
        cloudName,
        folder,
      },
      error: null,
      meta: null,
    });
  } catch (err) {
    console.error('Cloudinary signature error:', err);
    return res.status(500).json({
      data: null,
      error: 'Failed to generate upload signature',
      meta: null,
    });
  }
});

export default router;