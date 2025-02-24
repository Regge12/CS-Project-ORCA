const express = require('express');
const { createServer } = require('node:http');
const { join } = require('node:path');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { availableParallelism } = require('node:os');
const cluster = require('node:cluster');
const { createAdapter, setupPrimary } = require('@socket.io/cluster-adapter');
const path = require('path');

if (cluster.isPrimary) {
    const numCPUs = availableParallelism();
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork({ PORT: 3000 + i });
    }
    return setupPrimary();
}

function setUpServer() {
    const app = express();
    const server = createServer(app);
    const io = new Server(server, {
        connectionStateRecovery: {},
        adapter: createAdapter()
    });
    return { app, server, io };
}

async function createDatabase() {
    const db = await open({
        filename: 'chat.db',
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_offset TEXT UNIQUE,
            content TEXT,
            channel TEXT
        );
    `);

    return db;
}

function handleFileConnection(app) {
    app.use(express.static(path.join(__dirname)));
    app.get('/', (req, res) => {
        res.sendFile(join(__dirname, 'index.html'));
    });
}

const channels = {};

async function main() {
    const { app, server, io } = setUpServer();
    const db = await createDatabase();
    handleFileConnection(app);

    io.on('connection', async (socket) => {
        console.log('A user connected');

        socket.on('join channel', async (channel_ID, username, callback) => {
            socket.join(channel_ID);
            if (!channels[channel_ID]) {
                channels[channel_ID] = { name: `Room ${channel_ID}`, users: {} };
            }
            channels[channel_ID].users[socket.id] = username;

            io.to(channel_ID).emit('user-joined', username, Object.keys(channels[channel_ID].users));
            console.log(`${username} joined channel ${channel_ID}`);
            callback(`Joined channel ${channel_ID}`);

            // Fetch past messages for this channel
            try {
                const messages = await db.all('SELECT id, content FROM messages WHERE channel = ? ORDER BY id ASC', channel_ID);
                messages.forEach((row) => {
                    socket.emit('chat message', row.content, row.id);
                });
            } catch (e) {
                console.error('Error fetching messages:', e);
            }
        });

        socket.on('chat message', async (msg, clientOffset, channel_ID, callback) => {
            let result;
            try {
                result = await db.run('INSERT INTO messages (content, client_offset, channel) VALUES (?, ?, ?)', msg, clientOffset, channel_ID);
            } catch (e) {
                if (e.error === 19) {
                    callback();
                }
                return;
            }

            io.to(channel_ID).emit('chat message', msg, result.lastID);
            callback();
        });

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

    const port = process.env.PORT;
    server.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}

main();