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
const authRoutes = require('./routes/auth'); // Imports the authenication routes
require('dotenv').config(); // Will store sensitive information outside the code securely 
const session = require('express-session'); // Manages user sessions (keeps the users logged in)
const passport = require('passport'); // This will handle authentication
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs'); // Will hash our client's password
const userDatabase = require('./db'); // Loads the database (USERDATA)

// if this is the primary process (the first time this code has run)
if (cluster.isPrimary) {
    const numCPUs = availableParallelism(); // Returns the number of cores of the CPU
    // create one worker per available core
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork({ PORT: 3000 + i });
    }
    // set up the adapter on the primary thread (Connects all workers together) 
    return setupPrimary();
}


function setUpServer() {
    const app = express(); // Creates and instance of Express
    const server = createServer(app); // Creates a HTTP server
    // Express (app) will handel all incoming HTTP requests
    const io = new Server(server, { // Creates an instance of socket.io
        connectionStateRecovery: {}, // Will save the state of the server if a user disconnects
        // set up the adapter on each worker thread
        adapter: createAdapter()
        // syncs messages across all workers
    });
    
    return { app, server, io };
}


async function createDatabase() {
    const database = await open({
        filename: 'chat.db', // It will create a new database with this name is none is found
        driver: sqlite3.Database // Tells SQLite which drives to use when interacting with the database
    });
    // This function will wait till the database chat.db is open

    await database.exec(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_offset TEXT UNIQUE,
            sender TEXT,
            content TEXT,
            channel TEXT
        );
    `);
    // This function will execute the SQL commands inside the function
    /* The SQL will create the fields:
    id - the primary key that's an integer that will autoincrement
    client_offset - is a key that is unique for each client (used for searching messages for certain users)
    content - Here the message sent by the client is stored
    channel - This is the channel that the message was sent in
    */

    return database;
}


function configureSession(app) {
    // The session helps keep the user logged in
    app.use(session({
        secret: process.env.SECRET_KEY || 'your_secret_key', // secret key to protect data
        resave: false,
        saveUninitialized: false
        // Prevents unnecessary session saving
    }));
            
    // Initialize Passport
    app.use(passport.initialize());
    // Start the node.js passport
    app.use(passport.session());
    // Links passport to session so logged in users are remembered
}

function handleFileConnection(app) {

    // Serve static files (Give all public files to the client)
    app.use(express.static(path.join(__dirname)));
    app.use(express.static(path.join(__dirname, 'public')));

    // On request of the server, the server will responds with the HTML file (index.html) as default
    app.get('/', (req, res) => {
        res.sendFile(join(__dirname, 'public', 'index.html'));
    });

    // Middleware
    app.use(express.json());
    // Allows the server to understand JASON data
    app.use(express.urlencoded({ extended: false }));
    // Allows the server to read HTML form data

    configureSession(app);

    // Load routes
    app.use(authRoutes);
    app.use('/auth', require('./routes/auth'));
}


async function checkLoginCredentials(database) {
    // The passport will recieve the username and password from the client when the user tries to login
    passport.use(new LocalStrategy(
        { usernameField: 'username' }, // Use username instead of default username
        (username, password, callback) => {
            const user = database.prepare("SELECT * FROM users WHERE username = ?").get(username);
            // Here it searches the database for the username to get the record

            if (!user) { // If username is not in the database an error message is output
                callback(null, false, { message: "User not found" });
                return
            }
              
            // This hashes the password and compares it with the hashed password in the database
            bcrypt.compare(password, user.password, (err, isMatch) => {
                if (err) {
                    return callback(err);
                }
                if (!isMatch){ // If the hashes don't match then an error message is output
                    return callback(null, false, { message: "Incorrect password" });
                }
                return callback(null, user);
            });
        }
    ));
}

async function handleClientSession(database) {
    // The sever will now remeber the use by saving their ID in the session
    passport.serializeUser((user, callback) => callback(null, user.id));
    // If they decide to change pages the ID is used to get their full details
    passport.deserializeUser((id, callback) => {
    const user = database.prepare("SELECT * FROM users WHERE id = ?").get(id);
        callback(null, user);
});
}

async function authenticateClient(database) {

    await checkLoginCredentials(database)

    await handleClientSession(database);

}


const channels = {};
// container for the channels
function removeUserFromChannel(io, socket){
    for (let channel_ID in channels) {
        if (channels[channel_ID].users[socket.id]) {
            let username = channels[channel_ID].users[socket.id];
            delete channels[channel_ID].users[socket.id];
            socket.leave(channel_ID);
            io.to(channel_ID).emit('user-left', username);
        }
    }
}

// This function is the main part of our program, it has one entry point and is asynchronous
async function main() {

    const { app, server, io } = setUpServer();

    const messageDatabase = await createDatabase();

    handleFileConnection(app);

    await authenticateClient(userDatabase);

    // When there is a connection to the server this event will fire
    io.on('connection', async (socket) => {
        console.log('A user connected');

        socket.on('join channel', async (channel_ID, username, callback) => {

            removeUserFromChannel(io, socket);

            socket.join(channel_ID); // client joins the channel
            if (!channels[channel_ID]) {
                channels[channel_ID] = { name: `Room ${channel_ID}`, users: {} };
                // If the channel doesn't exist then a new one is created
            }
            channels[channel_ID].users[socket.id] = username;
            // client's username store in corresponding channel

            // The username is sent to all the client in the channel - (updating the clients on who joined)
            io.to(channel_ID).emit('user-joined', username, Object.keys(channels[channel_ID].users));
            console.log(`${username} joined channel ${channel_ID}`);
            callback(`Joined channel ${channel_ID}`);

            // Fetch past messages for this channel
            try {
                const messages = await messageDatabase.all('SELECT id, content, sender FROM messages WHERE channel = ? ORDER BY id ASC', channel_ID);
                messages.forEach((row) => {
                    socket.emit('chat message', row.content, row.id, row.sender);
                });
            } catch (e) {
                console.error('Error fetching messages:', e);
            }
        });
        
        // This function will run once a 'chat message' is received by the server
        socket.on('chat message', async (msg, clientOffset, channel_ID, sender, callback) => {
            let result;
            try {
                result = await messageDatabase.run('INSERT INTO messages (content, client_offset, channel, sender) VALUES (?, ?, ?, ?)', msg, clientOffset, channel_ID, sender);
                // Will insert the message into the database
            } catch (e) {
                if (e.error === 19) {
                    console.error('Error inserting messages:', e);
                    //callback(e); // Will notifiy the client when there is a duplicate message
                }
                return;
            }
            // Will send messages to all client in the corresponding channel
            io.to(channel_ID).emit('chat message', msg, result.lastID, sender);
            callback(`message has been sent in ${channel_ID}`); // acknowledge the event
        });

        // this will remove the client from the channel once the client disconnects
        socket.on('disconnect', () => {
            console.log('User disconnected');
            removeUserFromChannel(io, socket);
        });

    });

    // each worker will listen on a distinct portSS
    const port = process.env.PORT;
    server.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}

// Calling the main block of our program to start/run the server
main();
