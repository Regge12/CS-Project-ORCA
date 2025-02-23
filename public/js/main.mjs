import { setupSocket, listenForMessage, listenForSubmission, joinChannel } from './chat.mjs';

async function startApp(channel){
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

    /*
    const socket = await setupSocket(() => {
        console.log('Finished connection')
    });
*/
    console.log('Socket connected:', socket.connected); // Should be true if connected

    listenForMessage(socket);

    listenForSubmission(socket);

    joinChannel(socket, channel);
    console.log('finished set up');

    console.log('Socket connected:', socket.connected); // Should be true if connected
}

startApp(0);


