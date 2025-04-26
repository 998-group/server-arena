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

const players = {}; // { socket.id: { name, room, hp, score, position } }

const updateLeaderboard = (room) => {
  const sortedLeaderboard = Object.entries(players)
    .filter(([_, player]) => player.room === room)
    .map(([id, player]) => ({ id, name: player.name, score: player.score }))
    .sort((a, b) => b.score - a.score);
  io.to(room).emit("leaderboard_update", sortedLeaderboard);
};

const handleDamage = (socket, targetId, amount) => {
  const targetPlayer = players[targetId];
  if (targetPlayer) {
    targetPlayer.hp -= amount;
    if (targetPlayer.hp <= 0) {
      io.to(targetPlayer.room).emit("player_dead", targetId);
      delete players[targetId];
      players[socket.id].score += 100; // Award points for kill
      updateLeaderboard(targetPlayer.room);
    } else {
      io.to(targetPlayer.room).emit("player_damaged", {
        id: targetId,
        hp: targetPlayer.hp,
      });
      players[socket.id].score += 10; // Award points for damage
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
    players[socket.id] = {
      name,
      room,
      hp: 100,
      score: 0,
      position: { x: 400, y: 300 }, // Center of 800x600
    };
    console.log(`${name} joined room ${room}`);
    socket.to(room).emit("player_joined", { id: socket.id, name });

    const roomPlayers = Object.fromEntries(
      Object.entries(players).filter(([_, player]) => player.room === room)
    );
    io.to(socket.id).emit("player_positions", roomPlayers);
    updateLeaderboard(room);
  });

  socket.on("move", ({ position, room }) => {
    if (players[socket.id]) {
      players[socket.id].position = position;
      socket.to(room).emit("player_move", { id: socket.id, position });
      io.to(socket.id).emit("player_positions", {
        ...players,
        [socket.id]: players[socket.id],
      });
    }
  });

  socket.on("fire", ({ direction, room }) => {
    const shooter = players[socket.id];
    if (!shooter) return;

    const bullet = {
      x: shooter.position.x,
      y: shooter.position.y,
      direction,
      speed: 10,
    };

    socket.to(room).emit("bullet_fired", {
      id: socket.id,
      x: bullet.x,
      y: bullet.y,
      direction,
    });

    const interval = setInterval(() => {
      bullet.x += bullet.direction.x * bullet.speed;
      bullet.y += bullet.direction.y * bullet.speed;

      for (const [id, player] of Object.entries(players)) {
        if (player.room !== room || id === socket.id) continue;
        const dx = bullet.x - player.position.x;
        const dy = bullet.y - player.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 20) {
          handleDamage(socket, id, 10);
          clearInterval(interval);
          break;
        }
      }

      if (
        bullet.x < 0 ||
        bullet.x > 800 ||
        bullet.y < 0 ||
        bullet.y > 600
      ) {
        clearInterval(interval);
      }
    }, 16);
  });

  socket.on("disconnect", () => {
    const player = players[socket.id];
    if (player) {
      socket.to(player.room).emit("player_left", socket.id);
      console.log(`${player.name} left the game`);
      delete players[socket.id];
      updateLeaderboard(player.room);
    }
  });
});

server.listen(3001, () => {
  console.log("Server is running on port 3001");
});