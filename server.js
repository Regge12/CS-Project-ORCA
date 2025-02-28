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
const passport = require('passport'); // Importing the passport library from Node.js (For authentication methods)
const LocalStrategy = require('passport-local').Strategy; // Allows for local authentication
const session = require('express-session'); // Provides an express session (keeps track of the clients' activity)
const SQLiteStore = require('connect-sqlite3')(session); // Stores the client session (username and encrypted password)
const bcrypt = require('bcryptjs');


if (cluster.isPrimary) { // if this is the primary process (the first time this code has run)
    const numCPUs = 1 //availableParallelism(); // Returns the number of cores of the CPU
    // create one worker per available core
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork({ PORT: 3000 + i });
    }

    // set up the adapter on the primary thread (Connects all workers together)
    return setupPrimary();
}


async function createDatabase() {
    database = await open({ 
        filename: 'chat.db', // It will create a new database with this name is none is found
        driver: sqlite3.Database // Tells SQLite which drives to use when interacting with the database
    });
    // This function will wait till the database chat.db is open

    await database.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        );
    `);
    // This function will execute the SQL commands inside the function
    /* The SQL will create the fields:
    id - the primary key that's an integer that will autoincrement
    username - Is the username of the client
    pasword - the encrypted password of the client
    */

    await database.exec(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_offset TEXT UNIQUE,
            content TEXT,
            channel TEXT,
            username TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    // This function will execute the SQL commands inside the function
    /* The SQL will create the fields:
    id - the primary key that's an integer that will autoincrement
    client_offset - is a key that is unique for each client (used for searching messages for certain users)
    content - Here the message sent by the client is stored
    channel - This is the channel that the message was sent in
    username - the sender of the message
    timestamp - when the message was sent
    */

    return database;
}


async function checkLoginCredentials(database) {
    // The passport will recieve the username and password from the client when the user tries to login
    passport.use(new LocalStrategy(async (username, password, done) => {
       try {
           const user = await database.get('SELECT * FROM users WHERE username = ?', username);
           // Here it searches the database for the username to get the record
           if (!user) return done(null, false, { message: 'User not found' });
           // If username is not in the database an error message is output
           const match = await bcrypt.compare(password, user.password);
           // This hashes the password and compares it with the hashed password in the database
           return match ? done(null, user) : done(null, false, { message: 'Incorrect password' });
           // If the hashes don't match then an error message is output
       } catch (err) {
           return done(err);
       }
   }));
}

async function handleClientSession(database) {
    // The sever will now remeber the use by saving their ID in the session
    passport.serializeUser((user, done) => done(null, user.id));
    // If they decide to change pages the ID is used to get their full details
    passport.deserializeUser(async (id, done) => {
        try {
            const user = await database.get('SELECT * FROM users WHERE id = ?', id);
            done(null, user);
        } catch (err) {
            done(err);
        }
    });
}

async function configurePassport(database) {
    
    await checkLoginCredentials(database);

    await handleClientSession(database);
    
}


function configureSession(app) {
    // The session helps keep the user logged in
    app.use(session({
        store: new SQLiteStore({ database: 'sessions.db', dir: './' }), // Store sessions in SQLite
        secret: 'supersecuresecret', // secret key to protect data
        resave: false,
        saveUninitialized: false
        // Prevents unnecessary session saving
    }));

    app.use(passport.initialize());
    // Start the node.js passport
    app.use(passport.session()); 
    // Links passport to session so logged in users are remembered
}

function configureMiddleware(app, database) {
    app.use(express.urlencoded({ extended: false }));
    // Allows the server to read HTML form data
    app.use(express.json());
    // Allows the server to understand JASON data

    configureSession(app);

    app.use(express.static(join(__dirname, 'public'))); 
    // Serve static files (Send public folder to the client)

    // Add root route (homepage)
    app.get('/', (req, res) => {
        res.sendFile(join(__dirname, 'public', 'login.html')); // Adjust the path if needed
    });
}


function initializeServer() {
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

async function setUpServer() {

    const database = await createDatabase(); // Ensure database is initialized

    await configurePassport(database); // Ensure Passport is set up correctly

    const { app, server, io } = initializeServer();

    configureMiddleware(app, database);
    
    return { app, server, io, database};
}


function handelLoginPage(app){
    // links the /login subpage to login.html
    app.get('/login', (req, res) => {
        res.sendFile(join(__dirname, 'public', 'login.html'));
    });

    // This will redirect the client depending if their username and password are correct
    app.post('/login', passport.authenticate('local', {
        successRedirect: '/chat', // Redirect to here if password and username is correct
        failureRedirect: '/login' // Redirect to here if password and username is incorrect
    }));
}

function handleRegisterPage(app, database){
    // Links the /register subpage to register.html
    app.get('/register', (req, res) => {
        res.sendFile(join(__dirname, 'public', 'register.html'));
    });

    // When the client submit's the register form this function will run
    app.post('/register', async (req, res) => {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        // Will hash the password to be stored into the sessions database
        try {
            await database.run('INSERT INTO users (username, password) VALUES (?, ?)', username, hashedPassword);
            // Storing hashed password and username into database if successful
            res.redirect('/login');
            // redirects to login page is successful
        } catch (e) {
            res.send('Username already taken');
        }
    });
}

function handleChatPage(app){
    // Checks if a user is authenticated before they can access the chat rooms
    app.use('/chat', (req, res, next) => {
        if (!req.isAuthenticated()) return res.redirect('/login');
        next(); // If they are not authenticated they are sent back to the login page
    });

    // Linking /chat subpage to chat.html
    app.get('/chat', (req, res) => {
        res.sendFile(join(__dirname, 'public', 'chat.html'));
    });
}

function handleFileConnection(app, database) {

    handelLoginPage(app);

    handleRegisterPage(app, database);

    handleChatPage(app);
}


const channels = {};

function removeUserFromChannels(io, socketId) {
    // This cycles through all the channels looking for the user
    Object.entries(channels).forEach(([channel_ID, channel]) => {
        if (!channel.users[socketId]) return;

        const username = channel.users[socketId];
        delete channel.users[socketId];
        // If found they are remove from the array

        // All clients in the channel are alerted that a user has left the channel
        io.to(channel_ID).emit('user-left', username);
    });
}

function onJoinHandelChannels(io, socket, username, channel_ID, callback){

    socket.join(channel_ID); // client joins the channel
    if (!channels[channel_ID]) {
        channels[channel_ID] = { name: `Room ${channel_ID}`, users: {} };
    }
    channels[channel_ID].users[socket.id] = username;

    // Notify all clients in the channel about the new user
    io.to(channel_ID).emit('user-joined', username, Object.keys(channels[channel_ID].users));
    console.log(`${username} joined channel ${channel_ID}`);
    callback(`Joined channel ${channel_ID}`);
}

async function main() {

    const { app, server, io, database } = await setUpServer();

    handleFileConnection(app, database);

    // When there is a connection to the server this event will fire
    io.on('connection', async (socket) => {
        console.log('A user connected');

        // When a client join a channel this even fires
        socket.on('join channel', async (channel_ID, username, callback) => {

            // Retrieve the username from the session if it's not passed from the client
            if (!username) {
                const user = await database.get('SELECT username FROM users WHERE id = ?', socket.user.id);
                username = user.username;
            }

            onJoinHandelChannels(io, socket, username, channel_ID, callback);

            // Fetch past messages for corresponding channel
            try {
                const messages = await database.all('SELECT id, content, username, timestamp FROM messages WHERE channel = ? ORDER BY id ASC', channel_ID);
                messages.forEach((row) => {
                    socket.emit('chat message', row.content, row.id, row.username, row.timestamp);
                });
            } catch (e) {
                console.error('Error fetching messages:', e);
            }            
        });

        // This function will run once a 'chat message' is received by the server
        socket.on('chat message', async (msg, clientOffset, channel_ID, callback) => {

            let result;
            try {
                result = await database.run('INSERT INTO messages (content, client_offset, channel, username) VALUES (?, ?, ?, ?)', msg, clientOffset, channel_ID, username);
                // Will insert the message into the database
            } catch (e) {
                if (e.error === 19) {
                    callback(); // Will notifiy the client when there is a duplicate message
                }
                return;
            }

            // Will send messages to all client in the corresponding channel
            io.to(channel_ID).emit('chat message', msg, result.lastID, username);
            callback(); // acknowledge the event
        });

        // Emit the username from the session to the client
        socket.on('get-username', async () => {
            if (socket.user) {
                socket.emit('set-username', { username: socket.user.username });
            }
        });
        
        // this will remove the client from the channel once the client disconnects/leaves
        socket.on('disconnect', () => {
            console.log('User disconnected');
            removeUserFromChannels(io, socket.id);
        });

    });

    // each worker will listen on a distinct port
    const port = process.env.PORT || 3000; // Default to 3000
    server.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });

}

// Calling the main block of our program to start/run the server
main();