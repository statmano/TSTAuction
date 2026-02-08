const socket = io();
let myData = null;

// Handle the Join Button explicitly
document.getElementById('join-btn').addEventListener('click', () => {
    const user = document.getElementById('username').value.trim();
    if (user) {
        localStorage.setItem('auction_user', user);
        socket.emit('login', user);
    } else {
        alert("Please enter a name");
    }
});

socket.on('loginSuccess', (player) => {
    myData = player;
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');
});

// Auto-rejoin if page refreshes
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
        if (data.auctionState.tiedUsers.length > 0) {
            handleTieState(data.auctionState.tiedUsers);
        } else {
            handleBiddingState(data.auctionState.currentNomination, data.auctionState.currentCategory);
        }
    }
});

function nominate() {
    const name = document.getElementById('item-name').value.trim();
    const cat = document.getElementById('item-category').value;
    if (!name || !cat) return alert("Select Name and Category!");
    if (myData.inventory[cat] >= 2) return alert(`You already have 2 ${cat}s!`);
    socket.emit('submitNomination', { itemName: name, category: cat });
}

function submitBid() {
    const bidInput = document.getElementById('bid-amount');
    const val = parseInt(bidInput.value);
    const slotsLeft = 4 - myData.items.length;
    const max = myData.bankroll - (slotsLeft - 1);

    if (isNaN(val) || val < 0) return alert("Valid number please.");
    if (val > max) return alert("You must save $1 for each remaining horse slot!");

    socket.emit('submitBid', val);
    document.getElementById('bid-zone').classList.add('hidden');
    document.getElementById('status-msg').innerText = "Bid sent! Waiting...";
    bidInput.value = '';
}

socket.on('updateUsers', (players) => {
    updateUIWithPlayers(players);
    const myName = localStorage.getItem('auction_user');
    myData = players.find(p => p.username === myName);
});

socket.on('awaitNomination', handleNominationState);
socket.on('startBidding', (data) => handleBiddingState(data.itemName, data.category));

socket.on('tie', (data) => {
    handleTieState(data.winners, data.allBids);
});

function handleTieState(winners, allBids) {
    const myName = localStorage.getItem('auction_user');
    if(allBids) {
        let bids = Object.entries(allBids).map(([u, b]) => `${u}: $${b}`).join(', ');
        document.getElementById('log').innerHTML += `<div style="color:#f87171">TIE: ${bids}</div>`;
    }
    if (winners.includes(myName)) {
        alert("You are tied! Only tied users bid now.");
        document.getElementById('bid-zone').classList.remove('hidden');
        document.getElementById('status-msg').innerText = "TIE BREAKER: Resubmit bid!";
    } else {
        document.getElementById('bid-zone').classList.add('hidden');
        document.getElementById('status-msg').innerText = `Tie-break: ${winners.join(' vs ')}`;
    }
}

socket.on('roundResult', (res) => {
    let reveal = Object.entries(res.allBids).map(([u, b]) => `${u}: $${b}`).join(' | ');
    document.getElementById('log').innerHTML += `
        <div style="margin-bottom:10px; border-left:3px solid #2563eb; padding-left:10px;">
            <b style="color:#60a5fa">${res.user} won ${res.item} ($${res.bid})</b>
            <div class="bid-reveal">Bids: ${reveal}</div>
        </div>
    `;
    document.getElementById('log').scrollTop = document.getElementById('log').scrollHeight;
});

function updateUIWithPlayers(players) {
    document.getElementById('user-stats').innerHTML = players.map(u => {
        const horses = u.items.map(i => `<div>• ${i.name} (${i.category[0]})</div>`).join('');
        return `
            <div class="user-card">
                <b>${u.username}</b>
                <div>Bank: $${u.bankroll}</div>
                <div>C: ${u.inventory.Colt}/2 | F: ${u.inventory.Filly}/2</div>
                <div class="item-list">${horses || 'No horses'}</div>
            </div>
        `;
    }).join('');
}

function handleNominationState(nominatorName) {
    document.getElementById('bid-zone').classList.add('hidden');
    const isMe = localStorage.getItem('auction_user') === nominatorName;
    document.getElementById('status-msg').innerText = isMe ? "Your Nomination!" : `Waiting for ${nominatorName}...`;
    document.getElementById('nomination-zone').classList.toggle('hidden', !isMe);
}

function handleBiddingState(itemName, category) {
    document.getElementById('nomination-zone').classList.add('hidden');
    const full = myData && (myData.items.length >= 4 || myData.inventory[category] >= 2);
    if (full) {
        document.getElementById('status-msg').innerText = `Full on ${category}s. Watching...`;
        document.getElementById('bid-zone').classList.add('hidden');
    } else {
        document.getElementById('bid-zone').classList.remove('hidden');
        document.getElementById('current-item').innerText = `${itemName} (${category})`;
        document.getElementById('status-msg').innerText = "Submit Bid!";
    }
}