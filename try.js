const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const ftp = require('./modules/ftp');
const db = require('./modules/mongoDBApi');
const con = require('./config.json');
const streamUrl = con.radios.prime;
const chunkDurationInSeconds = 6; // 1 minute
const tempFolderPath = 'temp_stream_chunks';
const timeChecker = require('./timeChecker');

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
      const HH = time.getHours() + 3;
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
                          console.log(prog[3]);
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
                      if (DD == day && HH == prog[2][0] && MM >= prog[2][1] + 1) {
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

function fetchAndRecordChunk() {
  let dayOfRec = dateOfRec();
  fetch(streamUrl)
    .then(response => {
      // declaring fundamental variables 
      let bytesRead = 0;
      let interval = null;

      // Declaring name of files to save and saving
      const fileName = `${dayOfRec}_recording_${progName}_${chunkIndex}.mp3`
      const chunkFilePath = path.join(tempFolderPath, fileName);
      // console.log("File Path: "+chunkFilePath);
      const outputStream = fs.createWriteStream(chunkFilePath).on("finish",()=>{
        setTimeout(()=>{
          ftp.uploadToFTP2(tempFolderPath,progName,[fileName]);
          recordedList.push(fileName);
          console.log(`Chunk ${chunkIndex} recorded: ${fileName}`);
        },9000);
      });
      
      // Timer to check size of recorded file.
      interval = setInterval(() => {
        if(record){
          // console.log(`Bytes written: ${bytesRead}`);
          if (bytesRead >= 1000 * 5120) {
            clearInterval(interval); // Clear the interval when done
            outputStream.end();
            response.body.destroy();
            chunkIndex++;
            // Fetch and record the next chunk
            setTimeout(()=>{
              fetchAndRecordChunk();
            }, 4000);// calling new chunk
          }
        }
        else{
          clearInterval(interval);
          outputStream.end();
          response.body.destroy();
          setTimeout(() => {
            db.updateRow2({program: progName, files: recordedList},{program: progName, files: recordedList, Day:dayOfRec},'radio','recordings');
            recordedList = [];
            chunkIndex = 1;
          },10000);
        }
      }, 1000); // Log progress every second


      // Write the chunk content to a temporary file
      response.body.on('data', chunk => {
        bytesRead += chunk.length;
        outputStream.write(chunk);
      });

      // response.body.on('end', () => {
      //   console.log(`Chunk ${chunkIndex} recorded: ${chunkFilePath}`);
      //   clearInterval(interval); // Clear the interval when done
      //   outputStream.end();
      //   chunkIndex++;

      //   // Fetch and record the next chunk
      //   fetchAndRecordChunk();
      // });
    })
    .catch(error => {
      console.error(`Error fetching or recording chunk ${chunkIndex}:`, error);
    });
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
  else{
    hh = numC(hh - 12);
    am = "pm"
  }


  return `${day}-${month}-${year}[${hh} ${mm} ${am}]`;
}

function numC (num){
  if(num < 10){
    num = "0"+num
    return num
  }
  else{
    return num
  }
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
    var man = req.body;
    var message = "program added successfully";
    var coli = true; // collision states
    // Turning program to array format
    const newProg = [man.days, man.start, man.end, man.prog];

    // Turning existing programs to array format
    let oldPrograms = existingPrograms;

    // Now checking if the new program doesn't conflict with existing programs
    // if programs are not yet loaded
    if(oldPrograms.length == 0){
      message = "Server is still loading data, try again later. Program was not added";
    }
    // if they already loaded
    else{
      for (const oldProg of oldPrograms) {
        const ck = await timeChecker(newProg, oldProg);
        if (ck.collision) {
          message = ck.scenario + " , Program affected: " + ck.conflictingProgram + " which starts at "+ ck.start +" and ends at "+ ck.end +" on one of the days.";
          break; // Exit the loop if there is a collision
        }
        else{
          coli = false;
        }
      }
    }

    // If there is no collision
    if (!coli) {
      await db.updateRow2(man, 'radio', 'programs');
      existingPrograms.push(newProg);
    }

    res.json({ message: message });
  } catch (error) {
    console.log(error);
    res.json({ message: error.message });
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
