import { Router } from 'express';

const router = Router();

const VERSION_INFO = {
  minimum: '1.0.0',
  latest: '1.0.0',
  downloadUrl: 'https://github.com/anu-xo/Final-Thread.git/releases/latest',
};

router.get('/version', (req, res) => {
  res.json({ data: VERSION_INFO, error: null, meta: null });
});

export default router;
