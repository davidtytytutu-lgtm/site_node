const http = require("http");
const express = require("express");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

app.get("/", (req, res) => {
    res.send("Serveur Beta 1 / Beta 2 opérationnel !");
});

wss.on("connection", (socket) => {
    console.log("Un client est connecté.");

    socket.on("message", (message) => {
        const text = message.toString();

        console.log("Message reçu :", text);

        // Envoyer le message à tous les clients connectés
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(text);
            }
        });
    });

    socket.on("close", () => {
        console.log("Un client s'est déconnecté.");
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Serveur lancé sur le port ${PORT}`);
});
