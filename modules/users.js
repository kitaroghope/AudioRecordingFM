/**
 * User accounts
 * @module modules/users
 *
 * Passwords are hashed with scrypt from Node's built-in crypto module — no
 * extra dependency, and scrypt is memory-hard so it resists GPU cracking far
 * better than a plain SHA pass.
 *
 * Stored shape in the `radio.users` collection:
 *   { username, usernameLower, salt, hash, role, createdAt }
 *
 * `usernameLower` is stored alongside `username` so lookups stay
 * case-insensitive without relying on a Mongo collation.
 */

const crypto = require('crypto');
const db = require('./mongoDBApi');

const DB_NAME = 'radio';
const COLLECTION = 'users';

const SCRYPT_PARAMS = {
    N: 16384,        // CPU/memory cost
    r: 8,            // block size
    p: 1,            // parallelisation
    maxmem: 64 * 1024 * 1024
};
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

const USERNAME_MIN = 3;
const USERNAME_MAX = 32;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;

/**
 * Validate registration input.
 *
 * @param {string} username
 * @param {string} password
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateCredentials(username, password) {
    const errors = [];

    if (typeof username !== 'string' || !username.trim()) {
        errors.push('Username is required.');
    } else if (username.trim().length < USERNAME_MIN) {
        errors.push('Username must be at least ' + USERNAME_MIN + ' characters.');
    } else if (username.trim().length > USERNAME_MAX) {
        errors.push('Username must be ' + USERNAME_MAX + ' characters or fewer.');
    } else if (!/^[a-zA-Z0-9._-]+$/.test(username.trim())) {
        errors.push('Username may only contain letters, numbers, dots, dashes and underscores.');
    }

    if (typeof password !== 'string' || !password) {
        errors.push('Password is required.');
    } else if (password.length < PASSWORD_MIN) {
        errors.push('Password must be at least ' + PASSWORD_MIN + ' characters.');
    } else if (password.length > PASSWORD_MAX) {
        errors.push('Password is too long.');
    }

    return { valid: errors.length === 0, errors: errors };
}

/**
 * Hash a password with a fresh random salt.
 *
 * @param {string} password
 * @returns {{salt: string, hash: string}}
 */
function hashPassword(password) {
    const salt = crypto.randomBytes(SALT_BYTES);
    const derived = crypto.scryptSync(password, salt, KEY_LENGTH, SCRYPT_PARAMS);
    return {
        salt: salt.toString('hex'),
        hash: derived.toString('hex')
    };
}

/**
 * Check a password against a stored salt/hash.
 *
 * @param {string} password
 * @param {string} saltHex
 * @param {string} hashHex
 * @returns {boolean}
 */
function verifyPassword(password, saltHex, hashHex) {
    try {
        const salt = Buffer.from(saltHex, 'hex');
        const expected = Buffer.from(hashHex, 'hex');
        const derived = crypto.scryptSync(password, salt, expected.length || KEY_LENGTH, SCRYPT_PARAMS);

        if (derived.length !== expected.length) return false;
        // Constant-time compare so a wrong password cannot be discovered by timing.
        return crypto.timingSafeEqual(derived, expected);
    } catch (error) {
        return false;
    }
}

/**
 * Look up a user by name, case-insensitively.
 *
 * @param {string} username
 * @returns {Promise<Object|null>}
 */
async function findByUsername(username) {
    if (typeof username !== 'string' || !username.trim()) return null;

    const result = await db.readRow({ usernameLower: username.trim().toLowerCase() }, DB_NAME, COLLECTION);
    // readRow resolves to { listing, found, err } — not readRows' { listings }.
    return (result && result.found && result.listing) ? result.listing : null;
}

/**
 * How many accounts already exist. Used to bootstrap the first admin.
 *
 * @returns {Promise<number>}
 */
async function countUsers() {
    const result = await db.readRows({}, DB_NAME, COLLECTION);
    const rows = result && Array.isArray(result.listings) ? result.listings : [];
    return rows.length;
}

/**
 * Create an account.
 *
 * @param {{username: string, password: string, role?: string}} input
 * @returns {Promise<{ok: boolean, user?: Object, errors?: string[], status?: number}>}
 */
async function createUser(input) {
    const username = (input.username || '').trim();
    const validation = validateCredentials(username, input.password);

    if (!validation.valid) {
        return { ok: false, status: 400, errors: validation.errors };
    }

    const existing = await findByUsername(username);
    if (existing) {
        return {
            ok: false,
            status: 409,
            errors: ['That username is already taken. Please choose another.']
        };
    }

    // The very first account becomes the administrator. Everyone after that
    // is a regular user until an admin promotes them.
    let role = input.role;
    if (!role) {
        const total = await countUsers();
        role = total === 0 ? 'admin' : 'user';
    }

    const { salt, hash } = hashPassword(input.password);

    const document = {
        username: username,
        usernameLower: username.toLowerCase(),
        salt: salt,
        hash: hash,
        role: role,
        createdAt: new Date().toISOString()
    };

    await db.createListing(document, DB_NAME, COLLECTION);

    return {
        ok: true,
        user: { username: username, role: role, createdAt: document.createdAt }
    };
}

/**
 * Verify credentials against the database.
 *
 * @param {string} username
 * @param {string} password
 * @returns {Promise<Object|null>} The user record when valid, otherwise null.
 */
async function authenticate(username, password) {
    const user = await findByUsername(username);
    if (!user || !user.salt || !user.hash) return null;

    if (!verifyPassword(password, user.salt, user.hash)) return null;

    return {
        username: user.username,
        role: user.role || 'user',
        createdAt: user.createdAt
    };
}

module.exports = {
    validateCredentials,
    hashPassword,
    verifyPassword,
    findByUsername,
    countUsers,
    createUser,
    authenticate,
    PASSWORD_MIN,
    USERNAME_MIN
};
