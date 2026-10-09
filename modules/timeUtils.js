/**
 * Time utility functions for formatting hours and minutes
 */

/**
 * Format hour for display (convert 24h to 12h format with AM/PM)
 * @param {number} h - Hour in 24h format (0-23)
 * @returns {object} - {h: formatted hour, am: AM/PM indicator}
 */
function gT(h) {
    var am;
    if (h == 0) {
        h = 12;
        am = "midnight";
    }
    else if (h > 12) {
        h = h - 12;
        am = "pm";
    }
    else if (h == 12) {
        h = 12;
        am = "noon";
    }
    else {
        am = "am";
    }
    return { h: h, am: am };
}

/**
 * Format minute with leading zero if needed
 * @param {number} m - Minute (0-59)
 * @returns {string|number} - Formatted minute
 */
function gM(m) {
    if (m < 10) {
        m = "0" + m;
    }
    return m;
}

/**
 * Pad a number with leading zeros
 * @param {number} num - Number to pad
 * @returns {string} - Padded number string
 */
function numC(num) {
    if (num < 10) {
        return "0" + num;
    }
    return num;
}

/**
 * Get day name from JavaScript day number
 * @param {number} dayNum - Day number (0=Sunday, 1=Monday, etc.)
 * @returns {string} - Day name
 */
function getDayName(dayNum) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayNum] || '';
}

module.exports = {
    gT,
    gM,
    numC,
    getDayName
};
