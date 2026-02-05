const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// --- GLOBAL STATE ---
let players = {}; 
let auctionState = {
    status: 'WAITING', 
    currentNomination: null,
    currentNominator: null,
    bids: {}
};

const MAX_USERS = 3;
const ITEMS_GOAL = 4;

io.on('connection', (socket) => {
    // RECOVERY: Reconnect existing user
    socket.on('rejoin', (username) => {
        if (players[username]) {
            players[username].socketId = socket.id;
            socket.emit('syncState', {
                players: Object.values(players),
                auctionState: auctionState,
                me: players[username]
            });
            io.emit('updateUsers', Object.values(players));
        }
    });

    // LOGIN: Initial entry
    socket.on('login', (username) => {
        if (Object.keys(players).length < MAX_USERS && !players[username]) {
            players[username] = {
                username: username,
                socketId: socket.id,
                bankroll: 100,
                items: []
            };
            io.emit('updateUsers', Object.values(players));
            if (Object.keys(players).length === MAX_USERS) {
                startNewRound();
            }
        }
    });

    socket.on('submitNomination', (itemName) => {
        auctionState.status = 'BIDDING';
        auctionState.currentNomination = itemName;
        auctionState.bids = {};
        io.emit('startBidding', itemName);
    });

    socket.on('submitBid', (amount) => {
        const user = Object.values(players).find(p => p.socketId === socket.id);
        if (user && auctionState.status === 'BIDDING') {
            auctionState.bids[user.username] = parseInt(amount);
            const activePlayers = Object.values(players).filter(p => p.items.length < ITEMS_GOAL);
            if (Object.keys(auctionState.bids).length === activePlayers.length) {
                processBids();
            }
        }
    });
});

function startNewRound() {
    const allPlayers = Object.values(players);
    const totalItemsWon = allPlayers.reduce((sum, p) => sum + p.items.length, 0);

    if (totalItemsWon === MAX_USERS * ITEMS_GOAL) {
        auctionState.status = 'FINISHED';
        return io.emit('gameOver', allPlayers);
    }

    let usernames = Object.keys(players);
    if (!auctionState.currentNominator) {
        auctionState.currentNominator = usernames[Math.floor(Math.random() * MAX_USERS)];
    }

    while (players[auctionState.currentNominator].items.length >= ITEMS_GOAL) {
        let idx = usernames.indexOf(auctionState.currentNominator);
        auctionState.currentNominator = usernames[(idx + 1) % MAX_USERS];
    }

    auctionState.status = 'NOMINATING';
    io.emit('awaitNomination', auctionState.currentNominator);
}

function processBids() {
    let highestBid = -1;
    let winners = [];

    for (let username in auctionState.bids) {
        let bid = auctionState.bids[username];
        if (bid > highestBid) {
            highestBid = bid;
            winners = [username];
        } else if (bid === highestBid && highestBid > 0) {
            winners.push(username);
        }
    }

    if (highestBid <= 0) return startNewRound();

    if (winners.length > 1) {
        io.emit('tie', winners);
        auctionState.bids = {}; 
    } else {
        const winner = players[winners[0]];
        winner.bankroll -= highestBid;
        winner.items.push(auctionState.currentNomination);
        io.emit('roundResult', { user: winner.username, bid: highestBid, item: auctionState.currentNomination });
        io.emit('updateUsers', Object.values(players));
        auctionState.currentNominator = winner.username;
        startNewRound();
    }
}

server.listen(3000, () => console.log(`Auction Server on port 3000`));