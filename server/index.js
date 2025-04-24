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

io.on("connection", (socket) => {
  console.log("Yangi foydalanuvchi:", socket.id);

  socket.on("join_room", ({ name, room }) => {
    socket.join(room);
    console.log(`${name} xonaga kirdi: ${room}`);
    socket.to(room).emit("player_joined", { id: socket.id, name });
    socket.on("move", ({ room, position }) => {
      socket.to(room).emit("player_move", { id: socket.id, position });
    });
  });

  socket.on("disconnect", () => {
    console.log("Foydalanuvchi chiqdi:", socket.id);
  });
});

server.listen(3001, () => {
  console.log("Server 3001-portda ishlamoqda");
});
