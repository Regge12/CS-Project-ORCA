let counter = 0;
let socket = io({
    auth: {
        serverOffset: 0
    },
    ackTimeout: 10000,
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

form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value) {
        let clientOffset = `${socket.id}-${Date.now()}`;
        socket.emit('chat message', input.value, clientOffset, channel_ID);
        input.value = '';
    }
});

socket.on('chat message', function(msg, serverOffset) {
    const item = document.createElement('li');
    item.textContent = msg;
    message.appendChild(item);
    window.scrollTo(0, document.body.scrollHeight);
    socket.auth.serverOffset = serverOffset;
});

socket.on('user-joined', (username, users) => {
    const item = document.createElement('li');
    item.textContent = `${username} joined the chat.`;
    item.style.fontStyle = "italic";
    message.appendChild(item);
});

socket.on('user-left', (username) => {
    const item = document.createElement('li');
    item.textContent = `${username} left the chat.`;
    item.style.fontStyle = "italic";
    message.appendChild(item);
});
