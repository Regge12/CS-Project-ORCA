const express = require('express'); // Importing the Express framework
const { createServer } = require('node:http'); // Importing the createServer function from the http module

const app = express(); // Creates and instance of Express
const server = createServer(app); // Creates a HTTP server
//Express (app) will handel all incoming HTTP requests

app.get('/', (req, res) => {
    res.send('<h1>Helloooo World</h1><p>Whats Good MY G</p>');
})
// On request of the server, the server will responds with this^

server.listen(3000, () => {
    console.log('server running at http://localhost:3000');
  });
// Here we make the server listen for connections to port 3000