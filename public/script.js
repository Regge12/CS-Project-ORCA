let counter = 0;
// will be incremented so that the clientOffset is always unique

// This creates a reference of the server on the client side
let socket = io({
    auth: {
        serverOffset: 0
    },
    // How long the client will wait for an acknowlegdement from the server
    ackTimeout: 10000,
    // The amount of times the client will try to send messages to the server
    retries: 3,
});

const form = document.getElementById('form');
const input = document.getElementById('input');
const message = document.getElementById('messages'); // Container for the recieved messages
// List of banned words (you can expand this list)
const bannedWords = ["crap", "curse", "offensive"];

let channel_ID = "general"; // the default channel
let username = prompt("Enter your username:") || "Anonymous";
// This will ask the client for their name, if they enter nothing their name is set to Anonymous


// Join a channel
socket.emit('join channel', channel_ID, username, (response) => {
    console.log(response);
});



// Function to censor words in a message
function censorMessage(message) {
    let words = message.split(/\b/); // Split by word boundaries

    return words.map(word => {
        let lowerCaseWord = word.toLowerCase();
        if (bannedWords.includes(lowerCaseWord)) {
            return "#".repeat(word.length); // Replace with hashtags
        }
        return word; // Keep non-banned words unchanged
    }).join(""); // Reassemble the sentence
}

// Once the submit button is pressed, the client checks if the message is not empty
// Then the client sends this message to the client
form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value) {
        // Creates an unique identifier for each message
        let clientOffset = `${socket.id}-${Date.now()}`;
        socket.emit('chat message', censorMessage(input.value), clientOffset, channel_ID, username);
        input.value = '';
    }
});

socket.on('chat message', function(msg, serverOffset, sender) { // the message and the state of the server sent from the server
    // Creates a list element that will contain the message
    const item = document.createElement('li');
    item.textContent = `${sender}: ${msg}`;
    message.appendChild(item);
    window.scrollTo(0, document.body.scrollHeight); // Moves down the pages to fit the message
    socket.auth.serverOffset = serverOffset;
    // This will update the state of the client to be synced with the state of the server
});
// Once the message is recieved, it will be displayed to the client

// This will run when user joins the server
socket.on('user-joined', (username, users) => {
    // A join message message is displayed to let clients know that a user has join
    const item = document.createElement('li');
    item.textContent = `${username} joined the chat.`;
    item.style.fontStyle = "italic";
    message.appendChild(item);
});

// Once a client disconncets a message is sent to the clients
// Notifying them that someone has left
socket.on('user-left', (username) => {
    const item = document.createElement('li');
    item.textContent = `${username} left the chat.`;
    item.style.fontStyle = "italic";
    message.appendChild(item);
});