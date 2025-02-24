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

// Once the submit button is pressed, the client checks if the message is not empty
// Then the client sends this message to the client
form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value) {
        // Creates an unique identifier for each message
        let clientOffset = `${socket.id}-${counter++}`;
        socket.emit('chat message', input.value, clientOffset);
        input.value = '';
        input.placeholder = 'Enter'
    }
    else {
        input.placeholder = 'Invalid input';
    }
})

socket.on('chat message', function(msg, serverOffset) { // the message and the state of the server sent from the server
    // Creates a list element that will contain the message
    const iteam = document.createElement('li');
    iteam.textContent = msg;
    message.appendChild(iteam);
    window.scrollTo(0, document.body.scrollHeight); // Moves down the pages to fit the message
    socket.auth.serverOffset = serverOffset;
    // This will update the state of the client to be synced with the state of the server
})
// Once the message is recieved, it will be displayed to the client