const express = require('express'); // Importing the Express framework
const { createServer } = require('node:http'); // Importing the createServer function from the http module
const { join } = require('node:path'); // Importing join function from the path module
const { Server } = require('socket.io'); // Importing the Server function from socket.io module
const sqlite3 = require('sqlite3'); // Importing SQlite which is a database engine (Database manager)
const { open } = require('sqlite'); // Importing the open function from SQLite to open the database
const { availableParallelism } = require('node:os'); // This function will allow for parallel proccessing on the CPU's cores
const cluster = require('node:cluster'); // This module allows us to run multiple processes (workers) in parallel.
const { createAdapter, setupPrimary } = require('@socket.io/cluster-adapter'); 
// This will import a function the will be used to connect worker (servers) together
const path = require('path'); // Allows the document to access paths to get other files
// const { create } = require('node:domain');

if (cluster.isPrimary) { // if this is the primary process (the first time this code has run)
    const numCPUs = 1//availableParallelism(); // Returns the number of cores of the CPU
    // create one worker per available core
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork({
            PORT: 3000 + i
        });
    }

    console.log('Workers created')

    // set up the adapter on the primary thread (Connects all workers together)
    return setupPrimary();
    }

async function createDatabase(){

    const dbPath = path.join(__dirname, 'src', 'db', 'chat.db'); // Path to /src/db/chat.db
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database // choosing relevant driver for SQL databases
    });
    // Will wait till chat.db is open

    await db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            sender TEXT NOT NULL,            
            channel_id INTEGER NOT NULL,           
            content TEXT NOT NULL,                 
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    // This function will execute the SQL commands inside the function
    /* The SQL will create the fields:
    id - the primary key that's an integer that will autoincrement
    sender - Who sent the message
    channel_id - where the message was sent
    content - the message
    timestamp - when the message was sent
    */

   await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_channel_id ON messages (channel_id, id);`
   );

   console.log('Database created');
   return db;
}

function handleFileConnection(app){
    // Serve static files (Give all public files to the client)
    app.use(express.static(path.join(__dirname, 'public')));

    // On request of the server, the server will responds with the HTML file (index.html) as default
    app.get('/', (req, res) => {''
        res.sendFile(join(__dirname, 'public', 'index.html'));
    })
    
    console.log('Files have been sent to the client');
}

function configServer(){
    const app = express(); // Creates and instance of Express - will handle HTTP requests
    const server = createServer(app); // Creates a HTTP server
    const io = new Server(server, { // Creates an instance of socket.io
        connectionStateRecovery: {}, // Will save the state of the server if a user disconnects
        adapter: createAdapter() // set up the adapter on each worker thread (syncing all workers)
    });

    console.log('Server has been created')
    return { app, server, io };
}

async function listenForMessage(socket, db, io){

    // This function will run once a 'chat message' is received by the server
    socket.on('chat message', async (payload, callback) => {
        const { msg, sender, channel_id } = payload;
        callback(); // acknowledge the event
        console.log('Message recieved by server', msg, sender, channel_id);
        let x = 0;
        let result;
        try {
          // store the message in the database once a chat message is received
          result = await db.run(`INSERT INTO messages (content, sender, channel_id) VALUES (?, ?, ?)`, msg, sender, x);
        } catch (e) {
            if (e.code === 'SQLITE_CONSTRAINT') {
                return callback({ error: "Duplicate message detected" });
                // Will notifiy the client when there is a duplicate message
            } else {
                console.error("Database error:", e);
                return callback({ error: "Database error" });
            }
        }
//        console.log(`The message ${row.content} will be sent over since they are in channel`);
        io.emit('chat message', {id: result.lastID, msg: msg, sender: sender});
        // Sends the chat message to all users and the id of the message
    })
}

async function listenForJoinChannel(socket, db){

    socket.on('join channel', async (channel) => {
        try {
            let lastID = await getLastMessageId(db, channel);
            console.log("Fetching messages for channel:", channel, "after ID:", lastID);
            socket.join(channel);
            console.log(`channel: ${channel} has been joined`);
            // This will send all the messages to the client that they have missed
            const rows = await db.all(
                'SELECT id, content, sender FROM messages WHERE channel_id = ? AND id > ? ORDER BY id ASC', 
                [channel, lastID]
            );
            if (rows.length > 0) {
                socket.emit('chat messages', rows); // Send messages in one event
            }
        } catch (e) {
            console.error("Database Error:", e);
            return;
        }
        console.log('User has been updated');
    })
}

async function recoverSocket(socket, db, channel){
    try {
        await db.each('SELECT id, content, channel_id, sender FROM messages WHERE id > ? AND channel_id = ?',
            [socket.handshake.auth.serverOffset || 0, channel],
            (_err, row) => {
              socket.emit('chat message', {serverOffset: row.id, msg: row.content, sender: row.sender});
            } 
        )
    } catch (e) {
        console.error("Database Error:", e);   
        return; 
    }
};

async function handleClientConnect(io, db) {

    io.on('connection', async (socket) => {
        // these functions are asynchronous since we are fetching from an API

        //listenForJoinChannel(socket, db);
        console.log('Socket connected:', socket.connected); // Should be true if connected

        listenForMessage(socket, db, io);

        // this event will run if the user reconnects to the server unsuccessfully
        if (!socket.recovered) {
            recoverSocket(socket, db);
        }

        console.log('A user connected');

        socket.on('disconnect', () => {
            console.log('User disconnected');
        })
    })
}

async function getLastMessageId (db, channel){
     try {
        const row = await db.get(
            `SELECT MAX(id) AS lastId FROM messages WHERE channel_id = ?`, 
            [channel]
        );
        return row?.lastId || 0; // Return 0 if no messages exist for this channel
    } catch (e) {
        console.error("Database Error:", e);
        return 0;
    }
}


// This function is the main part of our program, it has one entry point and is asynchronous
async function main() {
    // When there is a connection to the server this event will fire
   
    const { app, server, io } = configServer();

    handleFileConnection(app);

    const db = await createDatabase();

    await handleClientConnect(io, db);

    // each worker will listen on a distinct port
    const port = process.env.PORT;

    server.listen(port, () => {
        console.log(`server running at http://localhost:${port}`);
    });
}


// Calling the main block of our program to start/run the server
main()