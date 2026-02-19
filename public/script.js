const socket = io();
let myRole = "", isForcedGuessMode = false, selectedId = null;
let gameTimer;

function join() {
    const name = document.getElementById('username').value;
    const room = document.getElementById('room-id').value;
    if (name && room) socket.emit('joinGame', { name, roomId: room });
}
function startFullScreen() {
    const elem = document.documentElement;
    
    // محاولة الدخول لوضع ملء الشاشة
    try {
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
        }
    } catch (err) {
        console.log("Fullscreen request failed, but we continue...");
    }

    // محاولة قفل الاتجاه بالعرض
    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(e => console.log("Orientation lock ignored"));
    }

    // هنا الكود المهم اللي بيكمل عملية الدخول
    joinRoom(); // اتأكد إن دي الدالة اللي بتبدأ اللعبة فعلياً عندك
}

// أضف استقبال رسالة الخطأ في بداية الملف
socket.on('errorMsg', (msg) => {
    alert(msg);
});

// استقبال الغمزة (هنا الزرار بيظهر للي اتغمزله بس)
// استقبال الغمزة (للشخص اللي اتغمزله)
socket.on('youGotWinked', () => {
    document.getElementById('wink-alert').style.display = 'block';
    document.getElementById('confess-btn').style.display = 'block'; // يظهر للي اتغمزله بس
    setTimeout(() => document.getElementById('wink-alert').style.display = 'none', 3000);
});

// استقبال تأكيد الغمزة (للغمازة فقط)
socket.on('winkSentSuccess', () => {
    document.getElementById('confess-btn').style.display = 'block'; // يظهر للغمازة عشان يقدر يعترف لو اتكشف
});

// عند الاعتراف (رمي الورقة وظهور الرسالة)
socket.on('playerConfessed', (data) => {
    const box = document.getElementById(`p-${data.id}`);
    if (box) {
        box.classList.add('confessed');

        // 1. فقاعة الكلام
        const msg = document.createElement('div');
        msg.className = 'bubble-msg';
        msg.innerText = 'أنا اتغمزلي! 😵';
        box.appendChild(msg);

        // 2. إنشاء الورقة في مكان اللاعب
        const card = document.createElement('div');
        card.className = 'dead-card';
        card.innerHTML = '✕'; 
        
        // تبدأ من نفس مكان اللاعب
        card.style.left = box.style.left;
        card.style.top = box.style.top;
        document.getElementById('game-view').appendChild(card);

        // 3. حركة الرمي (تعديل النسبة لتقترب من المركز)
        setTimeout(() => {
            const container = document.getElementById('game-view');
            const centerX = container.offsetWidth / 2;
            const centerY = container.offsetHeight / 2;
            
            const playerX = parseFloat(box.style.left);
            const playerY = parseFloat(box.style.top);

            // النسبة (0.8 تعني أن الورقة ستقطع 80% من المسافة للمركز)
            // لو عايزها في السنتر بالظبط خلي الـ 0.8 دي تكون 1.0
            const ratio = 0.5; 

            const cardX = playerX + (centerX - playerX) * ratio;
            const cardY = playerY + (centerY - playerY) * ratio;

            card.style.left = `${cardX}px`;
            card.style.top = `${cardY}px`;
            
            // دوران عشوائي
            card.style.transform = `translate(-50%, -50%) rotate(${Math.random() * 90 - 45}deg)`;
        }, 50);

        // مسح الفقاعة فقط
        setTimeout(() => {
            if (msg) msg.remove();
        }, 3000);
    }
});


// عند نهاية الجيم
socket.on('gameOver', (msg) => {
    alert(msg);
    // تنظيف كل الورق المرمي
    document.querySelectorAll('.dead-card').forEach(card => card.remove());
    // تنظيف كل فقاعات الكلام
    document.querySelectorAll('.bubble-msg').forEach(msg => msg.remove());
    // إعادة تحميل الصفحة أو تصفير الواجهة
    location.reload(); 
});

// وظيفة الاعتراف
function confess() {
    socket.emit('confess');
    // الزرار يختفي بعد ما تدوس عشان متبعتش اعتراف مكرر
    document.getElementById('confess-btn').style.display = 'none';
}

socket.on('updateUI', (data) => {
    document.getElementById('setup').style.display = 'none';
    document.getElementById('game-area').style.display = 'flex';
    document.getElementById('host-controls').style.display = data.isHost ? 'block' : 'none';

    if (data.guesserId === socket.id) {
        isForcedGuessMode = true;
        document.getElementById('status').innerHTML = '<span class="guess-alert">🚨 خمن مين الغمازة!</span>';
    }

    const grid = document.getElementById('players-grid');
    grid.innerHTML = '';

    const container = document.getElementById('game-view');
    // نستخدمgetClientBoundingRect لضمان دقة السنتر
    const rect = container.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const radius = 220; 

    data.players.forEach((p, i) => {
        const angle = (i * 2 * Math.PI) / data.players.length; 
        
        const div = document.createElement('div');
        div.className = `player-box ${p.confessed ? 'confessed' : ''}`;
        div.id = `p-${p.id}`;
        
        // حساب المكان
        const x = centerX + radius * Math.cos(angle) - 50; 
        const y = centerY + radius * Math.sin(angle) - 40; 

        div.style.left = `${x}px`;
        div.style.top = `${y}px`;
        div.innerHTML = `<span>${p.id === socket.id ? "أنت" : p.name}</span>`;

        // تفعيل الضغط في التخمين
        if (isForcedGuessMode) {
            div.style.pointerEvents = 'auto';
            div.style.opacity = '1';
        }

        // الأهم: دالة الـ click
        div.onclick = (e) => {
            e.stopPropagation(); // منع تداخل الكليكات
            if (p.id === socket.id) return;
            if (p.confessed && !isForcedGuessMode) return;

            console.log("تم اختيار اللاعب: " + p.name); // للتأكد في الكونسول

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
});

socket.on('receiveRole', (role) => {
    myRole = role;
    document.getElementById('card-value').innerText = role;

    const confessBtn = document.getElementById('confess-btn');
    
    if (role === 'غ') {
        // لو أنا الغمازة، الزرار يظهرلي من أول ثانية ويفضل موجود
        confessBtn.style.display = 'block';
    } else {
        // لو أنا بريء، الزرار يفضل مخفي لحد ما حد يغمزلي
        confessBtn.style.display = 'none';
    }
});

// إظهار زرار الاعتراف لأشخاص محددين فقط
// استقبال أمر إظهار الزرار (بيوصل فقط للمستهدفين من السيرفر)
socket.on('showConfessBtn', () => {
    // الزرار يظهر للضحية (الغمازة أصلاً ظاهر عنده من الأول)
    document.getElementById('confess-btn').style.display = 'block';
});

// عند بداية أي دور جديد، لازم نتأكد إن الزرار مخفي عن الكل في البداية
socket.on('receiveRole', (role) => {
    myRole = role;
    document.getElementById('card-value').innerText = role;

    const confessBtn = document.getElementById('confess-btn');
    
    if (role === 'غ') {
        // لو أنا الغمازة، الزرار يظهرلي من أول ثانية ويفضل موجود
        confessBtn.style.display = 'block';
    } else {
        // لو أنا بريء، الزرار يفضل مخفي لحد ما حد يغمزلي
        confessBtn.style.display = 'none';
    }
});
// دالة الخروج للهوست
function handleExit() {
    if (isHost) { // لو أنت الهوست تظهر لك الخيارات
        const choice = confirm("يا هوست: عايز تعيد الدور (OK) ولا تقفل الروم وتخرج (Cancel)؟");
        if (choice) {
            socket.emit('restartGame');
        } else {
            location.reload(); // خروج نهائي
        }
    } else {
        location.reload(); // لو لاعب عادي يخرج فوراً
    }
}

// تصفير الحالة عند إعادة الدور
// 2. تنظيف الملعب عند إعادة الدور (Restart) بواسطة الهوست
socket.on('gameRestarted', () => {
    alert("الهوست أعاد الدور! استعدوا...");
    
    // إخفاء زرار الاعتراف
    document.getElementById('confess-btn').style.display = 'none';
    
    // أهم جزء: مسح كل الورق اللي في النص
    const allCards = document.querySelectorAll('.dead-card');
    allCards.forEach(card => {
        card.style.opacity = '0'; // حركة اختفاء ناعمة
        setTimeout(() => card.remove(), 500);
    });

    // مسح الفقاعات
    document.querySelectorAll('.bubble-msg').forEach(m => m.remove());
    
    // إزالة حالة "ميت" من اللاعبين
    document.querySelectorAll('.player-box').forEach(box => {
        box.classList.remove('confessed');
        box.style.opacity = '1';
        box.style.pointerEvents = 'auto';
    });
});


function triggerMinigame() {
    const emojis = ["🍎", "⭐", "⚽", "🐱", "🚀", "💎"];
    const selectedEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    const count = Math.floor(Math.random() * 5) + 2; // أعداد صغيرة من 2 لـ 6 عشان السرعة
    const displayString = selectedEmoji.repeat(count);
    
    const overlay = document.getElementById('minigame-overlay');
    const input = document.getElementById('minigame-input');
    const timerText = document.createElement('div'); // لعرض الثواني
    
    overlay.style.display = 'flex';
    document.getElementById('mini-text').innerText = `كم عدد الـ ${selectedEmoji}؟`;
    document.querySelector('.mini-box p').innerText = displayString;
    
    input.value = "";
    input.focus();

    // تشغيل التايمر (5 ثواني)
    let timeLeft = 3;
    input.placeholder = `الوقت: ${timeLeft}s`;
    
    gameTimer = setInterval(() => {
        timeLeft--;
        input.placeholder = `الوقت: ${timeLeft}s`;
        if (timeLeft <= 0) {
            clearInterval(gameTimer);
            handleMinigameFailure('soft'); // اهتزاز بسيط لو الوقت خلص
        }
    }, 1000);

    input.onkeyup = (e) => {
        if (e.key === "Enter") {
            clearInterval(gameTimer);
            if (parseInt(input.value) === count) {
                socket.emit('sendWink', selectedId);
                overlay.style.display = 'none';
            } else {
                handleMinigameFailure('hard'); // اهتزاز قوي لو الإجابة غلط
            }
        }
    };
}

function handleMinigameFailure(type) {
    socket.emit('vibrateAll', type); // إرسال نوع الاهتزاز للسيرفر
    document.getElementById('minigame-overlay').style.display = 'none';
    document.getElementById('wink-btn').style.display = 'none';
}

socket.on('youGotWinked', () => {
    const alert = document.getElementById('wink-alert');
    alert.style.display = 'block';
    setTimeout(() => alert.style.display = 'none', 3000);
});

socket.on('forceGuess', () => { isForcedGuessMode = true; });
socket.on('gameOver', (msg) => { alert(msg); location.reload(); });
socket.on('gameRestarted', () => { 
    isForcedGuessMode = false; 
    document.querySelectorAll('.dead-card').forEach(c => c.remove());
});
