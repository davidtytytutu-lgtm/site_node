const http = require("http");
const express = require("express");
const WebSocket = require("ws");

const app = express();

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    next();
});

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

function broadcast(data, except = null) {
    const message = JSON.stringify(data);

    wss.clients.forEach(client => {
        if (
            client !== except &&
            client.readyState === WebSocket.OPEN
        ) {
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

            // Les autres utilisateurs sont prévenus,
            // mais pas celui qui vient d'arriver.
            broadcast({
                type: "join",
                username: username
            }, socket);

            sendUsers();

            return;
        }

        if (data.type === "chat") {

            const user = users.get(socket);

            if (!user) return;

            const message =
                String(data.message || "")
                .replace(/[<>]/g, "")
                .substring(0, 300);

            if (!message) return;

            if (
                message
                    .trim()
                    .toLowerCase()
                    .replace(/[.!?]+$/g, "") ===
                "i love you marley"
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

        if (!user) return;

        broadcast({
            type: "leave",
            username: user.name
        }, socket);

        users.delete(socket);

        sendUsers();

        console.log(`${user.name} est parti.`);
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Serveur lancé sur le port ${PORT}`);
});
