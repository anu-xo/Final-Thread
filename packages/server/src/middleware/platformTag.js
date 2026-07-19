export function platformTag(req, res, next) {
  req.platform = req.headers['x-app-platform'] === 'electron' ? 'desktop' : 'web';
  req.appVersion = req.headers['x-app-version'] || null;
  next();
}
