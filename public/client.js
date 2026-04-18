const socket = io({
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 20000
});
let myData = null;
let currentBids = {};
let currentCategory = null;
let isConnected = false;

// Connection status monitoring
socket.on('connect', () => {
    console.log('Connected to server');
    isConnected = true;
    updateConnectionStatus(true);
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    isConnected = false;
    updateConnectionStatus(false);
});

socket.on('reconnect', () => {
    console.log('Reconnected to server');
    isConnected = true;
    updateConnectionStatus(true);
    // Re-sync state after reconnection
    const savedName = localStorage.getItem('auction_user');
    if (savedName && myData) {
        socket.emit('rejoin', savedName);
    }
});

function updateConnectionStatus(connected) {
    const statusIndicator = document.getElementById('connection-status');
    if (!statusIndicator) {
        // Create status indicator if it doesn't exist
        const indicator = document.createElement('div');
        indicator.id = 'connection-status';
        indicator.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            padding: 5px 10px;
            border-radius: 5px;
            font-size: 12px;
            font-weight: bold;
            z-index: 1000;
        `;
        document.body.appendChild(indicator);
    }

    const indicator = document.getElementById('connection-status');
    if (connected) {
        indicator.textContent = '🟢 Connected';
        indicator.style.backgroundColor = 'rgba(34, 197, 94, 0.8)';
        indicator.style.color = 'white';
        setTimeout(() => indicator.style.display = 'none', 3000);
    } else {
        indicator.textContent = '🔴 Disconnected';
        indicator.style.backgroundColor = 'rgba(239, 68, 68, 0.8)';
        indicator.style.color = 'white';
        indicator.style.display = 'block';
    }
}

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

socket.on('loginFailed', (reason) => {
    alert(reason);
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
    currentBids = data.auctionState?.bids || {};
    currentCategory = data.auctionState?.currentCategory || null;
    updateUIWithPlayers(data.players, currentBids);
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

function canBidForCategory(player, category) {
    return player && player.items.length < 4 && player.inventory[category] < 2;
}

function submitBid() {
    if (!canBidForCategory(myData, currentCategory)) {
        return alert(`You cannot bid on ${currentCategory} because you already have the maximum allowed for that category.`);
    }

    const bidInput = document.getElementById('bid-amount');
    const val = parseInt(bidInput.value);
    const slotsLeft = 4 - myData.items.length;
    const max = myData.bankroll - (slotsLeft - 1);

    if (isNaN(val) || val < 0) return alert("Valid number please.");
    if (val > max) return alert("You must save $1 for each remaining horse slot!");

    // Check connection before submitting
    if (!isConnected) {
        alert("Connection lost. Please wait for reconnection and try again.");
        return;
    }

    // Attempt to submit bid with retry logic
    submitBidWithRetry(val, 3);
}

function submitBidWithRetry(amount, retries) {
    if (!isConnected && retries > 0) {
        console.log(`Connection lost, retrying bid submission in 1 second... (${retries} retries left)`);
        setTimeout(() => submitBidWithRetry(amount, retries - 1), 1000);
        return;
    }

    if (!isConnected) {
        alert("Unable to submit bid - connection lost. Please refresh the page.");
        return;
    }

    socket.emit('submitBid', amount);
    document.getElementById('bid-zone').classList.add('hidden');
    document.getElementById('status-msg').innerText = "Bid sent! Waiting...";
    document.getElementById('bid-amount').value = '';

    // Set a timeout to check if bid was acknowledged
    setTimeout(() => {
        if (document.getElementById('status-msg').innerText === "Bid sent! Waiting...") {
            console.log("Bid submission may have failed, attempting retry...");
            if (retries > 0) {
                submitBidWithRetry(amount, retries - 1);
            } else {
                alert("Bid submission failed. Please try again.");
                document.getElementById('bid-zone').classList.remove('hidden');
                document.getElementById('status-msg').innerText = "Bidding on: " + document.getElementById('current-item').innerText;
            }
        }
    }, 3000);
}

socket.on('updateUsers', (data) => {
    const players = data.players;
    currentBids = data.bids || {};
    updateUIWithPlayers(players, currentBids);
    const myName = localStorage.getItem('auction_user');
    myData = players.find(p => p.username === myName);
});

socket.on('awaitNomination', handleNominationState);
socket.on('startBidding', (data) => handleBiddingState(data.itemName, data.category));

socket.on('bidRejected', (message) => {
    alert(message);
    document.getElementById('bid-zone').classList.remove('hidden');
    document.getElementById('status-msg').innerText = "Bidding on: " + document.getElementById('current-item').innerText;
});

socket.on('bidAcknowledged', (data) => {
    console.log('Bid acknowledged:', data);
    // Bid was successfully received by server
});

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
        <div style="margin-bottom:10px; border-left:3px solid #bfbfbf; padding-left:10px;">
            <b style="color:#bfbfbf">${res.user} won ${res.item} ($${res.bid})</b>
            <div class="bid-reveal">Bids: ${reveal}</div>
        </div>
    `;
});

function updateUIWithPlayers(players, submittedBids = {}) {
    const myName = localStorage.getItem('auction_user');
    const myPlayer = players.find(p => p.username === myName);
    if (myPlayer) myData = myPlayer;

    const userStats = players.map((p) => {
        const isMe = p.username === myName;
        const hasSubmitted = submittedBids[p.username] !== undefined;
        const itemList = p.items.length 
            ? p.items.map(i => `<div style="padding: 4px 0; color: #f1f1f1;">• ${i.name} <span style="font-size: 0.85rem; opacity: 0.8;">(${i.category})</span></div>`).join('')
            : '<div style="opacity: 0.6;">None</div>';
        return `
            <div class="user-card${isMe ? ' my-card' : ''}${hasSubmitted ? ' bid-submitted' : ''}">
                <div><strong>${p.username}</strong> ${isMe ? '(You)' : ''}</div>
                <div>Bankroll: $${p.bankroll}</div>
                <div style="margin: 6px 0; font-size: 0.9rem;">
                    <span style="opacity: 0.75;">Won:</span>
                    ${itemList}
                </div>
                <div style="opacity: 0.8; font-size: 0.9rem;">Colts: ${p.inventory.Colt} | Fillies: ${p.inventory.Filly}</div>
            </div>
        `;
    }).join('');


    document.getElementById('user-stats').innerHTML = userStats;
}

function handleNominationState(currentNominator) {
    const myName = localStorage.getItem('auction_user');
    const isMyTurn = myName === currentNominator;

    document.getElementById('bid-zone').classList.add('hidden');
    document.getElementById('nomination-zone').classList.toggle('hidden', !isMyTurn);

    document.getElementById('status-msg').innerText = isMyTurn
        ? `It's your turn to nominate a horse!`
        : `${currentNominator} is nominating...`;
}

function handleBiddingState(itemName, category) {
    currentCategory = category;
    document.getElementById('nomination-zone').classList.add('hidden');
    document.getElementById('current-item').innerText = `${itemName} (${category})`;

    if (canBidForCategory(myData, category)) {
        document.getElementById('bid-zone').classList.remove('hidden');
        document.getElementById('status-msg').innerText = `Place your bid for ${itemName} (${category})`;
    } else {
        document.getElementById('bid-zone').classList.add('hidden');
        document.getElementById('status-msg').innerText = `You cannot bid on ${itemName} (${category}) because you already have the allowed amount.`;
    }
}

// Load and display selected names from JSON file
async function loadSelectedNames() {
    try {
        const response = await fetch('selected.json');
        const data = await response.json();
        const names = data.Selected.sort();
        const tbody = document.getElementById('selected-names-body');
        tbody.innerHTML = names.map(name => `
            <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">${name}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading selected names:', error);
    }
}

// Load selected names when the page loads
document.addEventListener('DOMContentLoaded', loadSelectedNames);