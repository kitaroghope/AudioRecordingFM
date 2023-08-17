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

async function connectFTP() {
  if (!ftpClient || !ftpClient.connected) {
    ftpClient = new Client();

    // Connect to the FTP server
    return new Promise((resolve, reject) => {
      ftpClient.on('ready', () => {
        console.log('Connected to FTP server');
        resolve();
      });

      ftpClient.on('error', (err) => {
        console.log('FTP connection error:', err.message);
        reject(err);
      });

      ftpClient.connect({
        host: con.ftp.host,
        port: 21,
        user: con.ftp.username,
        password: con.ftp.password,
      });
    });
  } else {
    // The client is already connected
    return Promise.resolve();
  }
}
const maxRetries = 5; // Number of maximum retries
const retryInterval = 3000; // Retry interval in milliseconds (e.g., 3000ms = 3 seconds)

async function connectFTPRetry(maxRetries, retryInterval) {
  let retries = 0;

  while (retries < maxRetries) {
    try {
      await connectFTP();
      return; // Resolve the promise if connectFTP() is successful
    } catch (error) {
      console.log(`Failed to connect to FTP server. Retrying in ${retryInterval}ms...`);
      retries++;
      await new Promise((resolve) => setTimeout(resolve, retryInterval));
    }
  }

  throw new Error(`Unable to connect to FTP server after ${maxRetries} retries.`);
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
                  console.error(`Error deleting ${fileName}:`, err);
                } else {
                  console.log(`${fileName} deleted successfully.`);
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


module.exports = {uploadToFTP, uploadToFTP2};
