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

const players = {}; // { socket.id: { name, room, hp } }

io.on("connection", (socket) => {
  socket.on("join_room", ({ name, room }) => {
    socket.join(room);
    players[socket.id] = { name, room, hp: 100 };
    socket.to(room).emit("player_joined", { id: socket.id, name });
  });

  socket.on("move", ({ room, position }) => {
    socket.to(room).emit("player_move", { id: socket.id, position });
  });

  socket.on("attack", ({ room }) => {
    socket.to(room).emit("player_attacked", { id: socket.id });
  });

  socket.on("damage", ({ targetId, amount }) => {
    if (players[targetId]) {
      players[targetId].hp -= amount;
      if (players[targetId].hp <= 0) {
        io.to(players[targetId].room).emit("player_dead", targetId);
        delete players[targetId];
      } else {
        io.to(players[targetId].room).emit("player_damaged", {
          id: targetId,
          hp: players[targetId].hp,
        });
      }
    }
  });

  socket.on("disconnect", () => {
    const player = players[socket.id];
    if (player) {
      socket.to(player.room).emit("player_left", socket.id);
      delete players[socket.id];
    }
  });
});
server.listen(3001, () => {
  console.log("Server 3001-portda ishlamoqda");
});
