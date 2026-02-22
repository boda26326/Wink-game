const socket = io();
let myRole = "", isForcedGuessMode = false, selectedId = null;
let gameTimer;
let selectedDevice = 'pc'; 

// --- الدوال الأساسية ---

function join() {
    const name = document.getElementById('username').value;
    const room = document.getElementById('room-id').value;
    if (name && room) {
        socket.emit('joinGame', { name, roomId: room });
        // ملاحظة: يفضل تخلي الانتقال للشاشة التانية جوه socket.on('updateUI') عشان تضمن إن الاسم اتقبل
    }
}

function setDevice(type) {
    selectedDevice = type;
    document.body.classList.toggle('mobile-mode', type === 'mobile');
    
    const joinBtn = document.getElementById('join-btn');
    if (joinBtn) {
        joinBtn.disabled = false;
        joinBtn.style.opacity = "1";
        joinBtn.style.pointerEvents = "auto";
    }

    document.querySelectorAll('.device-btn').forEach(btn => {
        btn.classList.toggle('active', btn.innerText.includes(type === 'pc' ? 'كمبيوتر' : 'موبايل'));
    });

    adjustScale();
}

function adjustScale() {
    const grid = document.getElementById('players-grid');
    if (!grid) return;
    let finalScale = 1;
    if (selectedDevice === 'mobile') {
        const scaleX = window.innerWidth / 850;
        const scaleY = window.innerHeight / 650;
        finalScale = Math.min(scaleX, scaleY, 0.6);
    }
    grid.style.transform = `translate(-50%, -50%) scale(${finalScale})`;
}

window.addEventListener('resize', adjustScale);

// --- إدارة الواجهة UI ---

function updateUI(data) {
    if (!data) return;
    
    // إظهار منطقة اللعب وإخفاء شاشة الدخول
    document.getElementById('setup').style.display = 'none';
    document.getElementById('game-area').style.display = 'flex';
    document.body.classList.add('in-game');
    
    // إظهار تحكم الهوست
    if (data.isHost) document.getElementById('host-controls').style.display = 'block';
    
    // وضع التخمين الإجباري
    if (data.guesserId === socket.id) {
        isForcedGuessMode = true;
        document.getElementById('status').innerHTML = '<span class="guess-alert">🚨 خمن مين الغمازة!</span>';
    }

    const grid = document.getElementById('players-grid');
    if (!grid) return;

    // --- التعديل السحري هنا ---
    // بنمسح اللاعيبة والدايرة بس، وبنسيب الـ dead-card زي ما هي عشان متختفيش
    document.querySelectorAll('.player-box, #center-circle').forEach(el => el.remove());

    // إنشاء دايرة السنتر من جديد وإضافتها
    const circle = document.createElement('div');
    circle.id = 'center-circle';
    grid.appendChild(circle);
    
    // تنسيق دايرة السنتر
    const circleSize = selectedDevice === 'mobile' ? 350 : 350; 
    Object.assign(circle.style, {
        position: 'absolute', 
        left: '50%', 
        top: '50%', 
        transform: 'translate(-50%, -50%)',
        width: circleSize + 'px', 
        height: circleSize + 'px', 
        backgroundColor: 'rgba(255, 255, 255, 0.05)', 
        border: '2px dashed rgba(255, 255, 255, 0.1)',
        borderRadius: '50%', 
        zIndex: '0', 
        pointerEvents: 'none'
    });

    const players = data.players || [];
    const radiusPct = 42; 
    
    // رسم اللاعبين في الدائرة
    players.forEach((p, i) => {
        const angle = (i / players.length) * Math.PI * 2; 
        const div = document.createElement('div');
        div.id = `p-${p.id}`;
        div.className = 'player-box' + (p.confessed ? ' confessed' : '');
        
        // حساب الإحداثيات (بما يتناسب مع حجم الشاشة)
        const leftPct = 50 + (radiusPct * 0.75) * Math.cos(angle);
        const topPct = 50 + radiusPct * Math.sin(angle);
        
        div.style.left = leftPct + '%';
        div.style.top = topPct + '%';
        div.style.transform = 'translate(-50%, -50%)';
        div.innerHTML = `<span>${p.id === socket.id ? "أنت" : p.name}</span>`;

        // منطق النقر على اللاعب
        div.onclick = (e) => {
            e.stopPropagation();
            // منع النقر على النفس أو على حد معترف (إلا لو في وضع التخمين الإجباري)
            if (p.id === socket.id || (p.confessed && !isForcedGuessMode)) return;
            
            document.querySelectorAll('.player-box').forEach(el => el.classList.remove('selected'));
            div.classList.add('selected');
            selectedId = p.id;
            
            const btn = document.getElementById('wink-btn');
            if (isForcedGuessMode) {
                btn.innerText = "تأكيد التخمين ✅";
                btn.style.display = 'block';
                btn.onclick = () => socket.emit('makeGuess', { targetId: selectedId });
            } else if (myRole === 'غ' && !p.confessed) {
                btn.innerText = "اغمزله 😉";
                btn.style.display = 'block';
                btn.onclick = () => triggerMinigame();
            }
        };
        grid.appendChild(div);
    });
}

// --- أحداث Socket.io ---

socket.on('updateUI', (data) => {
    const gameData = Array.isArray(data) ? data[0] : data;
    updateUI(gameData);
});

socket.on('receiveRole', (role) => {
    myRole = role;
    const cardDisplay = document.getElementById('card-value');
    
    if (role === 'غ') {
        document.getElementById('confess-btn').style.display = 'block';
        cardDisplay.innerText = "غ";
        cardDisplay.style.color = "#ff4444"; // لون أحمر للغمازة
    } else {
        document.getElementById('confess-btn').style.display = 'none';
        cardDisplay.innerText = role; // هيعرض الرقم (1 أو 2 أو 3...)
        cardDisplay.style.color = "#b49000"; // لون ذهبي للأرقام
    }
});

socket.on('showConfessBtn', () => {
    // دي بتتبعت من السيرفر للضحية بس
    console.log("الضحية استلم الغمزة، بنظهر زرار الاعتراف...");
    document.getElementById('confess-btn').style.display = 'block';
});

socket.on('playerConfessed', (data) => {
    const box = document.getElementById(`p-${data.id}`);
    if (!box) return;

    box.classList.add('confessed');

    // فقاعة الكلام
    const msg = document.createElement('div');
    msg.className = 'bubble-msg';
    msg.innerText = 'أنا اتغمزلي! 😵';
    box.appendChild(msg);
    setTimeout(() => { if (msg.parentNode) msg.remove(); }, 3000);

    // كارت الموت (الرمي)
    const card = document.createElement('div');
    card.className = 'dead-card';
    const startX = parseFloat(box.style.left);
    const startY = parseFloat(box.style.top);
    const targetX = 50 + (startX - 50) * 0.5; 
    const targetY = 50 + (startY - 50) * 0.5;

    card.style.left = startX + '%';
    card.style.top = startY + '%';
    document.getElementById('players-grid').appendChild(card);

    setTimeout(() => {
        card.style.opacity = '1';
        card.style.left = targetX + '%';
        card.style.top = targetY + '%';
        card.style.transform = `translate(-50%, -50%) rotate(${Math.random() * 40 - 20}deg)`;
    }, 50);
});

socket.on('playerVibrateEffect', (data) => {
    const winkerBox = document.getElementById(`p-${data.winkerId}`);
    if (winkerBox) {
        const className = (data.errorType === 'light') ? 'vibrate-light' : 'vibrate-hard';
        
        // إضافة الكلاس
        winkerBox.classList.add(className);
        
        // (إضافة اختيارية) هز الموبايل فعلياً لو أندرويد لزيادة الأكشن
        if (navigator.vibrate) {
            navigator.vibrate(data.errorType === 'light' ? 100 : 400);
        }

        // نشيل الكلاس بعد ثانية كاملة (1000ms) عشان الناس تلحق تشوف اللون
        setTimeout(() => {
            winkerBox.classList.remove(className);
        }, 1000); 
    }
});

socket.on('gameRestarted', () => {
    isForcedGuessMode = false;
    selectedId = null;
    document.getElementById('status').innerHTML = '';
    document.getElementById('wink-btn').style.display = 'none';
    document.querySelectorAll('.player-box').forEach(box => box.classList.remove('confessed', 'selected'));
    document.querySelectorAll('.dead-card, .bubble-msg').forEach(el => el.remove());
    document.querySelectorAll('.dead-card').forEach(card => card.remove()); // ✅ ينظف هنا
    document.querySelectorAll('.bubble-msg').forEach(msg => msg.remove());
    // حط السطر ده جوه socket.on('roundEnded') 
    // وجوه socket.on('gameRestarted')
    document.getElementById('cards-layer').innerHTML = '';
});
socket.on('roundEnded', () => {
    myRole = "";
    isForcedGuessMode = false;
    selectedId = null;

    // تنظيف الواجهة
    document.getElementById('card-value').innerText = "؟";
    document.getElementById('confess-btn').style.display = 'none';
    document.getElementById('wink-btn').style.display = 'none';
    document.getElementById('status').innerHTML = '<span>في انتظار الهوست يبدأ...</span>';

    // مسح أي كروت ميتة أو فقاعات كلام
    document.querySelectorAll('.dead-card, .bubble-msg').forEach(el => el.remove());
    document.querySelectorAll('.dead-card').forEach(card => card.remove()); // ✅ ينظف هنا
    // حط السطر ده جوه socket.on('roundEnded') 
    // وجوه socket.on('gameRestarted')
    document.getElementById('cards-layer').innerHTML = '';

    // إرجاع شكل اللاعيبة للطبيعي
    document.querySelectorAll('.player-box').forEach(box => {
        box.classList.remove('confessed', 'selected', 'vibrate-hard', 'vibrate-light');
        box.style.opacity = '1';
    
    });
});

socket.on('gameOver', (msg) => { 
    alert(msg); 
    // امسح السطر اللي كان بيمسح الـ dead-card من هنا ❌
    
    const winkBtn = document.getElementById('wink-btn');
    if (winkBtn) winkBtn.style.display = 'none';
});

socket.on('errorMsg', (msg) => {
    alert(msg);
    // نرجعه لشاشة الدخول وننظف الـ UI
    document.getElementById('setup').style.display = 'block';
    document.getElementById('game-area').style.display = 'none';
    document.body.classList.remove('in-game');
});

// --- الميني جيم (Minigame) ---

function triggerMinigame() {
    const emojis = ["🍎", "⭐", "⚽", "🐱", "🚀", "💎", "😂", "👾", "🎃", "🎁", "👓", "🎭", "🎨", "🎱", "🎢", "🎋", "🏐", "🎫", "🔑", "🎆", "♟"];
    const selectedEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    const count = Math.floor(Math.random() * 3) + 2;
    const displayString = selectedEmoji.repeat(count);
    
    const overlay = document.getElementById('minigame-overlay');
    const input = document.getElementById('minigame-input');
    
    overlay.style.display = 'flex';
    document.getElementById('mini-text').innerText = `كم عدد الـ ${selectedEmoji}؟`;
    document.querySelector('.mini-box p').innerText = displayString;
    
    input.value = ""; input.focus();
    let timeLeft = 3;
    
    clearInterval(gameTimer);
    gameTimer = setInterval(() => {
        timeLeft--;
        input.placeholder = `الوقت: ${timeLeft}s`;
        if (timeLeft <= 0) {
            clearInterval(gameTimer);
            handleMinigameFailure();
        }
    }, 1000);

        input.onkeyup = (e) => {
        if (e.key === "Enter") {
            clearInterval(gameTimer);
            const userValue = parseInt(input.value);
            if (userValue === count) {
                socket.emit('sendWink', selectedId);
                document.getElementById('minigame-overlay').style.display = 'none';
            } else {
                // حساب الفرق
                const diff = Math.abs(userValue - count);
                const errorSeverity = (diff <= 2) ? 'light' : 'hard';
            
                socket.emit('failedMinigame', errorSeverity); // بنبعت النوع للسيرفر
                document.getElementById('minigame-overlay').style.display = 'none';
                document.getElementById('wink-btn').style.display = 'none';
            }
        }
    };
}

function handleMinigameFailure() {
    socket.emit('failedMinigame'); // السيرفر هيهز مربعك قدام الكل
    document.getElementById('minigame-overlay').style.display = 'none';
    document.getElementById('wink-btn').style.display = 'none';
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

function confess() {
    socket.emit('confess'); // بيبعت للسيرفر إنك اعترفت
    document.getElementById('confess-btn').style.display = 'none'; // يختفي بعد ما تدوس
}

function endRound() {
    const isHost = document.getElementById('host-controls').style.display === 'block';
    if (isHost) {
        if (confirm("هل تريد إنهاء الدور والعودة لغرفة الانتظار؟")) {
            socket.emit('endRound');
        }
    } else {
        location.reload(); // اللاعب العادي يخرج
    }
}
