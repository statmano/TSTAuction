const socket = io();
let myData = null;

// Re-login on refresh if name exists
window.onload = () => {
    const savedName = localStorage.getItem('auction_user');
    if (savedName) socket.emit('rejoin', savedName);
};

socket.on('syncState', (data) => {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');
    myData = data.me;
    updateUIWithPlayers(data.players);

    if (data.auctionState.status === 'NOMINATING') {
        handleNominationState(data.auctionState.currentNominator);
    } else if (data.auctionState.status === 'BIDDING') {
        handleBiddingState(data.auctionState.currentNomination);
    } else if (data.auctionState.status === 'FINISHED') {
        showGameOver(data.players);
    }
});

function login() {
    const user = document.getElementById('username').value.trim();
    if (user) {
        localStorage.setItem('auction_user', user);
        socket.emit('login', user);
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('main-screen').classList.remove('hidden');
    }
}

function nominate() {
    const itemInput = document.getElementById('item-name');
    if (itemInput.value.trim()) {
        socket.emit('submitNomination', itemInput.value);
        itemInput.value = '';
    }
}

function submitBid() {
    const bidInput = document.getElementById('bid-amount');
    const val = parseInt(bidInput.value);
    const itemsRemaining = 4 - myData.items.length;
    const maxAllowedBid = myData.bankroll - (itemsRemaining - 1);

    if (isNaN(val) || val < 0) {
        alert("Enter a valid number.");
    } else if (val > maxAllowedBid) {
        alert(`Max bid: $${maxAllowedBid}`);
    } else {
        socket.emit('submitBid', val);
        document.getElementById('bid-zone').classList.add('hidden');
        document.getElementById('status-msg').innerText = "Waiting for others...";
        bidInput.value = '';
    }
}

socket.on('updateUsers', (players) => {
    updateUIWithPlayers(players);
    const myName = localStorage.getItem('auction_user');
    myData = players.find(p => p.username === myName);
});

socket.on('awaitNomination', handleNominationState);
socket.on('startBidding', handleBiddingState);

socket.on('roundResult', (res) => {
    document.getElementById('log').innerHTML += `<div>💰 ${res.user}: ${res.item} ($${res.bid})</div>`;
    document.getElementById('log').scrollTop = document.getElementById('log').scrollHeight;
});

socket.on('tie', (names) => {
    if (myData && myData.items.length < 4) {
        alert(`Tie between ${names.join(' and ')}! Re-bid.`);
        document.getElementById('bid-zone').classList.remove('hidden');
    }
});

socket.on('gameOver', showGameOver);

function updateUIWithPlayers(players) {
    document.getElementById('user-stats').innerHTML = players.map(u => `
        <div class="user-card ${u.items.length >= 4 ? 'finished' : ''}">
            <b>${u.username}</b><br>$${u.bankroll} | ${u.items.length}/4
        </div>
    `).join('');
}

function handleNominationState(nominatorName) {
    document.getElementById('bid-zone').classList.add('hidden');
    const myName = localStorage.getItem('auction_user');
    const isMe = myName === nominatorName;
    
    if (myData && myData.items.length >= 4) {
        document.getElementById('status-msg').innerText = "Watching...";
        return;
    }
    document.getElementById('status-msg').innerText = isMe ? "Your turn!" : `Waiting for ${nominatorName}...`;
    document.getElementById('nomination-zone').classList.toggle('hidden', !isMe);
}

function handleBiddingState(itemName) {
    document.getElementById('nomination-zone').classList.add('hidden');
    if (myData && myData.items.length >= 4) return;
    document.getElementById('bid-zone').classList.remove('hidden');
    document.getElementById('current-item').innerText = itemName;
    document.getElementById('status-msg').innerText = "Submit bid!";
}

function showGameOver(players) {
    document.getElementById('main-screen').innerHTML = `
        <h1>Auction Over!</h1>
        ${players.map(u => `<p>${u.username}: ${u.items.join(', ')} ($${u.bankroll} left)</p>`).join('')}
        <button onclick="localStorage.clear(); location.reload();">New Game</button>
    `;
}