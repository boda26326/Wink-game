const socket = io();
let myRole = "";
let selectedId = null;
let selectedRoomId = null;
let roomType = 'public';
let isFinalGuessMode = false;

// 1. وظائف الواجهة والتنبيهات
function showScreen(id) {
    document.querySelectorAll('.setup-screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'flex';
}

function showAlert(msg) {
    const al = document.getElementById('custom-alert');
    if (al) {
        al.innerText = msg;
        al.style.display = 'block';
        setTimeout(() => { al.style.display = 'none'; }, 3000);
    }
}

function copyCode() {
    const code = document.getElementById('room-code-display').innerText;
    navigator.clipboard.writeText(code).then(() => {
        showAlert("تم نسخ كود الغرفة! 📋");
    });
}

function setDevice(type) {
    const grid = document.getElementById('players-grid');
    document.querySelectorAll('.btn-device').forEach(b => {
        b.classList.remove('active');
        if(b.innerText.includes(type === 'mobile' ? 'موبايل' : 'كمبيوتر')) b.classList.add('active');
    });
    grid.style.transform = type === 'mobile' ? "translate(-50%, -50%) scale(0.5)" : "translate(-50%, -50%) scale(1)";
}

// 2. تحديث قائمة الغرف
socket.on('roomsUpdate', (list) => {
    const container = document.getElementById('rooms-list');
    if(!container) return;
    container.innerHTML = '';
    list.forEach(room => {
        const div = document.createElement('div');
        div.style.padding = "10px"; div.style.borderBottom = "1px solid #222"; div.style.cursor="pointer";
        div.innerHTML = `${room.type==='private'?'🔐':'🏠'} ${room.hostName} (${room.count})`;
        div.onclick = () => {
            selectedRoomId = room.id;
            document.querySelectorAll('#rooms-list div').forEach(d => d.style.background="transparent");
            div.style.background = "#1e2a1e";
        };
        container.appendChild(div);
    });
});

// 3. الانضمام والإنشاء
function createRoom() {
    const name = document.getElementById('username-create').value.trim();
    const pass = document.getElementById('room-code-display').innerText;
    if(!name) return alert("اكتب اسمك!");
    socket.emit('joinGame', { name, roomId: (roomType==='private'?pass:"room_"+name), password: pass, type: roomType });
}

function joinSelectedRoom() {
    const name = document.getElementById('username-join').value.trim();
    const pass = document.getElementById('join-password').value.trim();
    if(!name || !selectedRoomId) return alert("اختار غرفة!");
    socket.emit('joinGame', { name, roomId: selectedRoomId, password: pass });
}

// 4. تحديث الواجهة (UI)
socket.on('updateUI', (data) => {
    document.getElementById('setup-container').style.display = 'none';
    document.getElementById('game-area').style.display = 'flex';
    document.getElementById('host-controls').style.display = data.isHost ? 'block' : 'none';
    
    const grid = document.getElementById('players-grid');
    document.querySelectorAll('.player-box').forEach(p => p.remove());

    if (!data.gameStarted) {
        document.querySelectorAll('.thrown-paper').forEach(card => card.remove());
        isFinalGuessMode = false;
        document.getElementById('confirm-guess-btn').style.display = 'none';
    }

    data.players.forEach((p, i) => {
        const angle = (i / data.players.length) * Math.PI * 2;
        const div = document.createElement('div');
        div.id = "p-" + p.id;
        div.className = 'player-box' + (p.confessed ? ' confessed' : '');
        div.style.left = (300 + 240 * Math.cos(angle)) + 'px';
        div.style.top = (300 + 240 * Math.sin(angle)) + 'px';
        div.innerHTML = `<span>${p.id === socket.id ? "أنت" : p.name}</span>`;

        if(p.confessed) {
            createThrownCard(p.id, i, data.players.length);
        }

        div.onclick = () => {
            if(p.id === socket.id || p.confessed) return;
            selectedId = p.id;
            document.querySelectorAll('.player-box').forEach(b => b.classList.remove('selected'));
            div.classList.add('selected');

            if (isFinalGuessMode) {
                document.getElementById('confirm-guess-btn').style.display = 'block';
            } else if (myRole === 'غ') {
                document.getElementById('wink-btn').style.display = 'block';
                document.getElementById('wink-btn').onclick = triggerMinigame;
            }
        };
        grid.appendChild(div);
    });
});

// 5. منطق الورقة الطائرة (معدل ليكون قريباً من اللاعب)
function createThrownCard(playerId, index, total) {
    const cardId = "card-" + playerId;
    if (document.getElementById(cardId)) return; 

    const card = document.createElement('div');
    card.id = cardId;
    card.className = 'thrown-paper';
    card.innerText = ""; 
    
    // زاوية اللاعب الأصلية
    const angle = (index / total) * Math.PI * 2;
    
    // مكان البداية (عند اللاعب بالضبط)
    const startX = 300 + 240 * Math.cos(angle);
    const startY = 300 + 240 * Math.sin(angle);
    
    card.style.left = startX + "px";
    card.style.top = startY + "px";
    
    document.getElementById('players-grid').appendChild(card);
    
    // الهدف: مسافة قريبة من اللاعب (داخل الدائرة المنقطة شوية)
    setTimeout(() => {
        // 130 هو نصف قطر الدائرة الداخلية، بنخلي الورقة تثبت عند مسافة 160 من المركز (قريبة للاعب)
        const targetDist = 105; 
        const drift = (Math.random() - 0.5) * 30; // تشتيت بسيط عشان الورق م يركبش فوق بعضه
        
        const endX = 300 + targetDist * Math.cos(angle) + drift;
        const endY = 300 + targetDist * Math.sin(angle) + drift;
        
        card.style.left = endX + "px";
        card.style.top = endY + "px";
        card.style.transform = `translate(-50%, -50%) rotate(${(Math.random() * 60) - 30}deg)`;
    }, 50);
}

// 6. أحداث Socket
socket.on('showBubble', ({ id, msg }) => {
    const pBox = document.getElementById("p-" + id);
    if(pBox) {
        const bubble = document.createElement('div');
        bubble.className = 'speech-bubble';
        bubble.innerText = msg;
        pBox.appendChild(bubble);
        setTimeout(() => bubble.remove(), 3000);

        const allBoxes = Array.from(document.querySelectorAll('.player-box'));
        const idx = allBoxes.findIndex(b => b.id === "p-" + id);
        if(idx !== -1) {
            createThrownCard(id, idx, allBoxes.length);
        }
    }
});

socket.on('startFinalGuess', () => {
    isFinalGuessMode = true;
    showAlert("أنت آخر لاعب! خمن الآن مين الغمازة واضغط تأكيد.");
});

function confirmGuess() {
    if(!selectedId) return alert("اختار لاعب أولاً!");
    socket.emit('finalGuess', selectedId);
    isFinalGuessMode = false;
    document.getElementById('confirm-guess-btn').style.display = 'none';
}

socket.on('visualShake', (id) => {
    const el = document.getElementById("p-" + id);
    if(el) { el.classList.add('shake-effect'); setTimeout(()=>el.classList.remove('shake-effect'), 500); }
});

socket.on('gameOver', (msg) => {
    showAlert(msg);
    myRole = ""; 
    document.getElementById('card-value').innerText = "?";
    document.getElementById('confess-btn').style.display = 'none';
    document.getElementById('wink-btn').style.display = 'none';
});

socket.on('youGotWinked', () => {
    document.getElementById('confess-btn').style.display = 'block';
    if(navigator.vibrate) navigator.vibrate(200);
});

socket.on('receiveRole', (r) => { 
    myRole = r; 
    document.getElementById('card-value').innerText = r;
    if(r === 'غ') document.getElementById('confess-btn').style.display = 'block';
});

// 7. التحكم
function toggleRoomType(t) {
    roomType = t;
    document.getElementById('btn-public').classList.toggle('active', t==='public');
    document.getElementById('btn-private').classList.toggle('active', t==='private');
    document.getElementById('copy-area').style.display = t==='private'?'block':'none';
    document.getElementById('room-code-display').innerText = Math.random().toString(36).substring(2,8).toUpperCase();
}

function triggerMinigame() {
    const count = Math.floor(Math.random()*3)+2;
    document.getElementById('minigame-overlay').style.display='flex';
    document.getElementById('mini-display').innerText = "⭐".repeat(count);
    const input = document.getElementById('minigame-input');
    input.value = ""; input.focus();
    input.onkeyup = (e) => {
        if(e.key === "Enter") {
            if(parseInt(input.value) === count) socket.emit('sendWink', selectedId);
            else socket.emit('failedMinigame');
            document.getElementById('minigame-overlay').style.display='none';
            document.getElementById('wink-btn').style.display='none';
        }
    };
}

function startGame() { socket.emit('startGame'); }
function confess() { 
    socket.emit('confess'); 
    document.getElementById('confess-btn').style.display='none'; 
}
