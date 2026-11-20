/** Centralized configuration loaded from environment variables and .env. */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const env = (key, defaultValue = null) => process.env[key] || defaultValue;

module.exports = {
    mongoDB: { url: env('MONGODB_URL') },
    mySQL: {
        host: env('MYSQL_HOST', 'sql311.epizy.com'),
        user: env('MYSQL_USER'),
        password: env('MYSQL_PASSWORD'),
        database: env('MYSQL_DATABASE', 'epiz_34259151_newlugandahymnal')
    },
    ftp: {
        host: env('FTP_HOST', 'ftpupload.net'),
        port: env('FTP_PORT', '21'),
        username: env('FTP_USERNAME'),
        password: env('FTP_PASSWORD')
    },
    mailer: { user: env('MAILER_USER'), pass: env('MAILER_PASS') },
    jwt: {
        secret: env('JWT_SECRET', 'dev_secret_change_in_production'),
        expiresIn: env('JWT_EXPIRES_IN', '24h')
    },
    server: { port: env('PORT', '3000'), nodeEnv: env('NODE_ENV', 'development') },
    cors: { origins: env('CORS_ORIGINS', '*').split(',').map(o => o.trim()) },
    radios: {
        cbs: env('RADIO_CBS_URL', 'https://s5.voscast.com:9909/EYOBUJJAJJA'),
        prime: env('RADIO_PRIME_URL', 'https://stream10.awr.live/listen/primeradio/web'),
        avento: env('RADIO_AVENTO_URL', 'https://radio1.avventohome.org/listen/avventoradio/radio.ogg'),
        galaxy: env('RADIO_GALAXY_URL', 'https://sc.galaxyfm.co.ug/stream/1/'),
        powerFM: env('RADIO_POWER_FM_URL', 'https://securestreams5.autopo.st:1941/stream/1/'),
        bukedde: env('RADIO_BUKEDDE_URL', 'https://stream.hydeinnovations.com:2020/stream/bukeddefm/stream'),
        pearlFM: env('RADIO_PEARL_FM_URL', 'https://dc4.serverse.com/proxy/pearlfm/stream/1/')
    }
};
