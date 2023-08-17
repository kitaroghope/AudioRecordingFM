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

function isLwakiNze(currentTime) {
  const currentHour = currentTime.getHours();
  const currentMinute = currentTime.getMinutes();

  return currentHour === 21 && currentMinute >= 45;
}
function lwakiNzeStop(currentTime){
  const currentHour = currentTime.getHours();
  const currentMinute = currentTime.getMinutes();

  return currentHour === 23 && currentMinute >= 15;
}

programCheck = setInterval(() => {
  const time = new Date();
  console.log(time.toDateString())
  if (record == false && isLwakiNze(time)) {
    startRecording("Lwaki Nze");
  } else if(record == true && lwakiNzeStop(time)) {
    stopRecording("Lwaki Nze");
  }
}, 10000); // Log progress every second

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
      const chunkFilePath = path.join(tempFolderPath, `${dayOfRec}_recording_${progName}_${chunkIndex}.mp3`);
      const outputStream = fs.createWriteStream(chunkFilePath).on("finish",()=>{
        console.log('Those is written');
      });
      
      recordedList.push(`${dayOfRec}_recording_${progName}_${chunkIndex}.mp3`);
      // Timer to check size of recorded file.
      interval = setInterval(() => {
        if(record){
          console.log(`Bytes written: ${bytesRead}`);
          if (bytesRead >= 300 * 1024) {
            console.log(`Chunk ${chunkIndex} recorded: ${chunkFilePath}`);
            clearInterval(interval); // Clear the interval when done
            outputStream.end();
            
            response.body.destroy();
            chunkIndex++;
            currentBytePosition = bytesRead;
            // Fetch and record the next chunk
            fetchAndRecordChunk(); // Close the response stream
          }
        }
        else{
          clearInterval(interval);
          outputStream.end();
          response.body.destroy();
          setTimeout(() => {
            ftp.uploadToFTP2(tempFolderPath,progName,recordedList);
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

  return `${day} ${month} ${year}`;
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