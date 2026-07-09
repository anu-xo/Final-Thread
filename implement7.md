FS Track — Media Upload Pipeline
Why Cloudinary and not storing files on your own server or in MongoDB: MongoDB Atlas M0 has a 512MB storage cap — images would eat that fast. A direct-to-Cloudinary upload also means your Express server never has to buffer large file payloads, which matters on a free-tier Render instance with limited memory.

// packages/server/src/routes/upload.js
const cloudinary = require('cloudinary').v2;

router.post('/sign', authMiddleware, (req, res) => {
  const timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder: 'threadverse/posts' },
    process.env.CLOUDINARY_API_SECRET
  );

  res.json({
    data: {
      signature,
      timestamp,
      apiKey: process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      folder: 'threadverse/posts'
    },
    error: null,
    meta: null
  });
});

FE flow: request signature → POST the file directly to https://api.cloudinary.com/v1_1/{cloudName}/image/upload with the signed params → get back a CDN URL → save that URL onto Post.media. Your server never touches the raw file bytes.
Desktop variant: instead of an <input type="file">, call window.electronAPI.selectFile() (already whitelisted in your Day 3 preload bridge) → main process runs dialog.showOpenDialog → returns a local file path → renderer reads it (fs isn't available in renderer with contextIsolation: true, so main process should read and return the buffer, or renderer uses a plain <input> under the hood — either works, just keep nodeIntegration: false) → same Cloudinary signed-upload call from there.