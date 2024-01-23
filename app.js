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

setInterval(async()=>{
  progS = await db.readRows({},'radio','recordings');
}, 3600000)

app.get('/', async (req, res) => {
  try {
    let recs = {};
    if(progS.hasOwnProperty("listings")){
      recs = progS;
    }
    else{
      recs = await db.readRows({},'radio','recordings');
      progS = recs;
    }
    res.render('index', { streamUrl: streamUrl, recs:recs.listings});//recs.listings
  } catch (error) {
    res.send(error.message);
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
