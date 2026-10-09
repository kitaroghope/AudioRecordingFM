/**
 * Configuration Module - Centralized configuration with environment variable support
 * @module config
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

// Load base config from config.json
const configPath = path.join(__dirname, 'config.json');
let baseConfig = {};

if (fs.existsSync(configPath)) {
    baseConfig = require('./config.json');
}

// Environment variable resolver with fallback to config.json
const env = (key, defaultValue = null) => {
    return process.env[key] || defaultValue;
};

module.exports = {
    mongoDB: {
        url: env('MONGODB_URL', baseConfig.mongoDB?.url)
    },
    mySQL: {
        host: env('MYSQL_HOST', baseConfig.mySQL?.host),
        user: env('MYSQL_USER', baseConfig.mySQL?.user),
        password: env('MYSQL_PASSWORD', baseConfig.mySQL?.password),
        database: env('MYSQL_DATABASE', baseConfig.mySQL?.database)
    },
    ftp: {
        host: env('FTP_HOST', baseConfig.ftp?.host),
        port: env('FTP_PORT', baseConfig.ftp?.port || '21'),
        username: env('FTP_USERNAME', baseConfig.ftp?.username),
        password: env('FTP_PASSWORD', baseConfig.ftp?.password)
    },
    mailer: {
        user: env('MAILER_USER', baseConfig.mailer?.user),
        pass: env('MAILER_PASS', baseConfig.mailer?.pass)
    },
    jwt: {
        secret: env('JWT_SECRET', baseConfig.sessionSecret || 'dev_secret_change_in_production'),
        expiresIn: env('JWT_EXPIRES_IN', '24h')
    },
    server: {
        port: env('PORT', '3000'),
        nodeEnv: env('NODE_ENV', 'development')
    },
    cors: {
        origins: env('CORS_ORIGINS', '*').split(',').map(o => o.trim())
    },
    radios: baseConfig.radios || {}
};
