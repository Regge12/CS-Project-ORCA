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


if (cluster.isPrimary) { // if this is the primary process (the first time this code has run)
    const numCPUs = availableParallelism(); // Returns the number of cores of the CPU
    // create one worker per available core
    for (let i = 0; i < numCPUs; i++) {
      cluster.fork({
        PORT: 3000 + i
      });
    }
    
    // set up the adapter on the primary thread (Connects all workers together)
    return setupPrimary();
  }

// This function is the main part of our program, it has one entry point and is asynchronous
async function main() {
    const app = express(); // Creates and instance of Express
    const server = createServer(app); // Creates a HTTP server
    // Express (app) will handel all incoming HTTP requests
    const io = new Server(server, {
        connectionStateRecovery: {}, // Will save the state of the server if a user disconnects
        // set up the adapter on each worker thread
        adapter: createAdapter()
        // syncs messages across all workers
    });
    // Creates an instance of socket.io

    const dbPath = path.join(__dirname, 'src', 'db', 'chat.db'); // Path to /src/db/chat.db
    const db = await open({
        filename: dbPath, // It will create a new database with this name is none is found
        driver: sqlite3.Database // Tells SQLite which drives to use when interacting with the database
    });
    // This function will wait till the database chat.db is open


    await db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_offset TEXT UNIQUE,
            content TEXT
        );
    `);
    // This function will execute the SQL commands inside the function
    /* The SQL will create the fields:
    id - the primary key that's an integer that will autoincrement
    client_offset - is a key that is unique for each client (used for searching messages for certain users)
    content - Here the message sent by the client is stored
    */

    // Serve static files (Give all public files to the client)
    app.use(express.static(path.join(__dirname, 'public')));

    // On request of the server, the server will responds with the HTML file (index.html) as default
    app.get('/', (req, res) => {''
        res.sendFile(join(__dirname, 'public', 'index.html'));
    })

    // When there is a connection to the server this event will fire
    io.on('connection', async (socket) => {
        // these functions are asynchronous since we are fetching from an API
        
        // This function will run once a 'chat message' is received by the server
        socket.on('chat message', async (msg, clientOffset, callback) => {
            let result;
            try {
              // store the message in the database once a chat message is received
              result = await db.run('INSERT INTO messages (content, client_offset) VALUES (?, ?)', msg, clientOffset);
            } catch (e) {
                if (e.error === 19) {
                    callback(); // Will notifiy the client when there is a duplicate message
                } else {
                    // nothing let the client retry
                }
              return;
            }

            io.emit('chat message', msg, result.lastID);
            // Sends the chat message to all users and the id of the message
            callback(); // acknowledge the event
        })

        // this event will run if the user reconnects to the server unsuccessfully
        if (!socket.recovered) {
            try {
                // This will send all the messages to the client that they have missed
                await db.each('SELECT id, content FROM messages WHERE id > ?', 
                    [socket.handshake.auth.serverOffset || 0],
                    (_err, row) => {
                      socket.emit('chat message', row.content, row.id);
                    }
                )
            } catch (e) {
                // Errors should be displayed
            }
        }

        console.log('A user connected');

        socket.on('disconnect', () => {
            console.log('User disconnected');
        })
    })

      // each worker will listen on a distinct port
    const port = process.env.PORT;

    server.listen(port, () => {
        console.log(`server running at http://localhost:${port}`);
    });
}

// Calling the main block of our program to start/run the server
main()