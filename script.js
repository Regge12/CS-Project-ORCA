let counter = 0;
<<<<<<< HEAD
// will be incremented so that the clientOffset is always unique

// This creates a reference of the server on the client side
=======
>>>>>>> e28796f6c24e01cacffa8d96af40a4b489139518
let socket = io({
    auth: {
        serverOffset: 0
    },
<<<<<<< HEAD
    // How long the client will wait for an acknowlegdement from the server
    ackTimeout: 10000,
    // The amount of times the client will try to send messages to the server
=======
    ackTimeout: 10000,
>>>>>>> e28796f6c24e01cacffa8d96af40a4b489139518
    retries: 3,
});

const form = document.getElementById('form');
const input = document.getElementById('input');
const message = document.getElementById('messages');

let channel_ID = "general";
let username = prompt("Enter your username:") || "Anonymous";

// Join a channel
socket.emit('join channel', channel_ID, username, (response) => {
    console.log(response);
});

<<<<<<< HEAD
let channel_ID = "general"; // the default channel
let username = prompt("Enter your username:") || "Anonymous";
// This will ask the client for their name, if they enter nothing their name is set to Anonymous


// Join a channel
socket.emit('join channel', channel_ID, username, (response) => {
    console.log(response);
});

// Once the submit button is pressed, the client checks if the message is not empty
// Then the client sends this message to the client
form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value) {
        // Creates an unique identifier for each message
=======
form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value) {
>>>>>>> e28796f6c24e01cacffa8d96af40a4b489139518
        let clientOffset = `${socket.id}-${Date.now()}`;
        socket.emit('chat message', input.value, clientOffset, channel_ID);
        input.value = '';
    }
});

<<<<<<< HEAD
socket.on('chat message', function(msg, serverOffset) { // the message and the state of the server sent from the server
    // Creates a list element that will contain the message
    const item = document.createElement('li');
    item.textContent = msg;
    message.appendChild(item);
    window.scrollTo(0, document.body.scrollHeight); // Moves down the pages to fit the message
    socket.auth.serverOffset = serverOffset;
    // This will update the state of the client to be synced with the state of the server
});
// Once the message is recieved, it will be displayed to the client

// This will run when user joins the server
socket.on('user-joined', (username, users) => {
    // A join message message is displayed to let clients know that a user has join
=======
socket.on('chat message', function(msg, serverOffset) {
    const item = document.createElement('li');
    item.textContent = msg;
    message.appendChild(item);
    window.scrollTo(0, document.body.scrollHeight);
    socket.auth.serverOffset = serverOffset;
});

socket.on('user-joined', (username, users) => {
>>>>>>> e28796f6c24e01cacffa8d96af40a4b489139518
    const item = document.createElement('li');
    item.textContent = `${username} joined the chat.`;
    item.style.fontStyle = "italic";
    message.appendChild(item);
});

<<<<<<< HEAD
// Once a client disconncets a message is sent to the clients
// Notifying them that someone has left
=======
>>>>>>> e28796f6c24e01cacffa8d96af40a4b489139518
socket.on('user-left', (username) => {
    const item = document.createElement('li');
    item.textContent = `${username} left the chat.`;
    item.style.fontStyle = "italic";
    message.appendChild(item);
});
