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
        <div style="margin-bottom:10px; border-left:3px solid #bfbfbf; padding-left:10px;">
            <b style="color:#bfbfbf">${res.user} won ${res.item} ($${res.bid})</b>
            <div class="bid-reveal">Bids: ${reveal}</div>
        </div>
    `;
});

function updateUIWithPlayers(players) {
    const myName = localStorage.getItem('auction_user');
    const myPlayer = players.find(p => p.username === myName);
    if (myPlayer) myData = myPlayer;

    const userStats = players.map((p) => {
        const isMe = p.username === myName;
        const itemList = p.items.length 
            ? p.items.map(i => `<div style="padding: 4px 0; color: #f1f1f1;">• ${i.name} <span style="font-size: 0.85rem; opacity: 0.8;">(${i.category})</span></div>`).join('')
            : '<div style="opacity: 0.6;">None</div>';
        return `
            <div class="user-card" style="${isMe ? 'border: 2px solid var(--primary);' : ''}">
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
    document.getElementById('nomination-zone').classList.add('hidden');
    document.getElementById('bid-zone').classList.remove('hidden');
    document.getElementById('current-item').innerText = `${itemName} (${category})`;
    document.getElementById('status-msg').innerText = `Place your bid for ${itemName} (${category})`;
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