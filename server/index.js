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
const leaderboard = []; // To keep track of player scores

// Helper function to update leaderboard
const updateLeaderboard = () => {
  // Sort leaderboard by score
  const sortedLeaderboard = Object.entries(players)
    .map(([id, player]) => ({ id, name: player.name, score: player.score }))
    .sort((a, b) => b.score - a.score);
  io.emit("leaderboard_update", sortedLeaderboard);
};

// Function to handle player damage
const handleDamage = (targetId, amount) => {
  const targetPlayer = players[targetId];
  if (targetPlayer) {
    targetPlayer.hp -= amount;
    if (targetPlayer.hp <= 0) {
      io.to(targetPlayer.room).emit("player_dead", targetId);
      // Player died, remove them from the game
      delete players[targetId];
      updateLeaderboard();
    } else {
      io.to(targetPlayer.room).emit("player_damaged", {
        id: targetId,
        hp: targetPlayer.hp,
      });
    }
  }
};

io.on("connection", (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // When player joins a room
  socket.on("join_room", ({ name, room }) => {
    socket.join(room);
    players[socket.id] = {
      name,
      room,
      hp: 100,
      score: 0,
      position: { x: 0, y: 0 },
    };
    console.log(`${name} joined room ${room}`);
    socket.to(room).emit("player_joined", { id: socket.id, name });

    // Emit the current player list to the new player
    io.to(socket.id).emit("player_positions", players);
    updateLeaderboard();
  });

  // Handle player movement
  socket.on("move", ({ position, room }) => {
    if (players[socket.id]) {
      players[socket.id].position = position;
      socket.to(room).emit("player_move", { id: socket.id, position });
    }
  });

  // Handle shooting (fire)
  socket.on("fire", ({ direction, room }) => {
    // Calculate bullet movement, here we're simply emitting the shot in the direction
    socket.to(room).emit("bullet_fired", { id: socket.id, direction });
  });

  // Handle player attack
  socket.on("attack", ({ room }) => {
    socket.to(room).emit("player_attacked", { id: socket.id });
  });

  // Handle damage (if bullet hits)
  socket.on("damage", ({ targetId, amount }) => {
    handleDamage(targetId, amount);
  });

  // Handle player disconnect
  socket.on("disconnect", () => {
    const player = players[socket.id];
    if (player) {
      socket.to(player.room).emit("player_left", socket.id);
      console.log(`${player.name} left the game`);
      delete players[socket.id];
      updateLeaderboard();
    }
  });
});

server.listen(3001, () => {
  console.log("Server is running on port 3001");
});
