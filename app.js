const express = require('express');
const path = require('path');
const app = express();
const recorder = require('./try');
const db = require('./modules/mongoDBApi');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

const port = 3000;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
// ... Previous code
let checkProg = recorder;

app.get('/', async (req, res) => {
  try {
    const recs = await db.readRows({program:"Test Run"},'radio','recordings');
    recs
    res.render('index', { streamUrl: 'https://media2.streambrothers.com:8118/stream', recs:recs.listings});
  } catch (error) {
    
  }
});

app.get('/keepAlive',(req, res) => {
  console.log('status checked');
  res.sendStatus(200);
});

app.post('/record', (req, res) => {
  // Start recording logic
  res.sendStatus(200);
});

app.post('/stop-record', (req, res) => {
  // Stop recording logic
  res.sendStatus(200);
});
  