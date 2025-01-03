const express = require('express'); // Importing the Express framework
const { createServer } = require('node:http'); // Importing the createServer function from the http module
const { join } = require('node:path'); // Importing join function from the path module 

const app = express(); // Creates and instance of Express
const server = createServer(app); // Creates a HTTP server
// Express (app) will handel all incoming HTTP requests

app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'index.html'));
})
// On request of the server, the server will responds with the HTML file (index.html)

server.listen(3000, () => {
    console.log('server running at http://localhost:3000');
  });
// Here we make the server listen for connections to port 3000