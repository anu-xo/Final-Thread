import { Router } from 'express';

const router = Router();

const GITHUB_REPO = 'https://github.com/anu-xo/Final-Thread/releases/download';

const VERSION_INFO = {
  minimum: '1.0.0',
  latest: '1.0.0',
  downloadUrl: `${GITHUB_REPO}/v1.0.0`,
  platforms: {
    windows: `${GITHUB_REPO}/v1.0.0/ThreadVerse-Setup-1.0.0.exe`,
    mac: `${GITHUB_REPO}/v1.0.0/ThreadVerse-1.0.0.dmg`,
    linux: `${GITHUB_REPO}/v1.0.0/ThreadVerse-1.0.0.AppImage`,
  },
};

/**
 * @openapi
 * /desktop/version:
 *   get:
 *     tags: [Desktop]
 *     summary: Get latest desktop version info and per-platform download URLs
 *     responses:
 *       200:
 *         description: Version metadata with download links
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         minimum:
 *                           type: string
 *                           example: "1.0.0"
 *                         latest:
 *                           type: string
 *                           example: "1.0.0"
 *                         downloadUrl:
 *                           type: string
 *                           format: uri
 *                         platforms:
 *                           type: object
 *                           properties:
 *                             windows:
 *                               type: string
 *                               format: uri
 *                             mac:
 *                               type: string
 *                               format: uri
 *                             linux:
 *                               type: string
 *                               format: uri
 */
router.get('/version', (req, res) => {
  res.json({ data: VERSION_INFO, error: null, meta: null });
});

export default router;
