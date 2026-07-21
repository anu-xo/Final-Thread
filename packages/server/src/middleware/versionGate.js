import semver from 'semver';

const MIN_VERSION = '1.0.0';

export function versionGate(req, res, next) {
  const platform = req.headers['x-app-platform'];
  const version = req.headers['x-app-version'];

  if (platform !== 'electron' || !version) return next();

  if (!semver.valid(version) || semver.lt(version, MIN_VERSION)) {
    return res.status(426).json({
      data: null,
      error: {
        code: 'UPGRADE_REQUIRED',
        message: 'This version of ThreadVerse Desktop is no longer supported.',
      },
      meta: {
        minimum: MIN_VERSION,
        downloadUrl: 'https://github.com/anu-xo/Final-Thread.git/releases/latest',
      },
    });
  }
  next();
}
