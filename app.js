const express = require('express');
const path = require('path');
const app = express();
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const recorder = require('./try');
const db = require('./modules/mongoDBApi');
const ftp = require('./modules/ftp');
const config = require('./config');
const { verifyToken } = require('./middleware/auth');
const users = require('./modules/users');
const streamHealth = require('./modules/streamHealth');
// Read lazily — the stream-health checker can repoint this at a new host/port
// while the server is running.
const getStreamUrl = () => config.radios.prime;

app.use(cors({
    origin: config.cors.origins,
    methods: "*",
   allowedHeaders:"*"
}));
app.use(cookieParser());
app.set('view engine', 'ejs');
app.use(express.json());
app.set('views', path.join(__dirname, 'views'));
// `index: false` keeps "/" on the server-rendered EJS route below, so this
// folder's index.html stays reachable at /index.html without shadowing it.
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
// app.use(express.urlencoded({extended:true}));

// Global error handlers
app.use((err, req, res, next) => {
    console.error('[Global Error Handler]', {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method
    });

    // Don't expose stack trace in production
    const isDev = config.server.nodeEnv === 'development';

    // User-friendly error messages
    let userMessage = 'Something unexpected happened. Please try again in a few moments.';
    let userHint = 'If this problem persists, please contact support.';

    if (err.name === 'ValidationError') {
        userMessage = 'The information you provided could not be processed.';
        userHint = 'Please check your input and try again.';
    } else if (err.name === 'MongoServerError') {
        userMessage = 'A database error occurred.';
        userHint = 'Please try again. If the problem persists, contact support.';
    } else if (err.code === 'ECONNREFUSED') {
        userMessage = 'Could not connect to the server.';
        userHint = 'Please check your internet connection and try again.';
    }

    res.status(err.status || 500).json({
        error: err.name || 'ServerError',
        message: isDev ? err.message : userMessage,
        hint: isDev ? undefined : userHint,
        ...(isDev && { stack: err.stack })
    });
});

// JSON feed for the static landing page (public/index.html), which cannot
// receive server-rendered data. Same in-memory cache the EJS route uses.
app.get('/recordings', async (req, res) => {
  try {
    if (Object.keys(progS).length < 1) {
      progS = await recordings1();
    }
    await ensureProgramsLoaded(false);
    res.json({ streamUrl: getStreamUrl(), programs: progS || {} });
  } catch (error) {
    console.error('[GET /recordings]', error.message);
    res.status(500).json({ message: 'Could not load recordings.', programs: {} });
  }
});

/* -------------------------------------------------------------------------- */
/* Program schedule loading                                                    */
/*                                                                             */
/* recordings1() depends on the Mongo client being connected. If it is not,    */
/* db.readRows returns undefined and the whole refresh throws — so we share    */
/* one in-flight load, retry on a cooldown instead of caching the failure, and */
/* kick off an attempt shortly after boot.                                     */
/* -------------------------------------------------------------------------- */
const programsLoad = { inFlight: null, lastAttemptAt: 0, lastSuccessAt: 0 };
const PROGRAMS_RETRY_MS = 30000;

async function ensureProgramsLoaded(force) {
  const now = Date.now();

  if (programsLoad.inFlight) return programsLoad.inFlight;

  const haveData = recordedPrograms && Array.isArray(recordedPrograms.listings) && recordedPrograms.listings.length > 0;
  if (!force && haveData) return recordedPrograms;

  // Do not hammer the database while the connection is still coming up.
  if (!force && now - programsLoad.lastAttemptAt < PROGRAMS_RETRY_MS) return recordedPrograms;

  programsLoad.lastAttemptAt = now;

  programsLoad.inFlight = (async () => {
    try {
      await recordings1();
      if (recordedPrograms && Array.isArray(recordedPrograms.listings)) {
        programsLoad.lastSuccessAt = Date.now();
      }
    } catch (error) {
      console.error('[programs] schedule load failed:', error.message);
    } finally {
      programsLoad.inFlight = null;
    }
    return recordedPrograms;
  })();

  return programsLoad.inFlight;
}

// Warm the schedule shortly after boot instead of waiting for a page view.
setTimeout(() => { ensureProgramsLoaded(true).catch(() => {}); }, 3000);

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Unhandled Rejection]', {
        reason: reason instanceof Error ? reason.message : reason,
        stack: reason instanceof Error ? reason.stack : undefined
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('[Uncaught Exception]', {
        message: error.message,
        stack: error.stack
    });
    // Exit with error code for process supervision to restart
    process.exit(1);
});

const port = config.server.port || 3300;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
// ... Previous code
let checkProg = recorder.programCheck;
let progS = {};
let recordedPrograms = {};

function viewDate(n){
  
  const [day, month, year] = n.split('-').map(Number);
  const date1 =  new Date(year, month - 1, day);

  const options = { month: 'short', year: 'numeric' };  // day: '2-digit',
  return date1.toLocaleDateString('en-US', options);

}

setInterval(async ()=>{
  progS = await recordings1();
}, 3600000);

// Self-healing check: if the Prime Radio stream is dead, look the station up
// on radio.co.ug and repoint config at the URL that is actually serving.
// Runs in-process every hour; also exposed on demand at /stream-health.
streamHealth.startStreamHealthCheck(60 * 60 * 1000);

app.get('/stream-health', async (req, res) => {
  try {
    const outcome = await streamHealth.checkPrimeStream();
    res.json({ outcome: outcome, state: streamHealth.getState() });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Run old files cleanup and program folders sync every hour
setInterval(async () => {
  try {
    // Sync program folders to check alignment
    await ftp.syncProgramFolders();

    // Cleanup old files (older than 2 weeks)
    await ftp.syncOldFiles();
  } catch (error) {
    console.log('[SCHEDULED] Error during scheduled sync:', error.message);
  }
}, 3600000); // Run every hour

async function recordings1(){
  let recs = {};
  recs = await db.readRows({},'radio','recordings');
  const days = {}
  var count = 0
  var count1 = 0
  for(i of recs.listings){
    // if(viewDate(i.Day) == "Invalid Date"){
    //   console.log(i.Day);
    // }
    
    // if(days.hasOwnProperty(viewDate(i.Day))){
    //   days[`${viewDate(i.Day)}`].push(i)
    //   count++
    // }
    // else{
    //   days[`${viewDate(i.Day)}`] = [i];
    //   count1++
    // }
    // if(viewDate(i.Day) == "Invalid Date"){
    //   console.log(i.Day);
    // }
    
    if(days.hasOwnProperty(i.program)){
      days[`${i.program}`].push(i)
      count++
    }
    else{
      days[`${i.program}`] = [i];
      count1++
    }
  }
  console.log("Months are "+count1+" out of "+count+" recordings.");
  recordedPrograms = await db.readRows({},'radio','programs');
  console.log(days);
  return days;
}

app.get('/', async (req, res) => {
  try {
    if(Object.keys(progS).length < 1){
      progS = await recordings1();
      res.render('index', { streamUrl: getStreamUrl(), recs:progS});
      // console.log(progS)
    }//recs.listings
    else{
      res.render('index', { streamUrl: getStreamUrl(), recs:progS});
      // console.log(progS)
    }
  } catch (error) {
    res.send(error.message);s
  }
});

app.get("/recordedPrograms", async (req, res) => {
  try {
    await ensureProgramsLoaded(false);
    const listings = (recordedPrograms && Array.isArray(recordedPrograms.listings))
      ? recordedPrograms.listings
      : [];
    res.json({ listings });
  } catch (error) {
    res.json({ listings: [] });
  }
});

app.get('/keepAlive',(req, res) => {
  console.log('status checked');
  res.sendStatus(200);
});

// --------------------------------------------------------------------------
// Registration
// --------------------------------------------------------------------------
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    const result = await users.createUser({ username, password });

    if (!result.ok) {
      return res.status(result.status).json({
        error: result.status === 409 ? 'Username taken' : 'Validation failed',
        message: result.status === 409
          ? 'That username is already taken.'
          : 'Please fix the following issues:',
        errors: result.errors
      });
    }

    console.log('[register] created account:', result.user.username, '(' + result.user.role + ')');

    // Sign them straight in so registration is a single step.
    const token = jwt.sign(
      { username: result.user.username, role: result.user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: config.server.nodeEnv === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000
    });

    res.status(201).json({
      message: 'Account created successfully',
      user: result.user,
      token,
      expiresIn: config.jwt.expiresIn
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'An error occurred while creating the account'
    });
  }
});

// --------------------------------------------------------------------------
// Login — database accounts first, environment admin as the bootstrap path
// --------------------------------------------------------------------------
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({
        error: 'Missing credentials',
        message: 'Username and password are required'
      });
    }

    let account = await users.authenticate(username, password);
    let viaEnvAdmin = false;

    // Fallback so there is always a way in before any account exists, and so
    // an operator can still use ADMIN_USERNAME/ADMIN_PASSWORD.
    if (!account) {
      const validUsername = process.env.ADMIN_USERNAME || 'admin';
      const validPassword = process.env.ADMIN_PASSWORD || 'admin123';

      if (username === validUsername && password === validPassword) {
        account = { username: validUsername, role: 'admin' };
        viaEnvAdmin = true;
      }
    }

    if (!account) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Username or password is incorrect'
      });
    }

    const token = jwt.sign(
      { username: account.username, role: account.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: config.server.nodeEnv === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000
    });

    res.json({
      message: 'Login successful',
      username: account.username,
      role: account.role,
      viaEnvAdmin,
      token,
      expiresIn: config.jwt.expiresIn
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'An error occurred during login'
    });
  }
});

// Only administrators may change the schedule. Registered "user" accounts can
// sign in and browse, but cannot add, edit or delete programs.
function requireRole(role) {
  return function (req, res, next) {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'This action requires an administrator account.',
        hint: 'Ask an administrator to change your role.'
      });
    }
    next();
  };
}

// Logout endpoint
app.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

app.post('/record', verifyToken, async (req, res) => {
  // Start recording logic
  try {
    // console.log(recorder.record);
    const jk = await recorder.startRecording("User", true);
    res.json(jk);
  } catch (error) {
    res.json({message:error.message})
  }
});

app.post('/stop-record', verifyToken, async (req, res) => {
  // Stop recording logic
  try {
    const jk = await recorder.stopRecording("User",true);
    res.json(jk);
  } catch (error) {
    res.json({message:error.message});
  }
});

app.post('/newProgram', verifyToken, requireRole('admin'), recorder.addProgram);
app.post('/updateProgram', verifyToken, requireRole('admin'), recorder.updateProgram);
app.post('/deleteProgram', verifyToken, requireRole('admin'), recorder.deleteProgram);

// FTP Manager page
app.get('/ftp-manager', async (req, res) => {
  try {
    res.render('ftp-manager');
  } catch (error) {
    res.send(error.message);
  }
});

// Manual sync endpoints for troubleshooting
app.get('/sync-folders', verifyToken, async (req, res) => {
  try {
    const result = await ftp.syncProgramFolders();
    res.json({ message: 'Program folders synced', result });
  } catch (error) {
    res.json({ message: 'Error syncing folders', error: error.message });
  }
});

app.get('/sync-old-files', verifyToken, async (req, res) => {
  try {
    await ftp.syncOldFiles();
    res.json({ message: 'Old files cleanup complete' });
  } catch (error) {
    res.json({ message: 'Error cleaning up old files', error: error.message });
  }
});

app.get('/list-ftp-files', verifyToken, async (req, res) => {
  try {
    const files = await ftp.listFTPFiles();
    res.json({ message: 'FTP files listed', files });
  } catch (error) {
    res.json({ message: 'Error listing FTP files', error: error.message });
  }
});


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
