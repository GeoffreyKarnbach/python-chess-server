//The socket.io part:

//Import socket.io and create a server at the port specified in the .env file
const io = require('socket.io')(8080);

const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/chess', { useNewUrlParser: true, useUnifiedTopology: true, useCreateIndex: true });
const db = mongoose.connection;
db.on('error', error => console.error(error));
db.once('open', () => console.log('Connected to Mongoose'));

//Import the mongoose Chess model
var Chess = require('./models/chess');

//function to send the Error to both players
function sendError(socket, err) {
    socket.emit('errorMessage', err);
    socket.broadcast.emit('errorMessage', err);
}

io.on('connection', function (socket) {
    //Create game
    socket.on('create', async function (msg) {
        var newGame = new Chess({});
        var game = await newGame.save();
        socket.emit('roomIdMsg', game.id);
    })
    //What happens when a players joins
    socket.on('joined', async function (roomId) {
        try {
            var game = await Chess.findById(roomId);
            if(game == null | game == '') {
                socket.emit('errorMessage', 'We could not find the room you are searching for.');
            } else {
                socket.join(game.id);
                //Count the number of joins
                game.players++;
                game = await game.save();
            }
            //Determine player color
            let color;
            if(game.players > 2) {
                //If the game has already started / there are more than two players, determine the color client side.
                io.to(socket.id).emit('color', {color: 'null'});
            } else {
                //If there are less than 2 players / the game has just started, determine the color by the joining order.
                if (game.players % 2 == 0) color = 'black';
                else color = 'white';
                io.to(socket.id).emit('color', {color: color});
            }
            io.to(socket.id).emit('player', { players: game.players, color: color, roomId, board: game.fen});
        } catch (err) {
            sendError(socket, err);
        }    
    });
    //What happens when a player moves a piece
    socket.on('move', async function (msg) {
        try {
            var game = await Chess.findById(msg.room);
            game.previousfen = game.fen;
            game.fen = msg.board;
            game.updated = Date.now();
            await game.save();
            socket.broadcast.emit('move', msg);
        } catch (err) {
            sendError(socket, err)
        }
    });
    //Sending the message that the game begins
    socket.on('play', function (msg) {
        try {
            socket.broadcast.emit('play', msg);
        } catch (err) {
            sendError(socket, err)
        }
    });
    //Game over notice is sent to both players, the game is deleted
    socket.on('gameOver', async (msg) => {
        try {
            var game = await Chess.findById(msg);
            await game.remove();
            socket.emit('redirect', '/');
            socket.broadcast.emit('opponentLeave', '/play');
        } catch (err) {
            sendError(socket, err)
        }
    });
    //A player offered takeback
    socket.on('offerTakeback', async (msg) => {
        try {
            socket.broadcast.emit('takebackOffered', msg);
        } catch (err) {
            sendError(socket, err)
        }
    });
    //The other player accepted the takeback
    socket.on('takebackAccept', async (msg) => {
        try {
            var game = await Chess.findById(msg.id);
            game.fen = game.previousfen;
            await game.save();
            socket.emit('takebackResetBoard', game.previousfen);
            socket.broadcast.emit('takebackResetBoard', game.previousfen); 
        } catch (err) {
            sendError(socket, err)
        }
    });
});