const crypto = require('crypto');

// Get encryption key from environment or generate a warning
const ENCRYPTION_KEY = process.env.SSH_KEY_ENCRYPTION_SECRET;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  console.error('[SECURITY] FATAL: SSH_KEY_ENCRYPTION_SECRET must be set and at least 32 characters');
  console.error('[SECURITY] Set a secure key: export SSH_KEY_ENCRYPTION_SECRET=$(openssl rand -base64 32)');
  process.exit(1);
}

// Derive a 32-byte key from the secret using SHA-256
const deriveKey = (secret) => {
  return crypto.createHash('sha256').update(secret).digest();
};

const KEY = deriveKey(ENCRYPTION_KEY);
const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypt sensitive data (SSH private keys, passwords)
 * Uses AES-256-GCM for authenticated encryption
 */
function encrypt(text) {
  if (!text) return null;
  
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Return iv + authTag + encrypted data
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('[ENCRYPTION] Encryption failed:', error);
    throw new Error('Failed to encrypt sensitive data');
  }
}

/**
 * Decrypt sensitive data
 * Verifies authenticity using GCM auth tag
 */
function decrypt(encryptedData) {
  if (!encryptedData) return null;
  
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      // Legacy: unencrypted data
      return encryptedData;
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('[ENCRYPTION] Decryption failed:', error);
    throw new Error('Failed to decrypt sensitive data - possible tampering');
  }
}

/**
 * Check if data is already encrypted
 */
function isEncrypted(data) {
  if (!data) return false;
  return data.includes(':') && data.split(':').length === 3;
}

/**
 * Securely clear sensitive data from memory
 * Note: This is best-effort in JavaScript due to garbage collection
 */
function secureClear(buffer) {
  if (Buffer.isBuffer(buffer)) {
    buffer.fill(0);
  } else if (typeof buffer === 'string') {
    // Can't truly clear strings in JS, but we can overwrite the variable
    buffer = '';
  }
}

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  secureClear
};
