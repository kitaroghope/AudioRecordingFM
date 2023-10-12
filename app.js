const express = require('express');
const path = require('path');
const app = express();
const recorder = require('./try');
const db = require('./modules/mongoDBApi');
const con = require('./config.json');
const streamUrl = con.radios.prime;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

const port = 3000;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
// ... Previous code
let checkProg = recorder.programCheck;

app.get('/', async (req, res) => {
  try {
    const recs = await db.readRows({},'radio','recordings');
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
  
