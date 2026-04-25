const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const ftp = require('./modules/ftp');
const db = require('./modules/mongoDBApi');
const config = require('./config');
const streamUrl = config.radios.prime;
const chunkDurationInSeconds = 6; // 1 minute
const tempFolderPath = 'temp_stream_chunks';
const timeChecker = require('./timeChecker');
const { numC } = require('./modules/timeUtils');

// Valid days for scheduling
const VALID_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Input validation helper functions
function validateProgramInput(body) {
    const errors = [];

    // Validate days
    if (!body.days || !Array.isArray(body.days) || body.days.length === 0) {
        errors.push('Days must be a non-empty array');
    } else {
        const invalidDays = body.days.filter(d => !VALID_DAYS.includes(d));
        if (invalidDays.length > 0) {
            errors.push(`Invalid days: ${invalidDays.join(', ')}`);
        }
    }

    // Validate start time
    if (!body.start || !Array.isArray(body.start) || body.start.length !== 2) {
        errors.push('Start time must be an array of [hour, minute]');
    } else {
        const [startHour, startMin] = body.start;
        if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23) {
            errors.push('Start hour must be between 0 and 23');
        }
        if (!Number.isInteger(startMin) || startMin < 0 || startMin > 59) {
            errors.push('Start minute must be between 0 and 59');
        }
    }

    // Validate end time
    if (!body.end || !Array.isArray(body.end) || body.end.length !== 2) {
        errors.push('End time must be an array of [hour, minute]');
    } else {
        const [endHour, endMin] = body.end;
        if (!Number.isInteger(endHour) || endHour < 0 || endHour > 23) {
            errors.push('End hour must be between 0 and 23');
        }
        if (!Number.isInteger(endMin) || endMin < 0 || endMin > 59) {
            errors.push('End minute must be between 0 and 59');
        }
    }

    // Validate program name
    if (!body.prog || typeof body.prog !== 'string') {
        errors.push('Program name is required');
    } else {
        const trimmedProg = body.prog.trim();
        if (trimmedProg.length === 0) {
            errors.push('Program name cannot be empty');
        }
        if (trimmedProg.length > 100) {
            errors.push('Program name is too long (max 100 characters)');
        }
        // Check for dangerous characters (alphanumeric, spaces, underscores only)
        if (!/^[a-zA-Z0-9_\s]+$/.test(trimmedProg)) {
            errors.push('Program name can only contain letters, numbers, spaces, and underscores');
        }
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

function sanitizeProgramName(name) {
    // Remove any characters that aren't alphanumeric, spaces, or underscores
    return name.trim().replace(/[^a-zA-Z0-9_\s]/g, '_').substring(0, 100);
}

// Constants for recording configuration
const CHUNK_SIZE_KB = 5120;              // ~5MB chunk size threshold
const STREAM_CHECK_INTERVAL_MS = 1000;  // Check chunk size every second
const CHUNK_RESTART_DELAY_MS = 4000;      // Delay before starting next chunk
const FTP_UPLOAD_DELAY_MS = 9000;        // Delay before uploading to FTP
const DB_WRITE_DELAY_MS = 10000;         // Delay before writing metadata to DB
const MAX_FETCH_RETRIES = 3;             // Max retries for stream fetch
const FETCH_RETRY_DELAY_MS = 5000;       // Initial delay between fetch retries
const MAX_TEMP_FILE_AGE_HOURS = 24;     // Delete temp files older than this
const TEMP_CLEANUP_INTERVAL_MS = 3600000; // Cleanup every hour

// Temp file cleanup function - removes files older than MAX_TEMP_FILE_AGE_HOURS
function cleanupTempFiles() {
  try {
    if (!fs.existsSync(tempFolderPath)) {
      return;
    }

    const files = fs.readdirSync(tempFolderPath);
    const now = Date.now();
    let cleanedCount = 0;

    for (const file of files) {
      const filePath = path.join(tempFolderPath, file);
      try {
        const stats = fs.statSync(filePath);
        const fileAgeHours = (now - stats.mtimeMs) / (1000 * 60 * 60);

        if (fileAgeHours > MAX_TEMP_FILE_AGE_HOURS) {
          fs.unlinkSync(filePath);
          cleanedCount++;
          console.log(`Cleaned up old temp file: ${file}`);
        }
      } catch (err) {
        // Skip files we can't stat
        console.error(`Could not process temp file ${file}:`, err.message);
      }
    }

    if (cleanedCount > 0) {
      console.log(`Temp file cleanup: removed ${cleanedCount} old files`);
    }
  } catch (err) {
    console.error('Temp file cleanup error:', err.message);
  }
}

// Start periodic temp file cleanup
setInterval(cleanupTempFiles, TEMP_CLEANUP_INTERVAL_MS);

// Initial cleanup on startup
setTimeout(cleanupTempFiles, 30000); // Wait 30 seconds before first cleanup

// Retry helper with exponential backoff
async function retryWithBackoff(fn, maxRetries = MAX_FETCH_RETRIES, delay = FETCH_RETRY_DELAY_MS) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            console.error(`Attempt ${attempt}/${maxRetries} failed:`, error.message);
            if (attempt < maxRetries) {
                const backoffDelay = delay * Math.pow(2, attempt - 1);
                console.log(`Retrying in ${backoffDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
            }
        }
    }
    throw lastError;
}

let chunkIndex = 1;
let programCheck = null;
var recordedList = [];
let progName = "";
let existingPrograms = [];

// Create the temp folder if it doesn't exist
if (!fs.existsSync(tempFolderPath)) {
  fs.mkdirSync(tempFolderPath);
}
let record = false;
let userRecord = false;



programCheck = setInterval(async () => {
  try {
      if (existingPrograms.length == 0) {
          const progs = await db.readRows({}, 'radio', 'programs');
          progs.listings.forEach(async (prog) => {
              existingPrograms.push([prog.days, prog.start, prog.end, prog.prog]);
          });
          // console.log(existingPrograms);
          return;
      }
          // console.log(existingPrograms.length);
      const time = new Date();
      var HH = time.getHours() + 3;
      if (HH > 23){
        HH = 24 - HH;
      }
      const MM = time.getMinutes();
      const options = { weekday: 'long' }  //, timeZone: 'Africa/Nairobi' };
      const DD = time.toLocaleDateString('en-US', options);
      // console.log(DD)
      // console.log(time.toTimeString())

      // logic to start recording
      if (!record || userRecord) {
          // console.log(userRecord);
          for (const prog of existingPrograms) {
              // checking if the program runs in a portion of an hour
              if (prog[1][0] == prog[2][0]) {
                  for (const day of prog[0]) {
                      if (DD == day && HH == prog[1][0] && MM >= prog[1][1] && MM < prog[2][1]) {
                          startRecording(prog[3]);
                      }
                  }
              }
              // if the program runs into a different hour
              else {
                  for (const day of prog[0]) {
                      if (DD == day && HH == prog[1][0] && MM >= prog[1][1]) {
                        startRecording(prog[3]);
                      }
                  }
              }
          }
      }
      // logic to stop recording
      else {
          for (const prog of existingPrograms) {
              // checking if the program runs in a portion of an hour
              if (prog[1][0] == prog[2][0]) {
                  for (const day of prog[0]) {
                      if (DD == day && HH == prog[2][0] && MM == prog[2][1]) {
                          stopRecording(prog[3]);
                      }
                  }
              }
              // if the program runs into a different hour
              else {
                  for (const day of prog[0]) {
                      if (DD == day && HH == prog[2][0] && MM == prog[2][1]) {
                          stopRecording(prog[3]);
                      }
                  }
              }
          }
      }
  } catch (error) {
      console.log(error.message);
  }
}, 15000); // Run every 15 seconds

async function startRecording(prog, un = false){
  if(record){
    if(userRecord && !un){
      stopRecording('user', true);
    }
    return {message:`${progName} recording is already in progress`};
  }else{
    record = true;
    progName = prog;
    if(un){
      setTimeout(()=>{
        userRecord = true;
      },60000);
    }
    fetchAndRecordChunk();
    console.log("Recording started - "+prog);
    return {message:"Recording has started."}
  }
}
async function stopRecording(prog, un = false){
  if(record){
    if(un !== userRecord){
      // console.log('cant stop')
      return {message:`Sorry, ${progName} recording is in progress. You did not start it Or recording has just started and has to record atleast for 1 minute.`};
    }
    record = false;
    userRecord = false;
    console.log("Recording stopped - "+prog);
    return {message:"Recording stopped successfully"};
  }
  else{
    return {message: "No Recording is in progress"}
  }
}

async function fetchAndRecordChunk() {
  let dayOfRec = dateOfRec();

  const startChunk = async () => {
    let response;
    try {
      response = await fetch(streamUrl);
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
    } catch (error) {
      console.error(`Failed to fetch stream for chunk ${chunkIndex}:`, error.message);
      throw error; // Let retryWithBackoff handle it
    }

    // declaring fundamental variables
    let bytesRead = 0;
    let interval = null;
    let uploadTimeout = null;

    // Declaring name of files to save and saving
    const fileName = `${dayOfRec[0]}[${dayOfRec[1]+" "+dayOfRec[2]}]_recording_${progName}_${chunkIndex}.mp3`
    const chunkFilePath = path.join(tempFolderPath, fileName);
    console.log("File Path: "+fileName);

    // Track if we've completed this chunk
    let chunkComplete = false;

    const outputStream = fs.createWriteStream(chunkFilePath);

    // Handle stream errors
    outputStream.on('error', (err) => {
      console.error(`Error writing chunk ${chunkIndex}:`, err.message);
    });

    outputStream.on('finish', async () => {
      if (chunkComplete) return; // Already processed
      chunkComplete = true;

      if (uploadTimeout) clearTimeout(uploadTimeout);

      // Check if file has content before uploading
      try {
        const stats = fs.statSync(chunkFilePath);
        if (stats.size === 0) {
          console.error(`Chunk ${chunkIndex} is empty, skipping upload`);
          return;
        }
      } catch (err) {
        console.error(`Could not stat chunk file:`, err.message);
        return;
      }

      // Upload to FTP with error handling
      uploadTimeout = setTimeout(async () => {
        try {
          await ftp.uploadToFTP2(tempFolderPath, progName, [fileName]);
          recordedList.push(fileName);
          console.log(`Chunk ${chunkIndex} recorded and uploaded: ${fileName}`);
        } catch (uploadError) {
          console.error(`Failed to upload chunk ${chunkIndex}:`, uploadError.message);
          // Still keep the file locally as backup
          recordedList.push(fileName);
        }
      }, FTP_UPLOAD_DELAY_MS);
    });

    // Timer to check size of recorded file.
    interval = setInterval(() => {
      if (!record) {
        // Recording was stopped
        clearInterval(interval);
        if (!chunkComplete) {
          chunkComplete = true;
          outputStream.end();
          if (response && response.body) {
            response.body.destroy();
          }
          // Save metadata to DB
          setTimeout(async () => {
            try {
              await db.updateRow2(
                {
                  program: progName,
                  files: recordedList
                },
                {
                  program: progName,
                  files: recordedList,
                  Day: dayOfRec[0],
                  Time: dayOfRec[1].replace(' ', ':'),
                  pm: dayOfRec[2]
                },
                'radio', 'recordings');
              console.log(`Recording metadata saved for ${progName}`);
            } catch (dbError) {
              console.error(`Failed to save recording metadata:`, dbError.message);
            }
            recordedList = [];
            chunkIndex = 1;
          }, DB_WRITE_DELAY_MS);
        }
        return;
      }

      if (bytesRead >= 1000 * CHUNK_SIZE_KB) {
        clearInterval(interval);
        if (!chunkComplete) {
          chunkComplete = true;
          outputStream.end();
          if (response && response.body) {
            response.body.destroy();
          }
          chunkIndex++;
          // Fetch and record the next chunk
          setTimeout(() => {
            fetchAndRecordChunk();
          }, CHUNK_RESTART_DELAY_MS);
        }
      }
    }, STREAM_CHECK_INTERVAL_MS);

    // Write the chunk content to a temporary file
    if (response && response.body) {
      response.body.on('data', chunk => {
        bytesRead += chunk.length;
        outputStream.write(chunk);
      });

      response.body.on('error', (err) => {
        console.error(`Stream error for chunk ${chunkIndex}:`, err.message);
      });
    }
  };

  // Use retry logic for fetching
  try {
    await retryWithBackoff(startChunk);
  } catch (error) {
    console.error(`All ${MAX_FETCH_RETRIES} attempts failed for chunk ${chunkIndex}. Recording may be interrupted.`);
    // If we're still supposed to be recording, try once more after a longer delay
    if (record) {
      console.log('Will attempt to resume recording in 30 seconds...');
      setTimeout(() => {
        if (record) {
          fetchAndRecordChunk();
        }
      }, 30000);
    }
  }
}

function dateOfRec(){
  let currentDate = new Date();
  let day = numC(currentDate.getDate());
  let month = numC(currentDate.getMonth() + 1); // Adding 1 to match human-readable month representation (1 to 12)
  let year = currentDate.getFullYear();
  let hh = currentDate.getHours() + 3;
  let mm = numC(currentDate.getMinutes());
  let am;

  if(hh > 24){
    hh = numC(24-hh);
    am = "am";
  }
  else if(hh < 12){
    am = "am";
  }
  else if(hh == 12){
    am = "pm";  // Fixed: was == instead of =
  }
  else{
    hh = numC(hh - 12);
    am = "pm"
  }


  // return `${day}-${month}-${year}[${hh} ${mm} ${am}]`;
  return [`${day}-${month}-${year}`,`${hh+' '+mm}`,`${am}`];
}
// Start fetching and recording chunks from the beginning

// fs.unlink(path.join(__dirname,"temp_stream_chunks/17 8 2023_recording_Lwaki Nze_1.mp3"), err => {
//   if (err) {
//     console.error(`Error deleting file:`, err);
//   } else {
//     console.log(`file deleted successfully.`);
//   }
// });



function executeTaskEvery10Minutes() {
  function keepChecker(){// Task to execute
  fetch("https://newlugandahymnal.onrender.com/keepAlive")
  .then(res=>{
    if(!res.ok){
      console.log("Connection not clear - Hymnal");
    }
      return res;
  }).then(res => {
    console.log("connection clear - Hymnal");
  }).catch(error => {
    // Handle any errors gracefully
    console.log('Error:', error);
    // Take alternative actions or provide appropriate feedback
  })
  .finally(() => {
    // Call the function again after 10 minutes, regardless of success or error
    setTimeout(keepChecker, 600000);
});
}
  function performFetch() {
fetch("https://hiweightechsystemsltd.onrender.com/keepAlive")
      .then(response => {
        if (!response.ok) {
          console.log('Connection not clear - Hiweigh');
        }
        return response;
      })
  .then(responseData => {
    // Process the response data
    console.log("Response clear - Hiweigh");
  })
  .catch(error => {
        // Handle any errors gracefully
        console.log('Error:', error);
        // Take alternative actions or provide appropriate feedback
      })
  .finally(() => {
        // Call the function again after 10 minutes, regardless of success or error
    try{
      fetch('https://auto-swift-password-reset.onrender.com/api/finish-reset')
      .then(res => {
        return res;
      }).then(data=>{
        console.log(data.error);
      })
    }
    catch(err){
      console.log(err.message);
    }
        setTimeout(performFetch, 600000);
  });
  }

  // Initial fetch request
  performFetch();
  keepChecker();
}

// Call the function to start executing the task every 10 minutes
executeTaskEvery10Minutes();

const addProgram = async (req, res) => {
  try {
    const man = req.body;

    // Validate input
    const validation = validateProgramInput(man);
    if (!validation.isValid) {
      return res.status(400).json({
        message: 'Please fix the following issues:',
        errors: validation.errors,
        hint: 'Review each error below, correct your input, and try again.'
      });
    }

    // Sanitize program name
    const sanitizedProg = sanitizeProgramName(man.prog);

    var message = "Program added successfully!";
    var coli = true; // collision states
    // Turning program to array format (using sanitized name)
    const newProg = [man.days, man.start, man.end, sanitizedProg];

    // Create sanitized listing object
    const sanitizedListing = {
      ...man,
      prog: sanitizedProg
    };

    // Turning existing programs to array format
    let oldPrograms = existingPrograms;

    // Now checking if the new program doesn't conflict with existing programs
    // if programs are not yet loaded
    if(oldPrograms.length == 0){
      message = "The system is still loading. Please wait a moment and try again.";
      return res.status(503).json({
        message: message,
        hint: 'This usually takes a few seconds after the server starts.'
      });
    }
    // if they already loaded
    else{
      for (const oldProg of oldPrograms) {
        const ck = await timeChecker(newProg, oldProg);
        if (ck.collision) {
          coli = true;
          // Provide more helpful message
          let conflictMessage = ck.scenario;
          if (ck.scenario.includes('already taken')) {
            message = `"${sanitizedProg}" is already in use. Please choose a different program name.`;
          } else if (ck.scenario.includes('Partial overlap') || ck.scenario.includes('Full overlap')) {
            message = `This schedule conflicts with "${ck.conflictingProgram}" which runs from ${ck.start} to ${ck.end}. Please choose a different time slot.`;
          } else {
            message = ck.scenario + ". The program \"" + ck.conflictingProgram + "\" overlaps with your requested schedule.";
          }
          break; // Exit the loop if there is a collision
        }
        else{
          coli = false;
        }
      }
    }

    // If there is no collision
    if (!coli) {
      await db.createListing(sanitizedListing, 'radio', 'programs');
      existingPrograms.push(newProg);
      return res.json({
        message: message,
        success: true
      });
    }

    res.status(409).json({
      message: message,
      hint: 'Try selecting different days or times for your program.'
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: 'An error occurred while saving your program. Please try again.',
      hint: 'If this problem persists, please contact support.'
    });
  }
};

const deleteProgram = async (req, res)=>{
  try {
    await db.createListing({prog:req.params.prog},'radio','programs');
    res.json({'message':'Deleted successfully'})
  } catch (error) {
    res.json({message:error.message})
  }
}

module.exports = {
  programCheck,
  startRecording,
  stopRecording,
  userRecord,
  record,
  addProgram,
  deleteProgram
};
