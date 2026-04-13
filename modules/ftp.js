const Client = require('ftp');
const con = require('../config.json');
const db = require('./mongoDBApi');
const fs = require('fs');
const path = require('path');

// Define a list of forbidden file extensions or MIME types
const forbiddenFileExtensions = ['.exe', '.bat', '.sh'];
// You can also define forbidden MIME types if needed, e.g., 'application/x-msdownload'

async function renameFile(filename, newFilename) {
  const ext = filename.slice(filename.lastIndexOf('/'));
  return newFilename + ext;
}

var ftpClient;

// FTP Configuration (loaded from config)
const ftpConfig = {
  host: con.ftp.host,
  port: con.ftp.port || 21,
  user: con.ftp.username,
  password: con.ftp.password
};

console.log(`[FTP] Initialized with host: ${ftpConfig.host}:${ftpConfig.port}, user: ${ftpConfig.user}`);

async function connectFTP() {
  if (!ftpClient || !ftpClient.connected) {
    // Create new client instance
    ftpClient = new Client();

    // Connect to the FTP server
    return new Promise((resolve, reject) => {
      // Set connection timeout
      ftpClient.connect({
        host: ftpConfig.host,
        port: ftpConfig.port,
        user: ftpConfig.user,
        password: ftpConfig.password,
        connTimeout: 30000, // 30 second connection timeout
        pasvTimeout: 30000  // 30 second PASV timeout
      });

      ftpClient.on('ready', () => {
        console.log(`[FTP] ✓ Successfully connected to ${ftpConfig.host}:${ftpConfig.port}`);
        resolve();
      });

      ftpClient.on('error', (err) => {
        console.log(`[FTP] ✗ Connection error to ${ftpConfig.host}:${ftpConfig.port} - ${err.message} (Code: ${err.code})`);
        reject(err);
      });

      ftpClient.on('close', () => {
        console.log(`[FTP] Connection closed to ${ftpConfig.host}`);
      });

      ftpClient.on('end', () => {
        console.log(`[FTP] Connection ended to ${ftpConfig.host}`);
      });
    });
  } else {
    // The client is already connected
    console.log(`[FTP] Already connected to ${ftpConfig.host}`);
    return Promise.resolve();
  }
}

const maxRetries = 5; // Number of maximum retries
const retryInterval = 3000; // Retry interval in milliseconds (e.g., 3000ms = 3 seconds)

async function connectFTPRetry(maxRetries, retryInterval) {
  let retries = 0;

  while (retries < maxRetries) {
    try {
      console.log(`[FTP] Attempt ${retries + 1}/${maxRetries} to connect to ${ftpConfig.host}:${ftpConfig.port}...`);
      await connectFTP();
      return; // Resolve the promise if connectFTP() is successful
    } catch (error) {
      console.log(`[FTP] ✗ Attempt ${retries + 1}/${maxRetries} failed: ${error.message}`);
      retries++;
      if (retries < maxRetries) {
        console.log(`[FTP] Retrying in ${retryInterval}ms...`);
        await new Promise((resolve) => setTimeout(resolve, retryInterval));
      }
    }
  }

  const errorMsg = `Unable to connect to FTP server ${ftpConfig.host}:${ftpConfig.port} after ${maxRetries} retries. ` +
    `Possible causes:\n` +
    `  - Server is down or unreachable\n` +
    `  - Firewall blocking port ${ftpConfig.port}\n` +
    `  - Incorrect credentials (user: ${ftpConfig.user})\n` +
    `  - Network connectivity issues\n` +
    `  - Server requires passive/active mode`;
  console.log(`[FTP] ${errorMsg}`);
  throw new Error(errorMsg);
}

async function uploadToFTP(req, res, next) {
  const files = req.files;
  if (!files || files.length === 0) {
    console.log('No files to upload');
    next();
    return;
  }

  try {
    // await connectFTP();
    await connectFTPRetry(maxRetries,retryInterval);
    let uploadedCount = 0;

    // Validate each file before upload
    for (const file of files) {
      // Check if the file's extension is in the list of forbidden extensions
      const fileExt = file.originalname.slice(file.originalname.lastIndexOf('.'));
      if (forbiddenFileExtensions.includes(fileExt)) {
        console.log('Forbidden file:', file.originalname);
        delete req.files.file;
        if (uploadedCount+1 === files.length) {
          next();
          // Close the FTP connection
          ftpClient.end();
        }
        uploadedCount++;
        continue; // Skip the upload and move to the next file
      }

      const newFilename = "htdocs/uploads/" + file.originalname;
      const remoteFilePath = newFilename;
      const remoteDirectory = remoteFilePath.substring(0, remoteFilePath.lastIndexOf('/'));

      // Create the subdirectory on the FTP server
      ftpClient.mkdir(remoteDirectory, true, (err) => {
        if (err) {
          console.log(err.message);
          return;
        }

        // Upload the file to the FTP server
        ftpClient.put(file.path, remoteFilePath, (err) => {
          console.log('Uploading: '+file.originalname)
          uploadedCount++;
          if (err) {
            console.log(err.message);
            return;
          }


          if (uploadedCount === files.length) {
            console.log('All files uploaded successfully');
            // Close the FTP connection
            next();
            // ftpClient.end();
          }
        });
      });
    }
  } catch (error) {
    console.log('Error connecting to FTP server:', error.message);
    res.render('error',{error:error.message});
  }
}

async function uploadToFTP2(pathToFolderWithFiles, folderNameOnFtpServer, arrayOfFiles) {
  if (arrayOfFiles.length === 0) {
    console.log('No files to upload');
    return;
  }

  try {
    // await connectFTP();
    await connectFTPRetry(maxRetries,retryInterval);
    let uploadedCount = 0;

    // Validate each file before upload
    for (const file of arrayOfFiles) {
      // Check if the file's extension is in the list of forbidden extensions
      const fileExt = file.slice(file.lastIndexOf('.'));
      if (forbiddenFileExtensions.includes(fileExt)) {
        console.log('Forbidden file:', file);
        if (uploadedCount+1 === arrayOfFiles.length) {
          // Close the FTP connection
          ftpClient.end();
        }
        uploadedCount++;
        continue; // Skip the upload and move to the next file
      }

      const newFilename = "htdocs/uploads/"+folderNameOnFtpServer+"/"+ file;
      const filePath = path.join(__dirname, "../"+pathToFolderWithFiles+"/"+file);
      const remoteFilePath = newFilename;
      const remoteDirectory = "htdocs/uploads/"+folderNameOnFtpServer;

      // Create the subdirectory on the FTP server
      ftpClient.mkdir(remoteDirectory, true, (err) => {
        if (err) {
          console.log(err.message);
          return;
        }

        // Upload the file to the FTP server
        ftpClient.put(filePath, remoteFilePath, (err) => {
          console.log('Uploading: '+file)
          uploadedCount++;
          if (err) {
            console.log(err.message);
            return;
          }


          if (uploadedCount === arrayOfFiles.length) {
            console.log('All files uploaded successfully');
            arrayOfFiles.forEach(fileName => {
              fs.unlink(path.join(__dirname, "../"+pathToFolderWithFiles+"/"+fileName), err => {
                if (err) {
                  // console.error(`Error deleting ${fileName}:`, err);
                  return;
                } else {
                  // console.log(`${fileName} deleted successfully.`);
                  return;
                }
              });
            });
            // Close the FTP connection
            // ftpClient.end();
          }
        });
      });
    }
  } catch (error) {
    console.log('Error connecting to FTP server:', error.message);
    res.render('error',{error:error.message});
  }
}

// Check if a file exists on the FTP server
async function checkFileExists(remotePath) {
  try {
    console.log(`[FTP] Checking if file exists: ${remotePath}`);
    await connectFTPRetry(maxRetries, retryInterval);

    // Extract directory and filename from path
    const lastSlash = remotePath.lastIndexOf('/');
    const dirPath = remotePath.substring(0, lastSlash);
    const fileName = remotePath.substring(lastSlash + 1);

    console.log(`[FTP] Checking dir: ${dirPath}, file: ${fileName}`);

    return new Promise((resolve) => {
      // List files in the directory and check if our file exists
      ftpClient.list(dirPath, (err, list) => {
        if (err) {
          console.log(`[FTP] ERROR listing directory ${dirPath}: ${err.message}`);
          resolve(false);
        } else {
          // Check if file exists in the list
          const fileFound = list.find(item => item.name === fileName);
          if (fileFound) {
            console.log(`[FTP] File EXISTS: ${remotePath} (size: ${fileFound.size} bytes)`);
            resolve(true);
          } else {
            console.log(`[FTP] File NOT found in directory listing: ${fileName}`);
            console.log(`[FTP] Available files: ${list.map(f => f.name).join(', ')}`);
            resolve(false);
          }
        }
      });
    });
  } catch (error) {
    console.log(`[FTP] ERROR checking file ${remotePath}: ${error.message}`);
    return false;
  }
}

// Delete a file from the FTP server
async function deleteFileFromFTP(remotePath) {
  try {
    // Skip invalid paths
    if (!remotePath || remotePath.includes('/.') || remotePath.endsWith('/')) {
      console.log(`[FTP] Skipping invalid path: ${remotePath}`);
      return false;
    }

    console.log(`[FTP] Attempting to delete: ${remotePath}`);
    await connectFTPRetry(maxRetries, retryInterval);

    return new Promise((resolve) => {
      ftpClient.delete(remotePath, (err) => {
        if (err) {
          console.log(`[FTP] ✗ FAILED to delete ${remotePath}: ${err.message}`);
          resolve(false);
        } else {
          console.log(`[FTP] ✓ SUCCESSFULLY DELETED: ${remotePath}`);
          resolve(true);
        }
      });
    });
  } catch (error) {
    console.log(`[FTP] ✗ ERROR deleting ${remotePath}: ${error.message}`);
    return false;
  }
}

// Delete a directory from the FTP server
async function deleteFolderFromFTP(remotePath) {
  try {
    // Skip invalid paths
    if (!remotePath || remotePath.includes('/.') || remotePath === 'htdocs/uploads') {
      console.log(`[FTP] Skipping invalid folder path: ${remotePath}`);
      return false;
    }

    console.log(`[FTP] Attempting to delete folder: ${remotePath}`);
    await connectFTPRetry(maxRetries, retryInterval);

    return new Promise((resolve) => {
      ftpClient.rmdir(remotePath, (err) => {
        if (err) {
          console.log(`[FTP] ✗ FAILED to delete folder ${remotePath}: ${err.message}`);
          resolve(false);
        } else {
          console.log(`[FTP] ✓ SUCCESSFULLY DELETED FOLDER: ${remotePath}`);
          resolve(true);
        }
      });
    });
  } catch (error) {
    console.log(`[FTP] ✗ ERROR deleting folder ${remotePath}: ${error.message}`);
    return false;
  }
}

// List files in a directory on the FTP server
async function listFTPFiles(remotePath = 'htdocs/uploads') {
  try {
    console.log(`[FTP] Listing directory: ${remotePath}`);
    await connectFTPRetry(maxRetries, retryInterval);
    return new Promise((resolve) => {
      ftpClient.list(remotePath, (err, list) => {
        if (err) {
          console.log(`[FTP] ERROR listing ${remotePath}: ${err.message}`);
          resolve([]);
        } else {
          // Filter out . and .. entries
          const filteredList = list.filter(item => item.name !== '.' && item.name !== '..');

          console.log(`[FTP] Found ${filteredList.length} items in ${remotePath}:`);
          filteredList.forEach(item => {
            const type = item.type === 'd' ? 'DIR' : 'FILE';
            console.log(`[FTP]   [${type}] ${item.name} (${item.size || 0} bytes)`);
          });
          resolve(filteredList);
        }
      });
    });
  } catch (error) {
    console.log(`[FTP] ERROR listing ${remotePath}: ${error.message}`);
    return [];
  }
}

// Sync old files (older than 2 weeks) - delete from both FTP and DB
async function syncOldFiles() {
  console.log('[SYNC] ============================================');
  console.log('[SYNC] STARTING OLD FILES CLEANUP');
  console.log('[SYNC] ============================================');

  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const cutoffDate = twoWeeksAgo.toISOString().split('T')[0];
  console.log(`[SYNC] Deleting recordings older than: ${cutoffDate} (14 days ago)`);

  try {
    // Get all recordings from DB
    console.log('[SYNC] Fetching recordings from database...');
    const recs = await db.readRows({}, 'radio', 'recordings');

    if (!recs.listings || recs.listings.length === 0) {
      console.log('[SYNC] No recordings found in database. Nothing to cleanup.');
      return;
    }

    console.log(`[SYNC] Found ${recs.listings.length} recording(s) in database`);
    let deletedCount = 0;
    let skippedCount = 0;

    for (const rec of recs.listings) {
      try {
        // Parse the Day field (format: "27-03-2026")
        const [day, month, year] = rec.Day.split('-').map(Number);
        const recDate = new Date(year, month - 1, day);
        const recDateStr = recDate.toISOString().split('T')[0];

        if (recDate < twoWeeksAgo) {
          console.log(`[SYNC] OLD RECORDING FOUND: "${rec.program}" from ${rec.Day} (${recDateStr})`);

          if (rec.files && rec.files.length > 0) {
            console.log(`[SYNC]   Files to process: ${rec.files.length}`);
            for (const file of rec.files) {
              const ftpPath = `htdocs/uploads/${rec.program}/${file}`;
              console.log(`[SYNC]   Processing: ${ftpPath}`);

              // Check if file exists on FTP
              const exists = await checkFileExists(ftpPath);
              if (exists) {
                // Delete from FTP
                const deleted = await deleteFileFromFTP(ftpPath);
                if (deleted) {
                  console.log(`[SYNC]   ✓ Deleted from FTP: ${file}`);
                }
              } else {
                console.log(`[SYNC]   - File not on FTP (already deleted?): ${file}`);
              }
            }
          } else {
            console.log(`[SYNC]   No files attached to this recording`);
          }

          // Delete from database
          await db.deleteRow({ program: rec.program, Day: rec.Day }, 'radio', 'recordings');
          console.log(`[SYNC]   ✓ Deleted DB record: ${rec.program} - ${rec.Day}`);
          deletedCount++;
        } else {
          skippedCount++;
        }
      } catch (err) {
        console.log(`[SYNC] ✗ ERROR processing recording ${rec.program} - ${rec.Day}: ${err.message}`);
      }
    }

    console.log('[SYNC] ============================================');
    console.log(`[SYNC] CLEANUP COMPLETE`);
    console.log(`[SYNC]   Deleted: ${deletedCount} old recording(s)`);
    console.log(`[SYNC]   Skipped (recent): ${skippedCount} recording(s)`);
    console.log('[SYNC] ============================================');
  } catch (error) {
    console.log(`[SYNC] ✗ FATAL ERROR during cleanup: ${error.message}`);
  }
}

// Sync program folders with database
// autoDelete: if true, will delete FTP folders that don't exist in DB
async function syncProgramFolders(autoDelete = true) {
  console.log('[SYNC] ============================================');
  console.log('[SYNC] STARTING PROGRAM FOLDERS SYNC');
  console.log(`[SYNC] Auto-delete extra folders: ${autoDelete ? 'ENABLED' : 'DISABLED'}`);
  console.log('[SYNC] ============================================');

  try {
    // Get programs from DB
    console.log('[SYNC] Fetching programs from database...');
    const programs = await db.readRows({}, 'radio', 'programs');
    const dbPrograms = programs.listings ? programs.listings.map(p => p.prog) : [];
    console.log(`[SYNC] Found ${dbPrograms.length} program(s) in database`);

    // Get folders from FTP
    console.log('[SYNC] Fetching folders from FTP server...');
    const ftpList = await listFTPFiles('htdocs/uploads');
    const ftpFolders = ftpList
      .filter(item => item.type === 'd')
      .map(item => item.name);

    console.log(`[SYNC] Found ${ftpFolders.length} folder(s) on FTP`);

    // Find programs in DB but not in FTP
    const missingInFTP = dbPrograms.filter(p => !ftpFolders.includes(p));
    // Find folders in FTP but not in DB
    const extraInFTP = ftpFolders.filter(f => !dbPrograms.includes(f));

    console.log('[SYNC] ============================================');
    console.log('[SYNC] SYNC RESULTS:');
    console.log('[SYNC] --------------------------------------------');
    console.log('[SYNC] Programs in DATABASE:', dbPrograms.join(', ') || '(none)');
    console.log('[SYNC] Folders on FTP:', ftpFolders.join(', ') || '(none)');
    console.log('[SYNC] --------------------------------------------');

    if (missingInFTP.length > 0) {
      console.log(`[SYNC] ⚠ WARNING: ${missingInFTP.length} program(s) in DB but missing on FTP:`, missingInFTP.join(', '));
    } else {
      console.log('[SYNC] ✓ All DB programs have folders on FTP');
    }

    // Delete extra folders from FTP if autoDelete is enabled
    if (extraInFTP.length > 0) {
      if (autoDelete) {
        console.log(`[SYNC] 🚮 DELETING ${extraInFTP.length} extra folder(s) from FTP...`);
        for (const folder of extraInFTP) {
          const folderPath = `htdocs/uploads/${folder}`;
          console.log(`[SYNC] Processing folder: ${folderPath}`);

          // First, try to list and delete all files in the folder (with retry)
          try {
            const folderContents = await listFTPFiles(folderPath);
            console.log(`[SYNC] Found ${folderContents.length} item(s) in folder`);

            for (const item of folderContents) {
              if (item.type === '-') { // File
                const filePath = `${folderPath}/${item.name}`;
                console.log(`[SYNC] Deleting file: ${item.name}`);
                await deleteFileFromFTP(filePath);
              } else if (item.type === 'd') { // Subdirectory - recursive delete
                const subFolderPath = `${folderPath}/${item.name}`;
                console.log(`[SYNC] Deleting subfolder: ${item.name}`);
                await deleteFolderFromFTP(subFolderPath);
              }
            }
          } catch (err) {
            console.log(`[SYNC] Could not list folder contents: ${err.message}`);
          }

          // Try deleting the folder (may fail if not empty, that's OK)
          await deleteFolderFromFTP(folderPath);
        }
        console.log(`[SYNC] ✓ Deleted ${extraInFTP.length} extra folder(s) from FTP`);
      } else {
        console.log(`[SYNC] ⚠ WARNING: ${extraInFTP.length} folder(s) on FTP but NOT in DB:`, extraInFTP.join(', '));
      }
    } else {
      console.log('[SYNC] ✓ All FTP folders are in DB');
    }

    console.log('[SYNC] ============================================');

    const result = { dbPrograms, ftpFolders, missingInFTP, extraInFTP };
    return result;
  } catch (error) {
    console.log(`[SYNC] ✗ ERROR during program folders sync: ${error.message}`);
    return { dbPrograms: [], ftpFolders: [], missingInFTP: [], extraInFTP: [] };
  }
}


module.exports = {uploadToFTP, uploadToFTP2, checkFileExists, deleteFileFromFTP, deleteFolderFromFTP, listFTPFiles, syncOldFiles, syncProgramFolders};
