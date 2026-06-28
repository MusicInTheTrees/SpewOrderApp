const { loadTokens } = require('../auth/oauth');

function requireAuth(req, res, next) {
  const tokens = loadTokens();
  if (!tokens || !tokens.refresh_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

module.exports = requireAuth;
