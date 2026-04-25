/**
 * Authentication Middleware - JWT token verification
 * @module middleware/auth
 */

const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * Middleware to verify JWT token from Authorization header or cookie
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const verifyToken = (req, res, next) => {
    // Get token from Authorization header (Bearer token) or from cookie
    const authHeader = req.headers.authorization;
    const tokenFromCookie = req.cookies?.token;

    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
    } else if (tokenFromCookie) {
        token = tokenFromCookie;
    }

    if (!token) {
        return res.status(401).json({
            error: 'Authentication Required',
            message: 'You need to be logged in to perform this action. Please click the Login button and enter your credentials.',
            hint: 'If you are not logged in, you will not be able to add, edit, or delete programs.'
        });
    }

    try {
        const decoded = jwt.verify(token, config.jwt.secret);
        req.user = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Session Expired',
                message: 'Your login session has expired for security reasons.',
                hint: 'Please log in again to continue. Your session expires after 24 hours by default.',
                action: 'Please click Login and enter your credentials to continue.'
            });
        }
        return res.status(401).json({
            error: 'Invalid Authentication',
            message: 'We could not verify your identity.',
            hint: 'This might happen if your login credentials are incorrect or the session is corrupted.',
            action: 'Please log out completely and log in again with your correct username and password.'
        });
    }
};

/**
 * Optional authentication middleware - sets req.user if token exists but doesn't require it
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const tokenFromCookie = req.cookies?.token;

    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
    } else if (tokenFromCookie) {
        token = tokenFromCookie;
    }

    if (token) {
        try {
            const decoded = jwt.verify(token, config.jwt.secret);
            req.user = decoded;
        } catch (err) {
            // Token invalid but optional, continue without user
        }
    }

    next();
};

module.exports = {
    verifyToken,
    optionalAuth
};
