const http = require("http");
const express = require("express");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

app.get("/", (req, res) => {
    res.send("Serveur Beta 1 en ligne !");
});

wss.on("connection", (socket) => {
    console.log("Un site est connecté.");

    socket.on("message", (message) => {
        console.log("Message reçu :", message.toString());

        // Envoyer le message à tous les autres sites connectés
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message.toString());
            }
        });
    });

    socket.on("close", () => {
        console.log("Un site s'est déconnecté.");
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Serveur lancé sur le port ${PORT}`);
});