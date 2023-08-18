const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const ftp = require('./modules/ftp');
const db = require('./modules/mongoDBApi');
const streamUrl = 'https://media2.streambrothers.com:8118/stream';
const chunkDurationInSeconds = 6; // 1 minute
const tempFolderPath = 'temp_stream_chunks';

let chunkIndex = 1;
let currentBytePosition = 0;
let programCheck = null;
var recordedList = [];
let progName = "";

// Create the temp folder if it doesn't exist
if (!fs.existsSync(tempFolderPath)) {
  fs.mkdirSync(tempFolderPath);
}
let record = false;

// var programs = {"Lwaki Nze":{"start":[21,43],"stop":[]}}

// Lwakinze Wednesday or Thursday
function isLwakiNze(HH, MM, DD) {
  return DD === 'Wednesday' || DD === 'Thursday' && HH === 9 && MM >= 17;
}
function lwakiNzeStop(HH, MM){
  return HH === 11 && MM >= 21;
}

// Kasismuka everyday
function isKasisimuka(HH, MM){
  return HH === 2 && MM >= 45;
}
function kasisimukaStop(HH, MM){
  return HH === 3 && MM >= 0;
}

// Sokka ononye on Sarturday
function isSabbath(HH, MM, DD){
  return DD === 'Saturday' && HH === 7 && MM >= 0;
}
function sabbathStop(HH, MM){
  return HH === 8 && MM >= 0;
}

// function to test server
function test1(HH, MM, DD){
  return HH === 13 && MM >= 0;
}
function stopTest1(HH, MM){
  return HH === 14 && MM >= 0;
}

programCheck = setInterval(() => {
  const time = new Date();
  const HH = time.getHours();
  const MM = time.getMinutes();
  const options = { weekday: 'long'}  //, timeZone: 'Africa/Nairobi' };
  const DD = time.toLocaleDateString('en-US', options);
  // console.log(DD)
  // console.log(time.toTimeString())

  // logic to start recording
  if(!record){
    if(isLwakiNze(HH,MM, DD)){
      startRecording("Lwaki Nze");
    }
    else if(isKasisimuka(HH,MM)){
      startRecording("Kasisimuka");
    }
    else if(isSabbath(HH, MM, DD)){
      startRecording("Sokka ononye");
    }
    else if(test1(HH, MM, DD)){
      startRecording('Test RUn');
    }
  }
  // logic to stop reecording
  else{
    if(lwakiNzeStop(HH,MM)){
      stopRecording("Lwaki Nze");
    }
    else if(kasisimukaStop(HH,MM)){
      stopRecording("Kasisimuka");
    }
    else if(sabbathStop(HH,MM)){
      stopRecording("Sokka ononye");
    }
    else if(stopTest1(HH,MM)){
      stopRecording("test Run")
    }
  }
}, 10000); // Run every 10 seconds

function startRecording(prog){
  record = true;
  progName = prog;
  fetchAndRecordChunk();
  console.log("Recording started - "+prog);
}
function stopRecording(prog){
  record = false;
  console.log("Recording stopped - "+prog);
}

function fetchAndRecordChunk() {
  let dayOfRec = dateOfRec();
  const startByte = currentBytePosition;
  fetch(streamUrl)
    .then(response => {
      // declaring fundamental variables 
      let bytesRead = 0;
      let interval = null;

      // Declaring name of files to save and saving
      const fileName = `${dayOfRec}_recording_${progName}_${chunkIndex}.mp3`
      const chunkFilePath = path.join(tempFolderPath, fileName);
      console.log("File Path: "+chunkFilePath);
      const outputStream = fs.createWriteStream(chunkFilePath).on("finish",()=>{
        console.log('Chunk written successfully');
      });
      
      recordedList.push(fileName);
      // Timer to check size of recorded file.
      interval = setInterval(() => {
        if(record){
          // console.log(`Bytes written: ${bytesRead}`);
          if (bytesRead >= 1000 * 1024) {
            console.log(`Chunk ${chunkIndex} recorded: ${chunkFilePath}`);
            clearInterval(interval); // Clear the interval when done
            outputStream.end();
            response.body.destroy();
            chunkIndex++;
            currentBytePosition = bytesRead;
            setTimeout(ftp.uploadToFTP2(tempFolderPath,progName,[fileName]),10000);
            // Fetch and record the next chunk
            fetchAndRecordChunk(); // Close the response stream
          }
        }
        else{
          clearInterval(interval);
          outputStream.end();
          response.body.destroy();
          setTimeout(() => {
            ftp.uploadToFTP2(tempFolderPath,progName,[fileName]) // uploading last chunk
            db.updateRow2({program: progName, files: recordedList},{program: progName, files: recordedList, Day:dayOfRec},'radio','recordings');
            progName = "";
          },10000);
        }
      }, 1000); // Log progress every second


      // Write the chunk content to a temporary file
      response.body.on('data', chunk => {
        bytesRead += chunk.length;
        outputStream.write(chunk);
      });

      response.body.on('end', () => {
        console.log(`Chunk ${chunkIndex} recorded: ${chunkFilePath}`);
        clearInterval(interval); // Clear the interval when done
        outputStream.end();
        chunkIndex++;
        currentBytePosition = bytesRead;

        // Fetch and record the next chunk
        fetchAndRecordChunk();
      });
    })
    .catch(error => {
      console.error(`Error fetching or recording chunk ${chunkIndex}:`, error);
    });
}

function dateOfRec(){
  const currentDate = new Date();
  const day = currentDate.getDate();
  const month = currentDate.getMonth() + 1; // Adding 1 to match human-readable month representation (1 to 12)
  const year = currentDate.getFullYear();
  const hh = currentDate.getHours();
  const mm = currentDate.getMinutes();

  return `${day}-${month}-${year}[${hh} ${mm}]`;
}
// Start fetching and recording chunks from the beginning

// fs.unlink(path.join(__dirname,"temp_stream_chunks/17 8 2023_recording_Lwaki Nze_1.mp3"), err => {
//   if (err) {
//     console.error(`Error deleting file:`, err);
//   } else {
//     console.log(`file deleted successfully.`);
//   }
// });

module.exports = programCheck;