// Import the required modules
// const MongoClient = require('mongodb').MongoClient;
const { MongoClient } = require("mongodb");
const con = require('./../config.json');
const url = con.mongoDB.url; // Update this to your MongoUri [visit mongodb.com to get one if you have none]



// DB connection an creating client
// Define the MongoDB connection URL and database name

var client;
var counter = 0;
async function createClient(){
    try {
        // client = await MongoClient.connect(url, { useNewUrlParser: true, useUnifiedTopology: true });
        client = new MongoClient(url)
        console.log('Connected to MongoDB server');
        return await checkClient();
    } catch (err) {
        console.log(err.message)
    }
}

async function isClientConnected(client) {
  try {
    // Check if the client is connected by running a simple command
    await client.db('admin').command({ ping: 1 });
    counter = 0;
    return true;
  } catch (err) {
    console.log("check connect error: "+err.message)
    if(err.message == "Topology is closed"){
        await createClient();
    }
    counter++;
    // Return false if there is an error (e.g. NetworkTimeout, ServerSelectionTimeoutError)
    return false;
  }
}

async function checkClient(){
    if(!client){
        return await createClient();
    }
    else if(!await isClientConnected(client)){
        try {
            console.log(`Checking db Connection attempt ${counter}`);
            if(counter >= 5){
                counter = 0;
                return false;
            }
            return await checkClient();
        } catch (err) {
            console.log("Mongo error: "+err.message)
            return await checkClient();
        }
    }
    else{
        console.log("check complete")
        return true
    }
}


// Defining the CRUD functions
// add new item to dataBase
/**
 * Creates a listing or row.
 * @param {Object} newList -eg{col1: value, col2: value} the object with column name and value.
 * @param {string} dbName - The name of the database.
 * @param {string} tName - The name of the collection/table.
 * @returns {Promise<Array<Object>|null>} A promise that resolves with the retrieved rows or null if not found.
 */

async function createListing(newList, dbName, tName) {
    if(!await checkClient()){return;}
    try {
      const result = await client.db(dbName).collection(tName).insertOne(newList);
      console.log(`Id : ${result.insertedId} : from createListing function`);
    } catch (err) {
      console.log(`An error occurred: ${err.message}`);
    }
}

// Create Many rows or Create table if not Exists
/**
 * Creates many listings or adds more than 1 row.
 * @param {Array} newLists - newLists should be an array of objects e.g [{object 1},{object2},...{object n}].
 * {object 1} can be {"name":"John","age":17}
 * @param {string} dbName  - Database name e.g. "database_name". no spaces allowed.
 * @param {string} tName  - Table or collection name.
 * @returns {} nothing.
 */
async function createListings(newLists, dbName,tName){ // newLists is an array of objects.
    if(!await checkClient()){return;}
    try{
        const result = await client.db(dbName).collection(tName).insertMany(newLists);
        console.log(`${result.insertedIds} Id(s) are created. From createListings function`);
    }
    catch (err) {
        console.log(`An error occurred: ${err.message}`);
    }
}

// Reading one or returning one item
/**
 * Reads one single row or returns one row or listing.
 * @param {Object} nameOfRow - this should be an objects e.g {"key":"value"}
 * @param {string} dbName  - Database name e.g. "database_name". no spaces allowed.
 * @param {string} tName  - Table or collection name.
 * @returns one row.
 */
async function readRow(nameOfRow, dbName,tName){
    if(!await checkClient()){return;}
    try{
        const result = await client.db(dbName).collection(tName).findOne(nameOfRow);
        if(result){
            return {"listing":result,"found":true,"err":false};
        }else{
            return {"listing":null,"found":false,"err":false};
        }
    }
    catch (err) {
        return {"listing":err.message,"found":false,"err":true};
    } 
}

// Reading one rows
/**
 * Reads multiple rows from the specified collection/table.
 * @param {Object} nameOfRow -eg{col1: value, col2: value} The object representing the search criteria.
 * @param {string} dbName - The name of the database.
 * @param {string} tName - The name of the collection/table.
 * @returns {Promise<Array<Object>|null>} returns array of objects
 */
async function readRows(nameOfRow,dbName,tName){ // nameOfRow is place holder for search criteria
    if(!await checkClient()){return;}
    try{
        const cursor = client.db(dbName).collection(tName).find(nameOfRow);
        let result = await cursor.toArray();
        if(result){
            return {"listings":result,"found":true,"err":false};
        }else{
            return {"listings":"No listings found","found":false,"err":false};
        }
        // await client.close(true);
    }
    catch(err) {
        return {"listings":err.message,"found":false,"err":true};
    }
}

// Updating one row
/**
 * Updates one row.
 * @param {Object} newList -eg{col1: value} column name with value to update.
 * @param {Object} upddateList - eg{col1: new value} column name with new values.
 * @param {string} dbName - The name of the database.
 * @param {string} tName - The name of the collection/table.
 * @returns {Promise<Array<Object>|null>} A promise that resolves with the retrieved rows or null if not found.
 */
async function updateRow(nameOfRow, upddateList,dbName,tName){
    if(!await checkClient()){return;};
    try{
        const result = await client.db(dbName).collection(tName).updateOne(nameOfRow, {$set : upddateList});
        console.log(`updated ${result.modifiedCount} rows`);
        return {"updated":result.modifiedCount,"err":false};
    }
    catch (err) {
        return {"updated":err.message,"err":true};
    }
}

// Upserting one row / create row if it doesnt exist
/**
 * Updates many row or listing and creates if it doesn't exist.
 * @param {Object} nameOfRow -eg{col1: value, col2: value} column to update.
 * @param {Object} upddateList - eg{col1: new value, col2: new value} column names with new values.
 * @param {string} dbName - The name of the database.
 * @param {string} tName - The name of the collection/table.
 * @returns {Promise<Array<Object>|null>} A promise that resolves with the retrieved rows or null if not found.
 */
async function updateRow2(nameOfRow, upddateList,dbName,tName){
    if(!await checkClient()){return;};
    try{
        const result = await client.db(dbName).collection(tName).updateOne(nameOfRow, {$set : upddateList},{upsert : true});
        if(result.upsertedCount > 0){
            console.log(`upserted ${result.upsertedCount} rows`);
        }
        else{
            console.log(`updated ${result.modifiedCount} rows`);
        }
        return {"updated":`Added ${result.upsertedCount} rows and updated ${result.modifiedCount} rows`,"err":false};
    }
    catch (err) {
        console.log(`An error occurred: ${err.message}`);
        return {"updated":err.message,"err":false};
    }
}

// Updating many rows
// commonColumns is an object i.e. {columnName}

// updating many rows to upsert many, Imclude {upsert: true} as an option
/**
 * Updates many rows.
 * @param {Object} commonColumn -eg {col1: value, col2: value} column to update.
 * @param {Object} upddateList - eg {col1: new value, col2: new value} column names with new values.
 * @param {string} dbName - The name of the database.
 * @param {string} tName - The name of the collection/table.
 * @returns {Promise<Array<Object>|null>} A promise that resolves with the retrieved rows or null if not found.
 */
async function updateRows(commonColumn, upddateList,dbName,tName){
    if(!await checkClient()){return;}
    try{
        const result = await client.db(dbName).collection(tName).updateMany(commonColumn, {$set : upddateList});
        console.log(`updated ${result.modifiedCount} rows`);
    }
    catch (err) {
        console.log(`An error occurred: ${err.message}`);
    }
}

// Adding row if it does not exist
/**
 * Updates many rows and creates them if they don't exist.
 * @param {Object} commonColumn -eg {col1: value, col2: value} columns with same values to update.
 * @param {Object} upddateList - eg {col1: new value, col2: new value} column names with new values.
 * @param {string} dbName - The name of the database.
 * @param {string} tName - The name of the collection/table.
 * @returns {Promise<Array<Object>|null>} A promise that resolves with the retrieved rows or null if not found.
 */
async function updateRows2(commonColumn, upddateList,dbName,tName){
    if(!await checkClient()){return;}
    try{
        const result = await client.db(dbName).collection(tName).updateMany(commonColumn, {$set : upddateList},{upsert: true});
        console.log(`updated ${result.modifiedCount} rows`);
    }
    catch (err) {
        console.log(`An error occurred: ${err.message}`);
    }
}

//deleting one row: Name of row is an object, i.e. {"column name":"Value"}
/**
 * Deletes one row or listing.
 * @param {Object} nameOfRow - this should be an objects e.g {"key":"value"}
 * @param {string} dbName  - Database name e.g. "database_name". no spaces allowed.
 * @param {string} tName  - Table or collection name.
 * @returns nothing.
 */
async function deleteRow(nameOfRow,dbName,tName){
    if(!await checkClient()){return;}
    try{
        const result = await client.db(dbName).collection(tName).deleteOne(nameOfRow);
        console.log(`deleted ${result.deletedCount} row(s)`);
    }
    catch (err) {
        console.log(`An error occurred: ${err.message}`);
    }
}
// Deleting rows: Name of row is an object, i.e. {"column name": "Value"}
/**
 * Deletes many rows or listings.
 * @param {Object} nameOfRow - this should be an objects e.g {"key":"value"}
 * @param {string} dbName  - Database name e.g. "database_name". no spaces allowed.
 * @param {string} tName  - Table or collection name.
 * @returns nothing.
 */
async function deleteRows(nameOfRow,dbName,tName){
    if(!await checkClient()){return;}
    const result = await client.db(dbName).collection(tName).deleteMany(nameOfRow);
    console.log(`deleted ${result.deletedCount} row(s)`);
}

// Showing available databases
/**
 * Returns list of databases
 * @returns array of database names.
 */
async function listDatabeses(){
    await checkClient
    let list = await client.db().admin().listDatabases();
    console.log("All databases");
    list.databases.forEach(db => {
        console.log(" - " +db.name);
    });
    return list.databases;
}
// All tables in a db
/**
 * Returns list of tables or collections
 * @param {string} dbName - name of database e.g "database_name"
 * @returns array of database names.
 */
async function listTables(dbName) {
    if (!await checkClient()) {
        return;
    }

    try {
        let list = await client.db(dbName).listCollections().toArray();
        const tableNames = list.map(collection => collection.name);
        console.log("Table list: " + tableNames);
        return tableNames;
    } catch (error) {
        console.log(error.message);
    }
}

//
/** 
* Creates a collection or table
* @param {string} dbName - The name of the database.
* @param {string} tName - The name of the collection/table.
* @returns {Promise<Array<Object>|null>} an error if its encountered.
*/

async function createTable(dbName,tName){
    if(!await checkClient()){return;}
    try{
        const result = await client.db(dbName).createCollection(tName);
    }
    catch(err){
        console.log(err.message);
        return err.message;
    }
    createListing({_id:tName,seq:0},"Sys_db","counter")
}
/** 
* Creates an auto increament value for new columns
* @param {string} tName - The name of the collection/table.
* @returns {Promise<Array<Object>|null>} an error if its encountered.
*/
async function autoInc(tName){
    if(!await checkClient()){return;}
    try {
        // const result = await client.db("Sys_db").collection("counters").updateOne({_id: tName}, {$set :  {seq: 1}},{upsert : true});
        const result = await client.db("Sys_db").collection("counters").findOneAndUpdate({_id: tName},{$inc: {seq: 1}},{returnOriginal: false, upsert:true});
        console.log(result.value.seq)
        console.log(tName+result.value.seq)
        return tName+result.value.seq;
    } catch (err) {
        if(err.message == "Cannot read properties of null (reading 'seq')"){
            return await autoInc(tName);
        }
        else{
            console.log("err: "+err.message)
            return;
        }
    }
}
// Export the CRUD functions
module.exports = {
    createListing, 
    createListings, 
    readRow, 
    readRows, 
    updateRow, 
    updateRow2, 
    updateRows, 
    updateRows2, 
    deleteRow, 
    deleteRows, 
    listDatabeses,
    listTables,
    createTable,
    autoInc
};
