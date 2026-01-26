const socket = io();
let myData = null;

const loginScreen = document.getElementById('login-screen');
const mainScreen = document.getElementById('main-screen');
const statusMsg = document.getElementById('status-msg');
const nominationZone = document.getElementById('nomination-zone');
const bidZone = document.getElementById('bid-zone');
const log = document.getElementById('log');
const userStats = document.getElementById('user-stats');

function login() {
    const user = document.getElementById('username').value;
    if (user) {
        socket.emit('login', user);
        loginScreen.classList.add('hidden');
        mainScreen.classList.remove('hidden');
    }
}

socket.on('updateUsers', (users) => {
    myData = users.find(u => u.id === socket.id);

    userStats.innerHTML = users.map(u => `
        <div class="user-card ${u.items.length >= 4 ? 'finished' : ''}">
            <b>${u.username} ${u.items.length >= 4 ? '(Done)' : ''}</b><br>
            Bank: $${u.bankroll}<br>
            <small>Items: ${u.items.join(', ') || 'None'}</small>
        </div>
    `).join('');

    if (users.length < 3) {
        statusMsg.innerText = `Awaiting ${3 - users.length} more user(s)...`;
    }
});

socket.on('awaitNomination', (nominatorName) => {
    bidZone.classList.add('hidden');
    
    // If I'm finished, I can't nominate
    if (myData && myData.items.length >= 4) {
        statusMsg.innerText = "You have 4 items. Waiting for others to finish.";
        nominationZone.classList.add('hidden');
        return;
    }

    const isMe = document.getElementById('username').value === nominatorName;
    statusMsg.innerText = isMe ? "It's your turn to nominate!" : `Waiting for ${nominatorName} to nominate...`;
    nominationZone.classList.toggle('hidden', !isMe);
});

socket.on('startBidding', (itemName) => {
    nominationZone.classList.add('hidden');
    
    // If I'm finished, I just watch
    if (myData && myData.items.length >= 4) {
        statusMsg.innerText = `Bidding in progress for: ${itemName}`;
        return;
    }

    bidZone.classList.remove('hidden');
    document.getElementById('current-item').innerText = itemName;
    statusMsg.innerText = "Submit your secret bid!";
});

function nominate() {
    const itemInput = document.getElementById('item-name');
    if (itemInput.value) {
        socket.emit('submitNomination', itemInput.value);
        itemInput.value = '';
    }
}

function submitBid() {
    const bidInput = document.getElementById('bid-amount');
    const val = parseInt(bidInput.value);

    // Logic: Max Bid = Bankroll - (Remaining Items - 1)
    const itemsRemaining = 4 - myData.items.length;
    const maxAllowedBid = myData.bankroll - (itemsRemaining - 1);

    if (isNaN(val) || val < 0) {
        alert("Please enter a valid number ($0 to pass).");
    } else if (val > maxAllowedBid) {
        alert(`Limit exceeded! To ensure you can afford ${itemsRemaining} items, your max bid is $${maxAllowedBid}.`);
    } else {
        socket.emit('submitBid', val);
        bidZone.classList.add('hidden');
        statusMsg.innerText = "Bid submitted. Waiting for others...";
        bidInput.value = '';
    }
}

socket.on('roundResult', (res) => {
    log.innerHTML += `<div><strong>${res.user}</strong> won <strong>${res.item}</strong> for $${res.bid}</div>`;
    log.scrollTop = log.scrollHeight;
});

socket.on('tie', (names) => {
    if (myData && myData.items.length < 4) {
        alert(`Tie between ${names.join(' and ')}! Re-bidding...`);
        bidZone.classList.remove('hidden');
    }
});

socket.on('gameOver', (users) => {
    mainScreen.innerHTML = `
        <div style="text-align:center; padding: 20px;">
            <h1>The auction is over, the results are below:</h1>
            <table border="1" style="width:100%; border-collapse: collapse;">
                <tr><th>User</th><th>Remaining Bankroll</th><th>Items Won</th></tr>
                ${users.map(u => `
                    <tr>
                        <td>${u.username}</td>
                        <td>$${u.bankroll}</td>
                        <td>${u.items.join(', ')}</td>
                    </tr>
                `).join('')}
            </table>
            <br><button onclick="window.location.reload()">New Session</button>
        </div>
    `;
});