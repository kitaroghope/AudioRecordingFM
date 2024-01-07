/**
 * 
 * @param {*} newProgram , [[array of days],[start hour, start minute],[end hour, end minute],"program name"]
 * @param {*} existingProgram , [[array of days],[start hour, start minute],[end hour, end minute],"program name"]
 * @returns {object} 
 */
async function isTimeCollision(newProgram, existingProgram) {
    // Check if there is a day overlap
    const dayOverlap = newProgram[0].some((day) => existingProgram[0].includes(day));

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
                scenario: 'Partial overlap, new program starts after existing program starts',
                start: ""+gT(existingProgram[1][0]).h+":"+gM(existingProgram[1][1])+""+gT(existingProgram[1][0]).am,
                end: ""+gT(existingProgram[2][0]).h+":"+gM(existingProgram[2][1])+""+gT(existingProgram[2][0]).am
            };
        }

        if (newEndTime > existingStartTime && newEndTime <= existingEndTime) {
            return {
                collision: true,
                conflictingProgram: existingProgram[3],
                scenario: 'Partial overlap, new program ends before existing program ends',
                start: ""+gT(existingProgram[1][0]).h+":"+gM(existingProgram[1][1])+""+gT(existingProgram[1][0]).am,
                end: ""+gT(existingProgram[2][0]).h+":"+gM(existingProgram[2][1])+""+gT(existingProgram[2][0]).am
            };
        }

        if (newStartTime <= existingStartTime && newEndTime >= existingEndTime) {
            return {
                collision: true,
                conflictingProgram: existingProgram[3],
                scenario: 'Full overlap, new program encompasses existing program',
                start: ""+gT(existingProgram[1][0]).h+":"+gM(existingProgram[1][1])+""+gT(existingProgram[1][0]).am,
                end: ""+gT(existingProgram[2][0]).h+":"+gM(existingProgram[2][1])+""+gT(existingProgram[2][0]).am
            };
        }

        if (newStartTime <= existingStartTime && newEndTime > existingEndTime) {
            return {
                collision: true,
                conflictingProgram: existingProgram[3],
                scenario: 'Partial overlap, new program starts before existing program starts and ends after it ends',
                start: ""+gT(existingProgram[1][0]).h+":"+gM(existingProgram[1][1])+""+gT(existingProgram[1][0]).am,
                end: ""+gT(existingProgram[2][0]).h+":"+gM(existingProgram[2][1])+""+gT(existingProgram[2][0]).am
            };
        }
        if(newProgram[3] == existingProgram[3]){
            return {
                collision: true,
                conflictingProgram: existingProgram[3],
                scenario: 'Program name is already taken' ,
                start: ""+gT(existingProgram[1][0]).h+":"+gM(existingProgram[1][1])+""+gT(existingProgram[1][0]).am,
                end: ""+gT(existingProgram[2][0]).h+":"+gM(existingProgram[2][1])+""+gT(existingProgram[2][0]).am
            }
        }
    }

    return { collision: false }; // No collision
}
function gT(h){
    var am;
    if(h == 0){
        h = 12
        am = "midnight";
    }
    else if(h >12){
        h = h-12
        am = "pm"
    }
    else if(h == 12){
        h = h
        am = "noon"
    }
    else{
        h = h
        am = "am"
    }
    return {h:h,am:am};
}
function gM(m){
    if(m < 10){
        m = "0"+m
    }
    return m
}

module.exports = isTimeCollision;