const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const ftp = require('./modules/ftp');
const db = require('./modules/mongoDBApi');
const con = require('./config.json');
const streamUrl = con.radios.prime;
const chunkDurationInSeconds = 6; // 1 minute
const tempFolderPath = 'temp_stream_chunks';

let chunkIndex = 1;
let programCheck = null;
var recordedList = [];
let progName = "";

// Create the temp folder if it doesn't exist
if (!fs.existsSync(tempFolderPath)) {
  fs.mkdirSync(tempFolderPath);
}
let record = false;
let userRecord = false;

// var programs = {"Lwaki Nze":{"start":[21,43],"stop":[]}}

// Lwakinze Wednesday or Thursday
function isLwakiNze(HH, MM, DD) {
  if(DD === 'Wednesday' || DD === 'Thursday'){
    return HH === 18 && MM >= 25;
  }
}
function lwakiNzeStop(HH, MM, DD){
  if(DD === 'Wednesday' || DD === 'Thursday'){
    return HH === 20 && MM >= 15;
  }
}
function isKweyita(HH, MM, DD) {
  if(DD === 'Monday' || DD === 'Tuesday'){
    return HH === 18 && MM >= 30;
  }
}
function kweyitaStop(HH, MM, DD){
  if(DD === 'Monday' || DD === 'Tuesday'){
    return HH === 20 && MM >= 15;
  }
}

// Kasismuka everyday
function isKasisimuka(HH, MM, DD){
  return HH === 2 && MM >= 0 && MM <= 44.5;
}
function kasisimukaStop(HH, MM, DD){
  return HH === 2 && MM >= 45;
}

// Sokka ononye on Sarturday
function isSabbath(HH, MM, DD){
  return DD === 'Saturday' && HH === 7 && MM >= 0;
}
function sabbathStop(HH, MM, DD){
  return DD === 'Saturday' &&  HH === 8 && MM >= 0;
}

// function to test server
function test1(HH, MM, DD){
  return HH === 16 && MM >= 4 // && // MM <= 34.5; //=== 'Friday';
}
function stopTest1(HH, MM, DD){
  return HH === 17 && MM >= 5;
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
  if(!record || userRecord){
    // console.log(userRecord);
    if(isLwakiNze(HH, MM, DD)){
      startRecording("Lwaki Nze");
    }
    else if(isKasisimuka(HH, MM, DD)){
      startRecording("Kasisimuka");
    }
    else if(isSabbath(HH, MM, DD)){
      startRecording("Zuula");
    }
    else if(isKweyita(HH, MM, DD)){
      startRecording("Kweyita Akatono");
    }
    // else if(test1(HH, MM, DD)){
    //   startRecording('Test Run');
    // }
  }
  // logic to stop reecording
  else{
    if(lwakiNzeStop(HH, MM, DD)){
      stopRecording("Lwaki Nze");
    }
    else if(kasisimukaStop(HH, MM, DD)){
      stopRecording("Kasisimuka");
    }
    else if(sabbathStop(HH, MM, DD)){
      stopRecording("Sokka ononye");
    }
    else if(kweyitaStop(HH, MM, DD)){
      stopRecording("Kweyita akatono");
    }
    // else if(stopTest1(HH,MM,DD)){
    //   stopRecording("test Run")
    // }
  }

}, 10000); // Run every 10 seconds

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
            // fs.readdir(tempFolderPath, (err, files) => {
            //   if (err) {
            //     // console.error('Error reading folder:', err);
            //     return;
            //   }
            
            //   files.forEach((file) => {
            //     const filePath = path.join(tempFolderPath, file);
            //     fs.unlink(filePath, (unlinkErr) => {
            //       if (unlinkErr) {
            //         return;
            //         // console.error('Error deleting file:', unlinkErr);
            //       } else {
            //         return;
            //         // console.log(`File ${file} deleted successfully.`);
            //       }
            //     });
            //   });
            // });       
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


module.exports = {
  programCheck,
  startRecording,
  stopRecording,
  userRecord,
  record
};
