/**
 * Stream Health Check — self-healing Prime Radio stream URL
 * @module modules/streamHealth
 *
 * Problem
 * -------
 * Prime Radio's icecast host (video2.getstreamhosting.com) is given a fresh
 * port whenever the broadcaster moves. The URL in config.json goes stale and
 * the recorder then loops forever against a dead socket, recording nothing.
 *
 * Approach
 * --------
 * 1. Probe the configured URL. These are endless audio streams, so we only
 *    inspect response headers and then cancel the body — we must never try
 *    to download the stream.
 * 2. If it is dead, ask the station directory (radio.co.ug, which is powered
 *    by instant.audio) for the station's current stream list.
 * 3. Verify the candidate URL actually serves audio BEFORE swapping it in.
 *    A repair is never allowed to replace a known-bad URL with an unverified one.
 * 4. Persist to config.json with a surgical text replacement, and update the
 *    in-memory config so the running process picks it up without a restart.
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const config = require('../config');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Where a human can look when this misbehaves.
const DIRECTORY_PAGE = 'https://radio.co.ug/91-9-prime-uganda/';

// Fallbacks used only if the directory page changes shape.
const FALLBACK_API_BASE = 'https://api.instant.audio/';
const FALLBACK_DOMAIN_ID = '132';
const FALLBACK_SLUG = '91-9-prime-uganda';

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

// Do not hammer the directory after a failed repair.
const DISCOVERY_COOLDOWN_MS = 60 * 60 * 1000;

const state = {
  running: false,
  lastCheckAt: null,
  lastDiscoveryAt: null,
  consecutiveFailures: 0,
  lastRepair: null,
  lastResult: null
};

/* -------------------------------------------------------------------------- */
/* Probing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Check whether a stream URL is currently serving audio.
 *
 * @param {string} url Stream URL.
 * @param {number} [timeoutMs] Abort after this long.
 * @returns {Promise<{ok: boolean, status: number, contentType: string, reason: string}>}
 */
async function probeStream(url, timeoutMs = 12000) {
    if (!/^https?:\/\//i.test(url || '')) {
        return { ok: false, status: 0, contentType: '', reason: 'not an http(s) URL' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: { 'User-Agent': USER_AGENT, 'Accept': '*/*' }
        });

        const contentType = (response.headers.get('content-type') || '').toLowerCase();

        // The body is an endless stream. Read the headers, then drop it —
        // consuming it would block forever and waste bandwidth.
        if (response.body) {
            try { await response.body.cancel(); } catch (e) { /* already closed */ }
        }

        if (!response.ok) {
            return { ok: false, status: response.status, contentType, reason: 'HTTP ' + response.status };
        }

        const looksLikeAudio =
            contentType.startsWith('audio/') ||
            contentType.includes('mpegurl') ||
            contentType.includes('mp3') ||
            contentType.includes('aac') ||
            contentType.includes('application/vnd.apple.mpegurl');

        if (!looksLikeAudio) {
            return {
                ok: false,
                status: response.status,
                contentType,
                reason: 'unexpected content-type: ' + (contentType || 'none')
            };
        }

        return { ok: true, status: response.status, contentType, reason: 'serving audio' };

    } catch (error) {
        const code = (error.cause && error.cause.code) || error.code || error.name || error.message;
        return {
            ok: false,
            status: 0,
            contentType: '',
            reason: error.name === 'AbortError' ? 'timed out' : String(code)
        };
    } finally {
        clearTimeout(timer);
    }
}

/* -------------------------------------------------------------------------- */
/* Directory transport                                                        */
/* -------------------------------------------------------------------------- */

/**
 * GET a URL through the system curl.
 *
 * Why curl and not fetch: the station directory sits behind Cloudflare, which
 * challenges on TLS fingerprint. Node's fetch, node-fetch and the raw https
 * module are all refused with a 403 "Just a moment..." page, while curl is
 * let through. Arguments are passed as an array, never through a shell, so
 * the URL cannot be used for command injection.
 *
 * @param {string} url
 * @param {Object} [headers]
 * @param {number} [timeoutMs]
 * @returns {Promise<{ok: boolean, status: number, body: string, error: (string|null)}>}
 */
function fetchViaCurl(url, headers = {}, timeoutMs = 20000) {
    return new Promise(function (resolve) {
        const seconds = Math.max(1, Math.ceil(timeoutMs / 1000));
        const args = ['-s', '-L', '--max-time', String(seconds), '-w', '\n__STATUS__%{http_code}'];

        Object.keys(headers).forEach(function (key) {
            args.push('-H', key + ': ' + headers[key]);
        });
        args.push(url);

        const bin = process.platform === 'win32' ? 'curl.exe' : 'curl';

        execFile(bin, args, {
            timeout: timeoutMs + 5000,
            maxBuffer: 8 * 1024 * 1024
        }, function (error, stdout) {
            const out = stdout || '';
            const marker = out.lastIndexOf('\n__STATUS__');
            const status = marker === -1 ? 0 : parseInt(out.slice(marker + 11).trim(), 10);
            const body = marker === -1 ? out : out.slice(0, marker);

            if (error && marker === -1) {
                resolve({ ok: false, status: 0, body: '', error: error.message });
                return;
            }
            resolve({ ok: status >= 200 && status < 400, status: status, body: body, error: null });
        });
    });
}

/**
 * GET through curl, falling back to fetch if curl is unavailable.
 *
 * @param {string} url
 * @param {Object} [headers]
 * @param {number} [timeoutMs]
 * @returns {Promise<{ok: boolean, status: number, body: string, error: (string|null)}>}
 */
async function directoryGet(url, headers, timeoutMs) {
    const viaCurl = await fetchViaCurl(url, headers, timeoutMs);
    if (viaCurl.status) return viaCurl;

    try {
        const response = await fetch(url, { headers: headers, redirect: 'follow' });
        const body = await response.text();
        return { ok: response.ok, status: response.status, body: body, error: null };
    } catch (error) {
        return { ok: false, status: 0, body: '', error: error.message };
    }
}

/* -------------------------------------------------------------------------- */
/* Discovery                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Choose the most usable URL from the station's stream list.
 * Prefers a direct, non-container MP3 (what a recorder wants), then HLS,
 * then anything else over http(s).
 *
 * @param {Array<Object>} streams
 * @returns {string|null}
 */
function pickBestStream(streams) {
    if (!Array.isArray(streams) || !streams.length) return null;

    const scored = streams
        .filter(s => s && typeof s.url === 'string' && /^https?:\/\//i.test(s.url))
        .map(s => {
            let score = 0;
            if (!s.isContainer) score += 4;
            if (/MP3/i.test(String(s.mediaType))) score += 3;
            if (/audio\/mpeg/i.test(String(s.mime))) score += 2;
            if (/\.m3u8?(\?|$)/i.test(s.url)) score += 1;
            return { url: s.url, score };
        })
        .sort((a, b) => b.score - a.score);

    return scored.length ? scored[0].url : null;
}

/**
 * Ask radio.co.ug's backend for Prime Radio's current stream list.
 *
 * @returns {Promise<string|null>} Best stream URL, or null if unavailable.
 */
async function discoverPrimeStream() {
    // The API sits behind Cloudflare and rejects requests without a
    // same-origin Referer/Origin pair.
    const headers = {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/json',
        'Referer': 'https://radio.co.ug/',
        'Origin': 'https://radio.co.ug'
    };

    let apiBase = FALLBACK_API_BASE;
    let domainId = FALLBACK_DOMAIN_ID;
    let slug = FALLBACK_SLUG;

    const page = await directoryGet(DIRECTORY_PAGE, headers, 20000);
    if (page.ok && page.body) {
        const html = page.body;

        const cfg = html.match(/webradioConfig\s*=\s*\{([\s\S]*?)\}\s*;?\s*<\/script>/);
        if (cfg) {
            const api = cfg[1].match(/urlApi\s*:\s*"([^"]+)"/);
            const dom = cfg[1].match(/domainID\s*:\s*(\d+)/);
            if (api) apiBase = api[1];
            if (dom) domainId = dom[1];
        }

        const station = html.match(/data-station-name\s*=\s*"([^"]+)"/);
        if (station) slug = station[1];
    }

    const endpoint = apiBase.replace(/\/$/, '') + '/data/streams/' + domainId + '/' + slug;
    const response = await directoryGet(endpoint, Object.assign({}, headers, { Accept: 'application/json' }), 20000);

    if (!response.ok) {
        throw new Error('directory API returned HTTP ' + (response.status || ('transport error: ' + response.error)));
    }

    let payload;
    try {
        payload = JSON.parse(response.body);
    } catch (error) {
        throw new Error('directory API returned non-JSON (likely a bot challenge)');
    }

    const result = payload && payload.result;
    if (!result) {
        throw new Error('directory API returned no result');
    }

    const chosen = pickBestStream(result.streams);
    if (!chosen) {
        throw new Error('no usable http(s) stream in directory response');
    }

    return chosen;
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Replace only the prime value inside config.json.
 *
 * A full parse/stringify round-trip would rewrite the whole file, which is
 * noisy and risks reformatting credentials. This touches one value and leaves
 * every other byte alone.
 *
 * @param {string} newUrl
 * @returns {boolean} true if the file was written.
 */
function persistPrimeStreamUrl(newUrl) {
    const original = fs.readFileSync(CONFIG_PATH, 'utf8');
    const pattern = /("prime"\s*:\s*")([^"]*)(")/g;
    const matches = original.match(pattern);

    if (!matches || matches.length !== 1) {
        console.error('[STREAM-HEALTH] config.json has ' +
            (matches ? matches.length : 0) + ' "prime" keys, expected 1 — not writing');
        return false;
    }

    const updated = original.replace(pattern, '$1' + newUrl + '$3');
    if (updated === original) return false;

    fs.writeFileSync(CONFIG_PATH, updated, 'utf8');
    return true;
}

/* -------------------------------------------------------------------------- */
/* Main check                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Probe the configured stream and repair it if it is dead.
 *
 * @returns {Promise<Object>} Outcome for logging/telemetry.
 */
async function checkPrimeStream() {
    if (state.running) {
        return { skipped: true, reason: 'a check is already in progress' };
    }
    state.running = true;

    const current = config.radios.prime;

    try {
        state.lastCheckAt = new Date().toISOString();
        const probe = await probeStream(current);

        if (probe.ok) {
            state.consecutiveFailures = 0;
            state.lastResult = { url: current, ok: true, status: probe.status, checkedAt: state.lastCheckAt };
            return { repaired: false, ok: true, url: current, detail: probe.reason };
        }

        state.consecutiveFailures += 1;
        console.warn('[STREAM-HEALTH] Prime Radio stream looks dead: ' + current + ' (' + probe.reason + ')');

        // Respect the cooldown so a persistent outage does not hammer the directory.
        const sinceDiscovery = Date.now() - (state.lastDiscoveryAt || 0);
        if (state.lastDiscoveryAt && sinceDiscovery < DISCOVERY_COOLDOWN_MS) {
            const mins = Math.round((DISCOVERY_COOLDOWN_MS - sinceDiscovery) / 60000);
            state.lastResult = { url: current, ok: false, reason: probe.reason, checkedAt: state.lastCheckAt };
            return { repaired: false, ok: false, url: current, detail: 'cooldown, retrying in ' + mins + 'm' };
        }

        state.lastDiscoveryAt = Date.now();

        let candidate;
        try {
            candidate = await discoverPrimeStream();
        } catch (error) {
            console.error('[STREAM-HEALTH] could not read the directory: ' + error.message);
            state.lastResult = { url: current, ok: false, reason: probe.reason, checkedAt: state.lastCheckAt };
            return { repaired: false, ok: false, url: current, detail: 'discovery failed: ' + error.message };
        }

        if (!candidate) {
            state.lastResult = { url: current, ok: false, reason: probe.reason, checkedAt: state.lastCheckAt };
            return { repaired: false, ok: false, url: current, detail: 'directory returned no usable stream' };
        }

        if (candidate === current) {
            console.warn('[STREAM-HEALTH] directory points at the same URL that is already failing: ' + candidate);
            state.lastResult = { url: current, ok: false, reason: probe.reason, checkedAt: state.lastCheckAt };
            return { repaired: false, ok: false, url: current, detail: 'directory URL is identical to the failing one' };
        }

        // Never swap in a URL we have not proven works.
        const verify = await probeStream(candidate);
        if (!verify.ok) {
            console.error('[STREAM-HEALTH] candidate rejected, it does not serve audio: ' + candidate + ' (' + verify.reason + ')');
            state.lastResult = { url: current, ok: false, reason: probe.reason, checkedAt: state.lastCheckAt };
            return { repaired: false, ok: false, url: current, detail: 'candidate failed verification: ' + verify.reason };
        }

        let persisted = false;
        try {
            persisted = persistPrimeStreamUrl(candidate);
        } catch (error) {
            console.error('[STREAM-HEALTH] could not write config.json: ' + error.message);
        }

        // Hot-apply: config.radios is a live object shared by every module that
        // reads it at call time, so this takes effect without a restart.
        config.radios.prime = candidate;

        state.lastRepair = { from: current, to: candidate, at: new Date().toISOString(), persisted };
        state.lastResult = { url: candidate, ok: true, status: verify.status, checkedAt: state.lastCheckAt };
        state.consecutiveFailures = 0;

        console.log('[STREAM-HEALTH] repaired Prime Radio stream:\n' +
            '    from: ' + current + '\n' +
            '    to:   ' + candidate + '\n' +
            '    config.json ' + (persisted ? 'updated' : 'NOT written (in-memory only)') +
            ' — recorder will use the new URL immediately.');

        return { repaired: true, ok: true, from: current, to: candidate, persisted };

    } catch (error) {
        console.error('[STREAM-HEALTH] unexpected error: ' + error.message);
        return { repaired: false, ok: false, url: current, detail: 'unexpected: ' + error.message };
    } finally {
        state.running = false;
    }
}

/* -------------------------------------------------------------------------- */
/* Scheduling                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Start the periodic health check.
 *
 * @param {number} [intervalMs] How often to check.
 * @param {number} [initialDelayMs] Delay before the first run, so boot is not slowed.
 * @returns {{stop: Function}}
 */
function startStreamHealthCheck(intervalMs = 15 * 60 * 1000, initialDelayMs = 15000) {
    const kickOff = setTimeout(() => {
        checkPrimeStream().catch(function (error) {
            console.error('[STREAM-HEALTH] initial check failed: ' + error.message);
        });
    }, initialDelayMs);

    const timer = setInterval(() => {
        checkPrimeStream().catch(function (error) {
            console.error('[STREAM-HEALTH] scheduled check failed: ' + error.message);
        });
    }, intervalMs);

    console.log('[STREAM-HEALTH] Prime Radio stream check scheduled every ' +
        Math.round(intervalMs / 60000) + ' min (first run in ' + Math.round(initialDelayMs / 1000) + 's).');

    return {
        stop: function () {
            clearTimeout(kickOff);
            clearInterval(timer);
        }
    };
}

/**
 * Current health-check state, for diagnostics.
 * @returns {Object}
 */
function getState() {
    return Object.assign({}, state);
}

module.exports = {
    probeStream,
    discoverPrimeStream,
    pickBestStream,
    checkPrimeStream,
    startStreamHealthCheck,
    getState,
    DIRECTORY_PAGE
};
