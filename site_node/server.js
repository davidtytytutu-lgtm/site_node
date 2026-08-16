const http = require("http");
const express = require("express");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

const users = new Map();

const repoFiles = [
    "site_node/",
    "site_node/server.js",
    "site_node/package.json",
    "site_node/package-lock.json"
];

app.get("/", (req, res) => {
    res.send("Terminal server online.");
});

app.get("/api/files", (req, res) => {
    res.json(repoFiles);
});

function broadcast(data) {
    const message = JSON.stringify(data);

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function sendUsers() {
    broadcast({
        type: "users",
        users: [...users.values()].map(user => user.name)
    });
}

wss.on("connection", socket => {

    console.log("Nouvelle connexion");

    socket.on("message", raw => {

        let data;

        try {
            data = JSON.parse(raw.toString());
        } catch {
            return;
        }

        // Connexion utilisateur
        if (data.type === "join") {

            const username =
                String(data.username || "anonymous")
                .replace(/[<>]/g, "")
                .substring(0, 20);

            users.set(socket, {
                name: username
            });

            socket.send(JSON.stringify({
                type: "system",
                message: `Bienvenue ${username}.`
            }));

            broadcast({
                type: "join",
                username: username
            });

            sendUsers();

            return;
        }

        // Message du chat
        if (data.type === "chat") {

            const user = users.get(socket);

            if (!user) return;

            const message =
                String(data.message || "")
                .replace(/[<>]/g, "")
                .substring(0, 300);

            if (!message) return;

            // Easter egg
            if (
                message
                .trim()
                .toLowerCase()
                .replace(/[.!?]+$/g, "") === "i love you marley"
            ) {
                broadcast({
                    type: "marley",
                    username: user.name
                });

                return;
            }

            broadcast({
                type: "chat",
                username: user.name,
                message: message
            });
        }
    });

    socket.on("close", () => {

        const user = users.get(socket);

        if (user) {

            broadcast({
                type: "leave",
                username: user.name
            });

            users.delete(socket);
            sendUsers();
        }

        console.log("Connexion fermée");
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Serveur lancé sur le port ${PORT}`);
});
