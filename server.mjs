import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.static(join(__dirname, 'public')));

// قاعدة بيانات الغرف
const rooms = {};

// دالة لتحديث قائمة الغرف عند الجميع
function broadcastRooms() {
    const list = Object.keys(rooms).map(id => ({
        id: id,
        hostName: rooms[id].players.find(p => p.id === rooms[id].hostId)?.name || "غرفة",
        count: rooms[id].players.length,
        type: rooms[id].type,
        gameStarted: rooms[id].gameStarted
    }));
    io.emit('roomsUpdate', list);
}

io.on('connection', (socket) => {
    console.log('لاعب اتصل:', socket.id);
    broadcastRooms();

    // دخول أو إنشاء غرفة
    socket.on('joinGame', ({ name, roomId, password, type }) => {
        let cleanId = String(roomId).trim();
        
        // التحقق من الباسورد لو الغرفة خاصة
        if (rooms[cleanId] && rooms[cleanId].type === 'private' && rooms[cleanId].password !== password) {
            return socket.emit('errorMsg', 'كلمة السر غلط! 🔐');
        }

        // إنشاء الغرفة لو مش موجودة
        if (!rooms[cleanId]) {
            rooms[cleanId] = { 
                players: [], 
                gameStarted: false, 
                hostId: socket.id, 
                type: type || 'public', 
                password: password || "" 
            };
        }

        const room = rooms[cleanId];
        if (room.gameStarted) return socket.emit('errorMsg', 'الدور بدأ بالفعل، استنى يخلص! ⏳');
        if (room.players.length >= 12) return socket.emit('errorMsg', 'الغرفة مليانة! 👥');

        socket.join(cleanId);
        socket.roomId = cleanId;
        
        // إضافة اللاعب
        room.players.push({ 
            id: socket.id, 
            name: name || "لاعب مجهول", 
            role: '', 
            confessed: false 
        });

        updateRoom(cleanId);
        broadcastRooms();
    });

    // بدء اللعبة (للهوست فقط)
    socket.on('startGame', () => {
        const room = rooms[socket.roomId];
        if (!room || room.hostId !== socket.id) return;
        if (room.players.length < 3) return socket.emit('errorMsg', 'لازم 3 لاعيبة على الأقل! 👶');

        room.gameStarted = true;
        
        // توزيع الأدوار (غمازة واحد والباقي محققين بالأرقام)
        let roles = ['غ'];
        for (let i = 1; i < room.players.length; i++) roles.push(i);
        roles = roles.sort(() => Math.random() - 0.5);

        room.players.forEach((p, i) => { 
            p.role = roles[i]; 
            p.confessed = false; 
            io.to(p.id).emit('receiveRole', p.role); 
        });

        updateRoom(socket.roomId);
    });

    // إرسال غمزة
    socket.on('sendWink', (targetId) => {
        io.to(targetId).emit('youGotWinked');
    });

    // الاعتراف (أنا اتغمزلي)
    socket.on('confess', () => {
        const room = rooms[socket.roomId];
        if (room) {
            const p = room.players.find(x => x.id === socket.id);
            if (p && !p.confessed) { 
                p.confessed = true; 
                io.to(socket.roomId).emit('showBubble', { id: socket.id, msg: "أنا اتغمزلي!😵" });
                checkLogic(socket.roomId); 
            }
        }
    });

    // التخمين النهائي (آخر لاعب متبقي)
    socket.on('finalGuess', (guessedId) => {
        const room = rooms[socket.roomId];
        if (!room) return;

        const killer = room.players.find(p => p.role === 'غ');
        if (guessedId === killer.id) {
            io.to(socket.roomId).emit('gameOver', `🔥 فوز ساحق! المحقق خمن صح، الغمازة كان: ${killer.name}`);
        } else {
            io.to(socket.roomId).emit('gameOver', `💀 خسرت! التخمين غلط. الغمازة الحقيقي هو: ${killer.name}`);
        }
        
        room.gameStarted = false;
        room.players.forEach(p => { p.role = ''; p.confessed = false; });
        updateRoom(socket.roomId);
    });

    // اهتزاز المربع عند فشل الميني جيم
    socket.on('failedMinigame', () => {
        io.to(socket.roomId).emit('visualShake', socket.id);
    });

    // إنهاء الدور إجبارياً
    socket.on('forceEndRound', () => {
        const room = rooms[socket.roomId];
        if (room && room.hostId === socket.id) {
            room.gameStarted = false;
            io.to(socket.roomId).emit('gameOver', 'تم إنهاء الدور بواسطة الهوست.');
            updateRoom(socket.roomId);
        }
    });

    // عند الخروج
    socket.on('disconnect', () => {
        const rId = socket.roomId;
        if (rId && rooms[rId]) {
            rooms[rId].players = rooms[rId].players.filter(p => p.id !== socket.id);
            
            if (rooms[rId].players.length === 0) {
                delete rooms[rId];
            } else {
                // لو الهوست خرج، انقل التاج للي بعده
                if (rooms[rId].hostId === socket.id) {
                    rooms[rId].hostId = rooms[rId].players[0].id;
                }
                // لو اللعبة شغالة وحد خرج، ننهي الدور عشان ميبوظش
                if (rooms[rId].gameStarted) {
                    rooms[rId].gameStarted = false;
                    io.to(rId).emit('gameOver', 'لاعب خرج وبوظ الدور! 🏃‍♂️');
                }
                updateRoom(rId);
            }
            broadcastRooms();
        }
    });
});

// منطق فحص انتهاء الغمزات وبدء التخمين
function checkLogic(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    const activePlayers = room.players.filter(p => !p.confessed);
    
    // لو متبقاش غير واحد بس (المحقق الأخير ضد الغمازة المستخبي)
    if (activePlayers.length === 1) {
        const lastPlayer = activePlayers[0];
        io.to(lastPlayer.id).emit('startFinalGuess');
        io.to(roomId).emit('statusUpdate', `الآن ${lastPlayer.name} بيخمن مين الغمازة...`);
    }
}

// تحديث واجهة كل لاعب في الغرفة
function updateRoom(roomId) {
    const room = rooms[roomId];
    if (room) {
        room.players.forEach(p => {
            io.to(p.id).emit('updateUI', {
                players: room.players.map(x => ({ 
                    id: x.id, 
                    name: x.name, 
                    confessed: x.confessed 
                })),
                isHost: room.hostId === p.id,
                gameStarted: room.gameStarted
            });
        });
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
    ====================================
    🚀 Server is running on port ${PORT}
    😉 Wink Game Logic: Enabled
    🎮 Ready for players!
    ====================================
    `);
});
