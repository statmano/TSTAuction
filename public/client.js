const socket = io();
let myData = null;

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
        handleBiddingState(data.auctionState.currentNomination, data.auctionState.currentCategory);
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
    const name = document.getElementById('item-name').value.trim();
    const cat = document.getElementById('item-category').value;
    if (!name || !cat) return alert("Select Name and Type!");
    if (myData.inventory[cat] >= 2) return alert(`Already have two ${cat}s!`);

    socket.emit('submitNomination', { itemName: name, category: cat });
    document.getElementById('item-name').value = '';
    document.getElementById('item-category').selectedIndex = 0;
}

function submitBid() {
    const bidInput = document.getElementById('bid-amount');
    const val = parseInt(bidInput.value);
    const totalRemaining = 4 - myData.items.length;
    const maxAllowedBid = myData.bankroll - (totalRemaining - 1);

    if (isNaN(val) || val < 0) return alert("Enter a valid number.");
    if (val > maxAllowedBid) return alert(`Max bid: $${maxAllowedBid}`);

    socket.emit('submitBid', val);
    document.getElementById('bid-zone').classList.add('hidden');
    document.getElementById('status-msg').innerText = "Bid sent! Waiting for others...";
    bidInput.value = '';
}

socket.on('updateUsers', (players) => {
    updateUIWithPlayers(players);
    const myName = localStorage.getItem('auction_user');
    myData = players.find(p => p.username === myName);
});

socket.on('awaitNomination', handleNominationState);
socket.on('startBidding', (data) => handleBiddingState(data.itemName, data.category));

socket.on('roundResult', (res) => {
    document.getElementById('log').innerHTML += `<div>💰 ${res.user}: ${res.item} (${res.category}) - $${res.bid}</div>`;
    document.getElementById('log').scrollTop = document.getElementById('log').scrollHeight;
});

socket.on('tie', (names) => {
    // Only those eligible for this horse receive the re-bid prompt
    const myName = localStorage.getItem('auction_user');
    const statusMsg = document.getElementById('status-msg');
    
    // Check if the current user was part of the tie (or is at least eligible to bid)
    // We check the bid zone visibility to see if they were an active bidder
    if (myData && myData.inventory[document.getElementById('current-item').innerText.includes('Colt') ? 'Colt' : 'Filly'] < 2) {
        alert(`Tie between ${names.join(' & ')}! Resubmit your bids.`);
        document.getElementById('bid-zone').classList.remove('hidden');
        statusMsg.innerText = "TIE BREAKER: Resubmit bid!";
    }
});

socket.on('gameOver', showGameOver);

function updateUIWithPlayers(players) {
    document.getElementById('user-stats').innerHTML = players.map(u => {
        const itemDisplay = u.items.map(i => 
            `<div>• ${i.name} <span class="category-badge ${i.category === 'Colt' ? 'c-badge' : 'f-badge'}">${i.category[0]}</span></div>`
        ).join('');

        return `
            <div class="user-card ${u.items.length >= 4 ? 'finished' : ''}">
                <b>${u.username}</b>
                <div>Bank: $${u.bankroll}</div>
                <div style="font-size: 0.7rem; margin: 4px 0;">C: ${u.inventory.Colt}/2 | F: ${u.inventory.Filly}/2</div>
                <div class="item-list">${itemDisplay || '<i>Empty</i>'}</div>
            </div>
        `;
    }).join('');
}

function handleNominationState(nominatorName) {
    document.getElementById('bid-zone').classList.add('hidden');
    const myName = localStorage.getItem('auction_user');
    const isMe = myName === nominatorName;
    
    if (myData && myData.items.length >= 4) {
        document.getElementById('status-msg').innerText = "Roster full.";
        return;
    }
    document.getElementById('status-msg').innerText = isMe ? "Your turn to nominate!" : `Waiting for ${nominatorName}...`;
    document.getElementById('nomination-zone').classList.toggle('hidden', !isMe);
}

function handleBiddingState(itemName, category) {
    document.getElementById('nomination-zone').classList.add('hidden');
    const ineligible = myData && (myData.items.length >= 4 || myData.inventory[category] >= 2);
    
    if (ineligible) {
        document.getElementById('status-msg').innerHTML = `<span style="color:gray">Ineligible for ${category}.</span>`;
        document.getElementById('bid-zone').classList.add('hidden');
    } else {
        document.getElementById('bid-zone').classList.remove('hidden');
        document.getElementById('current-item').innerText = `${itemName} (${category})`;
        document.getElementById('status-msg').innerText = "Submit your bid!";
    }
}

function showGameOver(players) {
    document.getElementById('main-screen').innerHTML = `
        <div class="panel">
            <h2>Draft Complete</h2>
            ${players.map(u => `
                <p><strong>${u.username}</strong>: ${u.items.map(i => i.name).join(', ')}</p>
            `).join('')}
            <button onclick="localStorage.clear(); location.reload();">New Draft</button>
        </div>
    `;
}