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

// ... (الأكواد اللي فوق زي ما هي) ...

io.on('connection', (socket) => {
    socket.on('joinGame', ({ name, roomId }) => {
        if (!rooms[roomId]) {
            rooms[roomId] = { players: [], gameStarted: false, hostId: socket.id, guesserId: null };
        }

        // 1. منع دخول نفس الاسم مرتين في نفس الروم
        const nameExists = rooms[roomId].players.some(p => p.name === name);
        if (nameExists) {
            socket.emit('errorMsg', 'الاسم ده موجود فعلاً في الروم، اختار اسم تاني!');
            return;
        }

        socket.join(roomId);
        socket.roomId = roomId;
        rooms[roomId].players.push({ id: socket.id, name, role: '', confessed: false });
        updateRoom(roomId);
    });

     socket.on('startGame', () => {
        const room = rooms[socket.roomId];
        if (!room || room.players.length < 3) return;
        room.gameStarted = true;
        room.guesserId = null;
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

    socket.on('restartGame', () => {
    const room = rooms[socket.roomId];
    if (room && room.hostId === socket.id) {
        room.gameStarted = false;
        room.players.forEach(p => { p.confessed = false; p.role = ''; });
        io.to(socket.roomId).emit('gameRestarted');
        updateRoom(socket.roomId);
    }
});

      // ... (منطق startGame و sendWink) ...

   // ... (داخل io.on('connection', (socket) => { ...

socket.on('sendWink', (targetId) => {
    // إرسال أمر إظهار الزرار للضحية فقط
    io.to(targetId).emit('showConfessBtn');
    // إرسال أمر إظهار الزرار للغمازة (نفسه) فقط
    socket.emit('showConfessBtn');
    
    // تنبيه الضحية بالغمزة
    io.to(targetId).emit('youGotWinked');
});

// نظام غلق الروم التلقائي عند خروج الجميع
socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
        // إزالة اللاعب من القائمة
        rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
        
        // لو الروم بقت فاضية (طول المصفوفة = 0)
        if (rooms[roomId].players.length === 0) {
            console.log(`🗑️ الروم ${roomId} فضيت واتقفل بسلام.`);
            delete rooms[roomId]; // مسح الروم تماماً من الذاكرة
        } else {
            // لو لسه فيه ناس، نحدث القائمة عندهم
            updateRoom(roomId);
        }
    }
});


   socket.on('vibrateAll', (type) => {
    // نبعت لكل الناس إن اللاعب ده (الغمازة) جاله اهتزاز ونوع الاهتزاز إيه
    io.to(socket.roomId).emit('showVibration', { 
        id: socket.id, 
        type: type // 'soft' أو 'hard'
    });
});

    socket.on('confess', () => {
        const room = rooms[socket.roomId];
        const player = room.players?.find(p => p.id === socket.id);
        if (player && !player.confessed) {
            player.confessed = true;
            io.to(socket.roomId).emit('playerConfessed', { id: socket.id });
            checkGameLogic(socket.roomId);
        }
    });

    socket.on('makeGuess', ({ targetId }) => {
        const room = rooms[socket.roomId];
        const winker = room.players.find(p => p.role === 'غ');
        const isCorrect = room.players.find(p => p.id === targetId && p.role === 'غ');
        if (isCorrect) {
            io.to(socket.roomId).emit('gameOver', `🏆 كفو! قفشت الغمازة (${winker.name}). الأبرياء كسبوا!`);
        } else {
            io.to(socket.roomId).emit('gameOver', `🔥 تخمين غلط! الغمازة كان (${winker.name}). الغمازة كسب!`);
        }
        rooms[socket.roomId].gameStarted = false;
    });
     socket.on('gameOver', (msg) => {
        const room = rooms[socket.roomId];
        if (room) {
            // 3. تصفير حالة الغرفة عشان تبدأوا دور جديد
            room.gameStarted = false;
            room.guesserId = null;
            room.players.forEach(p => {
                p.confessed = false;
                p.role = '';
            });
            io.to(socket.roomId).emit('gameEnded', msg);
            updateRoom(socket.roomId);
        }
    });
});


function checkGameLogic(roomId) {
    const room = rooms[roomId];
    const active = room.players.filter(p => !p.confessed);
    if (active.length === 1) {
        if (active[0].role === 'غ') {
            io.to(roomId).emit('gameOver', `🔥 الغمازة ${active[0].name} خسر! غمز لكله الابرياء كسبوا.`);
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

server.listen(3000, () => console.log('🚀 السيرفر جاهز!'));