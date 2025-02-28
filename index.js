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

const authRoutes = require('./routes/auth'); // Make sure this is correct

require('dotenv').config();
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const db = require('./db');


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
    const db2 = await open({
        filename: 'chat.db', // It will create a new database with this name is none is found
        driver: sqlite3.Database // Tells SQLite which drives to use when interacting with the database
    });
    // This function will wait till the database chat.db is open

    await db2.exec(`
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

    return db2;
}

if (cluster.isPrimary) { // if this is the primary process (the first time this code has run)
    const numCPUs = availableParallelism(); // Returns the number of cores of the CPU
    // create one worker per available core
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork({ PORT: 3000 + i });
    }
    // set up the adapter on the primary thread (Connects all workers together) 
    return setupPrimary();
}


function handleFileConnection(app) {
    // Serve static files (Give all public files to the client)
    app.use(express.static(path.join(__dirname)));

    // On request of the server, the server will responds with the HTML file (index.html) as default
    app.get('/', (req, res) => {
        res.sendFile(join(__dirname, 'public', 'index.html'));
    });

    app.use(express.json()); // ✅ This is needed to parse JSON requests

    // Load routes
    app.use(authRoutes);

    // Middleware
    app.use(express.urlencoded({ extended: false })); // Parse form data
    app.use(express.json()); // Parse JSON data
    // Serve static files (IMPORTANT)
    app.use(express.static(path.join(__dirname, 'public')));

    // Session setup
    app.use(session({
        secret: process.env.SECRET_KEY || 'your_secret_key',
        resave: false,
        saveUninitialized: false
    }));

    // Initialize Passport
    app.use(passport.initialize());
    app.use(passport.session());

    }

function createPassport(app) {
    // Passport Strategy
passport.use(new LocalStrategy(
    { usernameField: 'username' }, // Use username instead of default username
    (username, password, done) => {
        const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
        if (!user) return done(null, false, { message: "User not found" });

        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err) return done(err);
            if (!isMatch) return done(null, false, { message: "Incorrect password" });
            return done(null, user);
        });
    }
));

// Serialize & Deserialize User
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    done(null, user);
});

// Middleware to protect routes
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        console.log('User authenticated');
        return next(); // User is authenticated, allow access
    }
    res.redirect('/index.html'); // Redirect to login page if not authenticated
}

// Serve dashboard.html only if logged in
app.get('/dashboard.html', isAuthenticated, (req, res) => {
    console.log('This route is being hit!');  // Check if this log appears

    const username = req.user.username; // Access the authenticated user's username
    console.log(`Logged in user: ${username}`);  // Check if the username is logged correctly

    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));  // Serve the dashboard
});

}
// Routes
//app.use('/auth', require('./routes/auth'));


const channels = {};
// container for the channels

// This function is the main part of our program, it has one entry point and is asynchronous
async function main() {

    const { app, server, io } = setUpServer();

    const db2 = await createDatabase();

    handleFileConnection(app);

    createPassport(app);

    // Routes
    app.use('/auth', require('./routes/auth'));

    // When there is a connection to the server this event will fire
    io.on('connection', async (socket) => {
        console.log('A user connected');

        socket.on('join channel', async (channel_ID, username, callback) => {

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
                const messages = await db2.all('SELECT id, content, sender FROM messages WHERE channel = ? ORDER BY id ASC', channel_ID);
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
                result = await db2.run('INSERT INTO messages (content, client_offset, channel, sender) VALUES (?, ?, ?, ?)', msg, clientOffset, channel_ID, sender);
                // Will insert the message into the database
            } catch (e) {
                if (e.error === 19) {
                    callback(); // Will notifiy the client when there is a duplicate message
                }
                return;
            }
            // Will send messages to all client in the corresponding channel
            io.to(channel_ID).emit('chat message', msg, result.lastID, sender);
            callback(); // acknowledge the event
        });

        // this will remove the client from the channel once the client disconnects
        socket.on('disconnect', () => {
            console.log('User disconnected');
            for (let channel_ID in channels) {
                if (channels[channel_ID].users[socket.id]) {
                    let username = channels[channel_ID].users[socket.id];
                    delete channels[channel_ID].users[socket.id];
                    io.to(channel_ID).emit('user-left', username);
                }
            }
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
