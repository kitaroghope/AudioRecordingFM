const express = require('express');
const path = require('path');
const app = express();
const cors = require('cors');
const recorder = require('./try');
const db = require('./modules/mongoDBApi');
const con = require('./config.json');
const streamUrl = con.radios.prime;

app.use(cors({
    origin: "*",
    methods: "*",
   allowedHeaders:"*"
}));
app.set('view engine', 'ejs');
app.use(express.json());
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
// app.use(express.urlencoded({extended:true}));

const port = 3300;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
// ... Previous code
let checkProg = recorder.programCheck;
let progS = {};

function viewDate(n){
  
  const [day, month, year] = n.split('-').map(Number);
  const date1 =  new Date(year, month - 1, day);

  const options = { month: 'short', year: 'numeric' };  // day: '2-digit',
  return date1.toLocaleDateString('en-US', options);

}

setInterval(async ()=>{
  progS = await recordings1();
}, 3600000);

async function recordings1(){
  let recs = {};
  recs = await db.readRows({},'radio','recordings');
  const days = {}
  var count = 0
  var count1 = 0
  for(i of recs.listings){
    if(viewDate(i.Day) == "Invalid Date"){
      console.log(i.Day);
    }
    
    if(days.hasOwnProperty(viewDate(i.Day))){
      days[`${viewDate(i.Day)}`].push(i)
      count++
    }
    else{
      days[`${viewDate(i.Day)}`] = [i];
      count1++
    }
  }
  console.log("Months are "+count1+" out of "+count+" recordings.")
  return days;
}

app.get('/', async (req, res) => {
  try {
    if(Object.keys(progS).length < 1){
      progS = await recordings1();
      res.render('index', { streamUrl: streamUrl, recs:progS});
      // console.log(progS)
    }//recs.listings
    else{
      res.render('index', { streamUrl: streamUrl, recs:progS});
      // console.log(progS)
    }
  } catch (error) {
    res.send(error.message);s
  }
});

app.get('/keepAlive',(req, res) => {
  console.log('status checked');
  res.sendStatus(200);
});

app.post('/record', async (req, res) => {
  // Start recording logic
  try {
    // console.log(recorder.record);
    const jk = await recorder.startRecording("User", true);
    res.json(jk);
  } catch (error) {
    res.json({message:error.message})
  }
});

app.post('/stop-record',async (req, res) => {
  // Stop recording logic
  try {
    const jk = await recorder.stopRecording("User",true);
    res.json(jk);
  } catch (error) {
    res.json({message:error.message});
  }
});

app.post('/newProgram', recorder.addProgram);
app.post('/deleteProgram', recorder.deleteProgram);


// async function renameDates(){
//   try {
//     var recs = await db.readRows({},'radio','recordings');
//     for(i of recs.listings){
//       if(i.hasOwnProperty('pm')){
//         console.log(i.program + " on " + i.Day);
//       }
//       else{
//         await db.deleteRow(i,"radio","recordings");
//       }
//       // console.log(n);
//     }
//   } catch (error) {
//     console.log(error.message)
//   }
// }
// renameDates();