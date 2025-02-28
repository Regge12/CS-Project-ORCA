// Client-side code
let socket = io({
    auth: {
        username: 'Guest_' + Math.floor(Math.random() * 1000) // Assign a random username or from session
    },
    ackTimeout: 10000,
    retries: 3,
});

const form = document.getElementById('form');
const input = document.getElementById('input');
const message = document.getElementById('messages');
let channel_ID = "general";
let username = "";

// Connect and fetch the username
socket.on('connect', () => {
    socket.emit('get-username');

    socket.on('set-username', (user) => {
        if (user.username) {
            username = user.username;
            console.log(`Username is: ${username}`);
            socket.emit('join channel', channel_ID, username, (response) => {
                console.log(response);
            });
        } else {
            console.error("No username provided.");
        }
    });
});

// Handle chat message submission
form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value) {
        let clientOffset = `${socket.id}-${Date.now()}`;
        socket.emit('chat message', input.value, clientOffset, channel_ID, (response) => {
            console.log("Server Response:", response);
        });
        input.value = ''; // Reset input field
    }
});

// Handle received chat messages
socket.on('chat message', (msg, serverOffset, username, timestamp) => {
    const item = document.createElement('li');
    const header = document.createElement('div');
    header.className = 'message-header';
    header.textContent = `${username} (${new Date(timestamp).toLocaleTimeString()})`;
    
    const messageText = document.createElement('div');
    messageText.className = 'message-text';
    messageText.textContent = msg;

    item.appendChild(header);
    item.appendChild(messageText);
    message.appendChild(item);

    window.scrollTo(0, document.body.scrollHeight); // Scroll down to latest message
    socket.auth.serverOffset = serverOffset; // Store server offset for consistency
});

// Switch channels
function switchChannel() {
    let newChannel = document.getElementById("channelSelect").value;
    socket.emit('join channel', newChannel, username, (response) => {
        console.log(response);
        document.getElementById("messages").innerHTML = ""; // Clear messages
    });
    channel_ID = newChannel;
}
