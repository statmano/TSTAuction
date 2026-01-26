const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let users = [];
let bids = {};
let currentNomination = null;
let currentNominatorIdx = null;
const MAX_USERS = 3;
const ITEMS_GOAL = 4;

io.on('connection', (socket) => {
    socket.on('login', (username) => {
        if (users.length < MAX_USERS) {
            users.push({
                id: socket.id,
                username,
                bankroll: 100,
                items: [] // List of item names won
            });
            io.emit('updateUsers', users);
            if (users.length === MAX_USERS) startNewRound();
        }
    });

    socket.on('submitNomination', (itemName) => {
        currentNomination = itemName;
        bids = {};
        io.emit('startBidding', itemName);
    });

    socket.on('submitBid', (amount) => {
        bids[socket.id] = parseInt(amount);
        // Only count bids from users who haven't finished their 4 items
        const activeUsers = users.filter(u => u.items.length < ITEMS_GOAL);
        if (Object.keys(bids).length === activeUsers.length) {
            processBids();
        }
    });
});

function startNewRound() {
    const totalItemsWon = users.reduce((sum, u) => sum + u.items.length, 0);
    if (totalItemsWon === MAX_USERS * ITEMS_GOAL) {
        return io.emit('gameOver', users);
    }

    // Find next nominator who has < 4 items
    if (currentNominatorIdx === null) {
        currentNominatorIdx = Math.floor(Math.random() * MAX_USERS);
    }

    // Logic: if current nominator is finished, move to next available
    while (users[currentNominatorIdx].items.length >= ITEMS_GOAL) {
        currentNominatorIdx = (currentNominatorIdx + 1) % MAX_USERS;
    }

    const nominator = users[currentNominatorIdx];
    io.emit('awaitNomination', nominator.username);
}

function processBids() {
    let highestBid = -1;
    let winners = [];

    for (let id in bids) {
        if (bids[id] > highestBid) {
            highestBid = bids[id];
            winners = [id];
        } else if (bids[id] === highestBid && highestBid > 0) {
            winners.push(id);
        }
    }

    if (highestBid <= 0) {
        io.emit('logUpdate', "No bids over $0. Re-nominating.");
        return startNewRound();
    }

    if (winners.length > 1) {
        io.emit('tie', winners.map(id => users.find(u => u.id === id).username));
        bids = {};
    } else {
        const winner = users.find(u => u.id === winners[0]);
        winner.bankroll -= highestBid;
        winner.items.push(currentNomination);
        
        io.emit('roundResult', { user: winner.username, bid: highestBid, item: currentNomination });
        io.emit('updateUsers', users);

        // Next nominator is the winner, unless they just finished their 4th item
        currentNominatorIdx = users.findIndex(u => u.id === winner.id);
        startNewRound();
    }
}

server.listen(3000, () => console.log('Auction running on http://localhost:3000'));