/**
 * 
 * @param {*} newProgram , [[array of days],[start hour, start minute],[end hour, end minute],"program name"]
 * @param {*} existingProgram , [[array of days],[start hour, start minute],[end hour, end minute],"program name"]
 * @returns {object} 
 */
async function isTimeCollision(newProgram, existingProgram) {
    // Check if there is a day overlap
    const dayOverlap = newProgram[0].some( async (day) => existingProgram[0].includes(day));

    // If there is a day overlap, check for time overlap
    if (dayOverlap) {
        const newStartTime = newProgram[1][0] * 60 + newProgram[1][1];
        const newEndTime = newProgram[2][0] * 60 + newProgram[2][1];

        const existingStartTime = existingProgram[1][0] * 60 + existingProgram[1][1];
        const existingEndTime = existingProgram[2][0] * 60 + existingProgram[2][1];

        // Check for time collision
        if (newStartTime >= existingStartTime && newStartTime < existingEndTime) {
            return {
                collision: true,
                conflictingProgram: existingProgram[3],
                scenario: 'Partial overlap, new program starts after existing program starts'
            };
        }

        if (newEndTime > existingStartTime && newEndTime <= existingEndTime) {
            return {
                collision: true,
                conflictingProgram: existingProgram[3],
                scenario: 'Partial overlap, new program ends before existing program ends'
            };
        }

        if (newStartTime <= existingStartTime && newEndTime >= existingEndTime) {
            return {
                collision: true,
                conflictingProgram: existingProgram[3],
                scenario: 'Full overlap, new program encompasses existing program'
            };
        }

        if (newStartTime <= existingStartTime && newEndTime > existingEndTime) {
            return {
                collision: true,
                conflictingProgram: existingProgram[3],
                scenario: 'Partial overlap, new program starts before existing program starts and ends after it ends'
            };
        }
    }

    return { collision: false }; // No collision
}

module.exports = isTimeCollision;