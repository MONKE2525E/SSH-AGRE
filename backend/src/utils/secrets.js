const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SECRETS_PATH = path.join(__dirname, '../../data/secrets.json');

/**
 * Ensures that critical security secrets exist.
 * If not found in environment variables or data file, they are generated.
 */
function initializeSecrets() {
  let secrets = {};

  // 1. Try to load existing secrets from disk
  if (fs.existsSync(SECRETS_PATH)) {
    try {
      secrets = JSON.parse(fs.readFileSync(SECRETS_PATH, 'utf8'));
      console.log('[SECURITY] Loaded persistent secrets from data/secrets.json');
    } catch (err) {
      console.error('[SECURITY] Error reading secrets.json:', err);
    }
  }

  // 2. Map of required secrets and their environment variable names
  const required = {
    JWT_SECRET: 'JWT_SECRET',
    SSH_KEY_ENCRYPTION_SECRET: 'SSH_KEY_ENCRYPTION_SECRET'
  };

  let updated = false;

  for (const [key, envName] of Object.entries(required)) {
    // Priority: 1. Environment Variable, 2. File on Disk, 3. Generate New
    if (process.env[envName] && process.env[envName].length >= 32) {
      secrets[key] = process.env[envName];
    } else if (!secrets[key] || secrets[key].length < 32) {
      console.log(`[SECURITY] Generating new random ${envName}...`);
      secrets[key] = crypto.randomBytes(48).toString('base64');
      updated = true;
    }
    
    // Inject into process.env so the rest of the app can use it
    process.env[envName] = secrets[key];
  }

  // 3. Persist if we generated new ones
  if (updated) {
    try {
      fs.writeFileSync(SECRETS_PATH, JSON.stringify(secrets, null, 2), { mode: 0o600 });
      console.log('[SECURITY] Persistent secrets saved to data/secrets.json');
    } catch (err) {
      console.error('[SECURITY] Failed to save secrets to disk:', err);
    }
  }

  return secrets;
}

module.exports = { initializeSecrets };
