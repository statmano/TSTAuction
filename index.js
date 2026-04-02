const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let players = {}; 
let auctionState = {
    status: 'WAITING', 
    currentNomination: null,
    currentCategory: null,
    currentNominator: null,
    tiedUsers: [],
    bids: {}
};

function isEligibleBidder(player) {
    if (!player || auctionState.status !== 'BIDDING') return false;
    if (player.items.length >= ITEMS_GOAL) return false;
    if (player.inventory[auctionState.currentCategory] >= 2) return false;
    if (auctionState.tiedUsers.length > 0) {
        return auctionState.tiedUsers.includes(player.username);
    }
    return true;
}

function getEligibleBidderCount() {
    if (auctionState.tiedUsers.length > 0) return auctionState.tiedUsers.length;
    return Object.values(players).filter(p => isEligibleBidder(p)).length;
}

function broadcastUsers() {
    io.emit('updateUsers', {
        players: Object.values(players),
        bids: auctionState.bids
    });
}

const MAX_USERS = 3;
const ITEMS_GOAL = 4;

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('login', (username) => {
        console.log('Login attempt:', username);
        if (Object.keys(players).length < MAX_USERS && !players[username]) {
            players[username] = {
                username: username,
                socketId: socket.id,
                bankroll: 100,
                items: [],
                inventory: { Colt: 0, Filly: 0 }
            };
            socket.emit('loginSuccess', players[username]);
            broadcastUsers();
            
            if (Object.keys(players).length === MAX_USERS) {
                startNewRound();
            }
        } else {
            const reason = players[username]
                ? 'That name is already taken. Please choose another.'
                : 'Auction is full. Please try again later.';
            socket.emit('loginFailed', reason);
        }
    });

    socket.on('rejoin', (username) => {
        if (players[username]) {
            players[username].socketId = socket.id;
            socket.emit('syncState', {
                players: Object.values(players),
                auctionState: auctionState,
                me: players[username]
            });
            broadcastUsers();
        }
    });

    socket.on('submitNomination', ({ itemName, category }) => {
        auctionState.status = 'BIDDING';
        auctionState.currentNomination = itemName;
        auctionState.currentCategory = category;
        auctionState.tiedUsers = [];
        auctionState.bids = {};
        broadcastUsers();
        io.emit('startBidding', { itemName, category });
    });

    socket.on('submitBid', (amount) => {
        const user = Object.values(players).find(p => p.socketId === socket.id);
        if (!user || auctionState.status !== 'BIDDING') return;

        if (!isEligibleBidder(user)) {
            socket.emit('bidRejected', 'You are not eligible to bid for this category.');
            return;
        }

        auctionState.bids[user.username] = parseInt(amount);
        broadcastUsers();

        const requiredCount = getEligibleBidderCount();
        if (Object.keys(auctionState.bids).length >= requiredCount) {
            processBids();
        }
    });
});

function startNewRound() {
    const allPlayers = Object.values(players);
    const totalItemsWon = allPlayers.reduce((sum, p) => sum + p.items.length, 0);

    if (totalItemsWon === (MAX_USERS * ITEMS_GOAL)) {
        auctionState.status = 'FINISHED';
        return io.emit('gameOver', allPlayers);
    }

    let usernames = Object.keys(players);
    if (!auctionState.currentNominator) {
        auctionState.currentNominator = usernames[0];
    }

    while (players[auctionState.currentNominator].items.length >= ITEMS_GOAL) {
        let idx = usernames.indexOf(auctionState.currentNominator);
        auctionState.currentNominator = usernames[(idx + 1) % MAX_USERS];
    }

    auctionState.status = 'NOMINATING';
    auctionState.tiedUsers = []; 
    io.emit('awaitNomination', auctionState.currentNominator);
}

function processBids() {
    let highestBid = -1;
    let currentWinners = [];

    for (let username in auctionState.bids) {
        let bid = auctionState.bids[username];
        if (bid > highestBid) {
            highestBid = bid;
            currentWinners = [username];
        } else if (bid === highestBid && highestBid > 0) {
            currentWinners.push(username);
        }
    }

    if (highestBid <= 0) {
        auctionState.status = 'NOMINATING';
        io.emit('awaitNomination', auctionState.currentNominator);
        return;
    }

    if (currentWinners.length > 1) {
        const allBidsAtTie = {...auctionState.bids};
        auctionState.tiedUsers = currentWinners; 
        auctionState.bids = {}; 
        io.emit('tie', { winners: currentWinners, allBids: allBidsAtTie });
    } else {
        const winnerName = currentWinners[0];
        const winner = players[winnerName];
        const finalBids = {...auctionState.bids};

        winner.bankroll -= highestBid;
        winner.items.push({ name: auctionState.currentNomination, category: auctionState.currentCategory });
        winner.inventory[auctionState.currentCategory]++;
        
        io.emit('roundResult', { 
            user: winnerName, 
            bid: highestBid, 
            item: auctionState.currentNomination,
            category: auctionState.currentCategory,
            allBids: finalBids 
        });
        
        broadcastUsers();
        auctionState.currentNominator = winnerName;
        startNewRound();
    }
}

server.listen(3000, () => console.log('Server live on http://localhost:3000'));