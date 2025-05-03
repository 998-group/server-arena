const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const rooms = {}; // { room: { players: {}, bullets: [], started: false } }

const updateLeaderboard = (room) => {
  const sortedLeaderboard = Object.entries(rooms[room].players)
    .map(([id, player]) => ({ id, name: player.name, score: player.score }))
    .sort((a, b) => b.score - a.score);
  io.to(room).emit("leaderboard_update", sortedLeaderboard);
};

const handleDamage = (socket, targetId, amount) => {
  const room = rooms[players[targetId]?.room];
  const targetPlayer = room?.players[targetId];
  if (targetPlayer) {
    targetPlayer.hp -= amount;
    if (targetPlayer.hp <= 0) {
      io.to(room.name).emit("player_dead", targetId);
      delete room.players[targetId];
      rooms[socket.id].score += 100; // Award points for kill
      updateLeaderboard(room.name);
    } else {
      io.to(room.name).emit("player_damaged", {
        id: targetId,
        hp: targetPlayer.hp,
      });
      rooms[socket.id].score += 10; // Award points for damage
    }
  }
};

const assignRoles = (room) => {
  const playerIds = Object.keys(rooms[room].players);
  if (playerIds.length >= 2) {
    // Tasodifiy o‘yinchi tanlash
    const randomIndex = Math.floor(Math.random() * playerIds.length);
    const redPlayerId = playerIds[randomIndex];
    const bluePlayerId = playerIds.find((id) => id !== redPlayerId) || playerIds[(randomIndex + 1) % playerIds.length];

    rooms[room].players[redPlayerId].role = "red";
    rooms[room].players[bluePlayerId].role = "blue";

    io.to(room).emit("roles_assigned", {
      redPlayer: redPlayerId,
      bluePlayer: bluePlayerId,
    });
  }
};

const checkCollision = (room) => {
  const players = rooms[room].players;
  const playerIds = Object.keys(players);
  for (const id of playerIds) {
    if (players[id].role === "red") {
      for (const targetId of playerIds) {
        if (players[targetId].role === "blue" && id !== targetId) {
          const dx = players[id].position.x - players[targetId].position.x;
          const dy = players[id].position.y - players[targetId].position.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < 20) {
            // Ko‘k o‘yinchi uchun o‘yin tugadi
            io.to(targetId).emit("game_over", { message: "Qizil o‘yinchi sizga tegdi!" });
            players[id].score += 1; // Qizil o‘yinchi uchun +1 score
            updateLeaderboard(room);
            break;
          }
        }
      }
    }
  }
};

io.on("connection", (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on("join_room", ({ name, room }) => {
    if (
      typeof name !== "string" ||
      name.length > 20 ||
      typeof room !== "string" ||
      room.length > 20
    ) {
      socket.emit("error", { message: "Invalid name or room" });
      return;
    }

    socket.join(room);
    if (!rooms[room]) {
      rooms[room] = { players: {}, bullets: [], started: false };
    }
    rooms[room].players[socket.id] = {
      name,
      room,
      hp: 100,
      score: 0,
      position: { x: 400, y: 300 },
      role: null,
    };
    console.log(`${name} joined room ${room}`);
    socket.to(room).emit("player_joined", { id: socket.id, name });

    io.to(socket.id).emit("player_positions", rooms[room].players);
    updateLeaderboard(room);

    // O‘yinchilar sonini tekshirish va o‘yinni boshlash
    if (Object.keys(rooms[room].players).length >= 2 && !rooms[room].started) {
      rooms[room].started = true;
      io.to(room).emit("game_start", { message: "O‘yin boshlandi!" });
      assignRoles(room);
    }
  });

  socket.on("move", ({ position, room }) => {
    const player = rooms[room]?.players[socket.id];
    if (!player) return;

    // Pozitsiyani tekshirish
    if (
      position.x >= 0 &&
      position.x <= 800 &&
      position.y >= 0 &&
      position.y <= 600 &&
      Math.abs(position.x - player.position.x) <= 5 &&
      Math.abs(position.y - player.position.y) <= 5
    ) {
      player.position = position;
      io.to(room).emit("player_move", { id: socket.id, position });
      checkCollision(room); // Harakatdan keyin teginishni tekshirish
    } else {
      socket.emit("error", { message: "Invalid movement" });
    }
  });

  socket.on("fire", ({ direction, room }) => {
    const shooter = rooms[room]?.players[socket.id];
    if (!shooter) return;

    const bullet = {
      shooterId: socket.id,
      bulletId: `${socket.id}-${Date.now()}`,
      x: shooter.position.x,
      y: shooter.position.y,
      direction,
      speed: 10,
    };

    rooms[room].bullets.push(bullet);
    io.to(room).emit("bullet_fired", {
      id: socket.id,
      bulletId: bullet.bulletId,
      x: bullet.x,
      y: bullet.y,
      direction,
    });
  });

  socket.on("reset_player", ({ room }) => {
    const player = rooms[room]?.players[socket.id];
    if (player) {
      player.hp = 100;
      player.position = { x: 400, y: 300 };
      io.to(room).emit("player_reset", { id: socket.id, hp: player.hp, position: player.position });
      updateLeaderboard(room);
    }
  });

  socket.on("disconnect", () => {
    for (const room in rooms) {
      const player = rooms[room].players[socket.id];
      if (player) {
        socket.to(room).emit("player_left", socket.id);
        console.log(`${player.name} left the game`);
        delete rooms[room].players[socket.id];
        updateLeaderboard(room);
        if (Object.keys(rooms[room].players).length < 2) {
          rooms[room].started = false;
          io.to(room).emit("game_stop", { message: "O‘yinchilar yetarli emas, o‘yin to‘xtadi." });
        }
        if (Object.keys(rooms[room].players).length === 0) {
          delete rooms[room];
        }
        break;
      }
    }
  });
});

// O‘qlar uchun umumiy o‘yin tsikli
setInterval(() => {
  for (const room in rooms) {
    const roomData = rooms[room];
    roomData.bullets = roomData.bullets.filter((bullet) => {
      bullet.x += bullet.direction.x * bullet.speed;
      bullet.y += bullet.direction.y * bullet.speed;

      for (const [id, player] of Object.entries(roomData.players)) {
        if (id === bullet.shooterId) continue;
        const dx = bullet.x - player.position.x;
        const dy = bullet.y - player.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 20) {
          handleDamage(io.sockets.sockets.get(bullet.shooterId), id, 10);
          return false; // O‘qni o‘chirish
        }
      }

      return (
        bullet.x >= 0 &&
        bullet.x <= 800 &&
        bullet.y >= 0 &&
        bullet.y <= 600
      );
    });

    io.to(room).emit("bullet_positions", roomData.bullets);
  }
}, 16);

server.listen(3001, () => {
  console.log("Server is running on port 3001");
});