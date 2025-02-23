export function setupSocket(callback){
  const socket = io({
    auth:{
    serverOffset: 0,
    //channel: '' // Ensure the channel is set for the user when they join
    },
    // How long the client will wait for an acknowlegdement from the server
    //ackTimeout: 10000,
    // The amount of times the client will try to send messages to the server
    retries: 3,
  });

    // Listen for connection state recovery (when the client reconnects)
    socket.on('reconnect', () => {
      console.log('Reconnected to the server');
      // Send the last known serverOffset to recover missed messages
      socket.emit('join channel', 0)//socket.auth.channel);
    });
    console.log('Socket connected:', socket.connected); // Should be true if connected
    callback()
  return socket;
}

export function listenForMessage(socket){
  socket.on('chat message', (payload) => {
    const { serverOffset, msg, sender } = payload;
    console.log('Message recieved');
    displayMessage(msg, sender);

    socket.auth.serverOffset = serverOffset;
  })
}

export function displayMessage(msg, sender){
  const iteam = document.createElement('li');
  const message = document.getElementById('messages')
  iteam.innerHTML = `<strong>${sender}:</strong> ${msg}`;
  message.appendChild(iteam);
  window.scrollTo(0, document.body.scrollHeight); // Moves down the pages to fit the message
  console.log('Message has been displayed');
}

export function sendMessage(socket, payload){
  socket.emit('chat message', payload, (e) =>{
    if(e){
      console.log(e);
    }
    console.log("Message acknowledged by the server");
  });
}

export function listenForSubmission(socket){
  const form = document.getElementById('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('input');
    if (input.value) {
      const messagePayload = {
        msg: input.value,
        sender: 'john',
        channel: 0//socket.auth.channel
      };
      sendMessage(socket, messagePayload);
      console.log('Message sent', messagePayload.msg);
      input.value = '';
      input.placeholder = 'Enter'
    } else { 
      input.placeholder = 'Invalid input';}
  })
}

export function joinChannel(socket, channel){
  ///socket.auth.channel = channel;
  //console.log(socket.auth.channel);
  socket.emit('join channel', channel);;
  console.log(`user has joined ${channel}`);
}


/*
// Testing purposes
var toggleButton = document.getElementById('toggle-btn');

toggleButton.addEventListener('click', function(e) {
  e.preventDefault();
  if (socket.connected) {
    toggleButton.innerText = 'Connect';
    socket.disconnect();
  } else {
    toggleButton.innerText = 'Disconnect';
    socket.connect();
  }
});
*/