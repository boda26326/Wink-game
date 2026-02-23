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

const rooms = {};

// دالة توزيع الأدوار وبداية دور جديد
function startNewRound(roomId) {
    const room = rooms[roomId];
    if (!room || room.players.length < 3) return;

    room.gameStarted = true; // الباب اتقفل
    room.guesserId = null;

    // --- توزيع الأدوار بالأرقام ---
    const playerCount = room.players.length;
    let roles = ['غ']; // الغمازة ثابت
    for (let i = 1; i < playerCount; i++) {
        roles.push(i); // الباقي أرقام مسلسلة 1، 2، 3...
    }
    roles = roles.sort(() => Math.random() - 0.5); // لخبطة

    room.players.forEach((p, i) => {
        p.role = roles[i];
        p.confessed = false;
        
        io.to(p.id).emit('receiveRole', p.role);
        if (p.role === 'غ') {
            io.to(p.id).emit('showConfessBtn');
        }
    });

    io.to(roomId).emit('gameRestarted');
    updateRoom(roomId);
}

io.on('connection', (socket) => {
    socket.on('joinGame', ({ name, roomId }) => {
        
        let cleanRoomId = String(roomId).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).trim();

        if (!rooms[cleanRoomId]) {
            rooms[cleanRoomId] = { players: [], gameStarted: false, hostId: socket.id, guesserId: null };
        }
        const room = rooms[roomId];

        // 1. قفل الدخول لو الجيم بدأ
        if (room.gameStarted) {
            return socket.emit('errorMsg', 'عذراً، الدور بدأ بالفعل! استنى لما يخلص. ✋');
        }

        const nameExists = room.players.some(p => p.name === name);
        if (nameExists) return socket.emit('errorMsg', 'هذا الاسم موجود بالفعل.');

        socket.join(roomId);
        socket.roomId = roomId;
        room.players.push({ id: socket.id, name, role: '', confessed: false });
        updateRoom(roomId);
    });

    socket.on('startGame', () => {
        const roomId = socket.roomId;
        if (rooms[roomId]) startNewRound(roomId);
    });
    socket.on('endRound', () => {
        const roomId = socket.roomId;
        const room = rooms[roomId];
        if (room && room.hostId === socket.id) { // تأكيد إن اللي داس هو الهوست
            room.gameStarted = false; // فتح الباب لدخول ناس جديدة
            room.guesserId = null;

            // تصفير بيانات كل لاعب
            room.players.forEach(p => {
                p.role = '';
                p.confessed = false;
            });

            // نبلغ الكل إن الدور انتهى ورجعنا للانتظار
            io.to(roomId).emit('roundEnded'); 
            updateRoom(roomId);
        }
    });

    socket.on('sendWink', (targetId) => {
        io.to(targetId).emit('showConfessBtn');
        io.to(targetId).emit('youGotWinked');
    });

    socket.on('failedMinigame', (severity) => {
        io.to(socket.roomId).emit('playerVibrateEffect', { 
            winkerId: socket.id, 
            errorType: severity 
        });
    });

    socket.on('confess', () => {
        const room = rooms[socket.roomId];
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (player && !player.confessed) {
            player.confessed = true;
            io.to(socket.roomId).emit('playerConfessed', { id: socket.id });
            checkGameLogic(socket.roomId);
        }
    });

    socket.on('makeGuess', ({ targetId }) => {
        const room = rooms[socket.roomId];
        if (!room) return;
        const winker = room.players.find(p => p.role === 'غ');
        const isCorrect = (targetId === winker.id);
        const msg = isCorrect ? `🏆 كفو! قفشت الغمازة (${winker.name})` : `🔥 غلط! الغمازة كان (${winker.name})`;
        
        io.to(socket.roomId).emit('gameOver', msg);
        room.gameStarted = false; // فتحنا الباب
        updateRoom(socket.roomId);

        setTimeout(() => {
            if (rooms[socket.roomId]) startNewRound(socket.roomId);
        }, 5000);
    });

    socket.on('disconnect', () => {
        const roomId = socket.roomId;
        if (roomId && rooms[roomId]) {
            rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
            if (rooms[roomId].players.length === 0) delete rooms[roomId];
            else updateRoom(roomId);
        }
    });
});

function checkGameLogic(roomId) {
    const room = rooms[roomId];
    const active = room.players.filter(p => !p.confessed);
    
    if (active.length === 1) {
        if (active[0].role === 'غ') {
            io.to(roomId).emit('gameOver', `🔥 الغمازة ${active[0].name} خسر!`);
            room.gameStarted = false;
            updateRoom(roomId);
            // لا تنادي على startNewRound فوراً، استنى 5 ثواني
        } else {
            room.guesserId = active[0].id;
            io.to(active[0].id).emit('forceGuess');
            updateRoom(roomId);
        }
    }
}

function updateRoom(roomId) {
    const room = rooms[roomId];
    if (!room) return;
    room.players.forEach(p => {
        io.to(p.id).emit('updateUI', {
            players: room.players.map(x => ({ id: x.id, name: x.name, confessed: x.confessed })),
            gameStarted: room.gameStarted,
            isHost: room.hostId === p.id,
            guesserId: room.guesserId
        });
    });
}


server.listen(3000, () => console.log('🚀 Server is ready!'));
