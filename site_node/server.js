const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();


/* =====================================================
   CORS
===================================================== */

app.use((req, res, next) => {

    res.setHeader(
        "Access-Control-Allow-Origin",
        "*"
    );

    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS"
    );

    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );

    if (req.method === "OPTIONS") {

        return res.sendStatus(204);

    }

    next();

});


/* =====================================================
   SERVER
===================================================== */

const server =
    http.createServer(app);

const wss =
    new WebSocket.Server({
        server
    });


/* =====================================================
   USERS
===================================================== */

const users =
    new Map();


/* =====================================================
   GITHUB CONFIG
===================================================== */

const GITHUB_TOKEN =
    process.env.GITHUB_TOKEN;

const GITHUB_OWNER =
    process.env.GITHUB_OWNER;

const GITHUB_REPO =
    process.env.GITHUB_REPO;

const GITHUB_BRANCH =
    process.env.GITHUB_BRANCH ||
    "main";

const MEDIA_FOLDER =
    "site_node/media";


/* =====================================================
   CHAT HISTORY CONFIG
===================================================== */

const CHAT_LOG_DIR =
    path.join(
        __dirname,
        "site_node/chat_logs"
    );


const CHAT_LOG_MAX_SIZE =
    10 * 1024 * 1024;


/* =====================================================
   CREATE CHAT LOG DIRECTORY
===================================================== */

try {

    if (
        !fs.existsSync(
            CHAT_LOG_DIR
        )
    ) {

        fs.mkdirSync(
            CHAT_LOG_DIR,
            {
                recursive: true
            }
        );

    }

} catch (error) {

    console.error(
        "Impossible de créer chat_logs:",
        error.message
    );

}


/* =====================================================
   UPLOAD CONFIG
===================================================== */

const MAX_FILE_SIZE =
    25 * 1024 * 1024;


const ALLOWED_TYPES = [

    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",

    "video/mp4",
    "video/webm",
    "video/quicktime"

];


const upload =
    multer({

        storage:
            multer.memoryStorage(),

        limits: {

            fileSize:
                MAX_FILE_SIZE

        },

        fileFilter:
            (req, file, callback) => {

                if (
                    ALLOWED_TYPES.includes(
                        file.mimetype
                    )
                ) {

                    callback(
                        null,
                        true
                    );

                } else {

                    callback(
                        new Error(
                            "Type de fichier non autorisé."
                        )
                    );

                }

            }

    });


/* =====================================================
   FILE LIST
===================================================== */

const repoFiles = [

    "site_node/",
    "site_node/server.js",
    "site_node/package.json",
    "site_node/package-lock.json",
    "site_node/media/"

];


/* =====================================================
   HOME
===================================================== */

app.get(
    "/",
    (req, res) => {

        res.send(
            "Terminal server online."
        );

    }
);


/* =====================================================
   DIR /S
===================================================== */

app.get(
    "/api/files",
    (req, res) => {

        res.json(
            repoFiles
        );

    }
);


/* =====================================================
   GITHUB CONFIG CHECK
===================================================== */

function githubConfigOK() {

    return Boolean(

        GITHUB_TOKEN &&
        GITHUB_OWNER &&
        GITHUB_REPO

    );

}


/* =====================================================
   GITHUB API HELPER
===================================================== */

async function githubRequest(
    apiPath,
    options = {}
) {

    if (
        !githubConfigOK()
    ) {

        throw new Error(
            "Configuration GitHub incomplète. Vérifie GITHUB_TOKEN, GITHUB_OWNER et GITHUB_REPO dans Render."
        );

    }


    const response =
        await fetch(
            `https://api.github.com${apiPath}`,
            {

                ...options,

                headers: {

                    "Accept":
                        "application/vnd.github+json",

                    "Authorization":
                        `Bearer ${GITHUB_TOKEN}`,

                    "X-GitHub-Api-Version":
                        "2022-11-28",

                    ...(options.headers || {})

                }

            }
        );


    const text =
        await response.text();


    let data;


    try {

        data =
            text
                ? JSON.parse(text)
                : {};

    } catch {

        data = {

            message:
                text ||
                "Réponse GitHub invalide."

        };

    }


    if (
        !response.ok
    ) {

        throw new Error(

            data.message ||
            `GitHub HTTP ${response.status}`

        );

    }


    return data;

}


/* =====================================================
   MEDIA LIST
===================================================== */

app.get(
    "/api/media",
    async (req, res) => {

        try {

            if (
                !githubConfigOK()
            ) {

                return res.status(500).json({

                    error:
                        "Configuration GitHub manquante sur le serveur."

                });

            }


            const data =
                await githubRequest(

                    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${MEDIA_FOLDER}?ref=${encodeURIComponent(GITHUB_BRANCH)}`

                );


            if (
                !Array.isArray(data)
            ) {

                return res.json([]);

            }


            const files =
                data
                    .filter(
                        file =>
                            file.type ===
                            "file"
                    )
                    .map(
                        file => ({

                            name:
                                file.name,

                            path:
                                file.path,

                            size:
                                file.size,

                            url:
                                file.download_url,

                            html_url:
                                file.html_url

                        })
                    );


            res.json(
                files
            );

        } catch (error) {

            console.error(
                "Erreur récupération médias:",
                error.message
            );


            res.status(500).json({

                error:
                    error.message ||
                    "Impossible de récupérer les médias."

            });

        }

    }
);


/* =====================================================
   UPLOAD MEDIA
===================================================== */

app.post(
    "/api/upload",
    upload.single("file"),
    async (req, res) => {

        try {

            if (
                !req.file
            ) {

                return res.status(400).json({

                    error:
                        "Aucun fichier envoyé."

                });

            }


            if (
                !githubConfigOK()
            ) {

                return res.status(500).json({

                    error:
                        "Configuration GitHub manquante sur le serveur."

                });

            }


            /* =========================
               USERNAME
            ========================= */

            const username =
                String(
                    req.body.username ||
                    "anonymous"
                )
                    .replace(
                        /[^a-zA-Z0-9_-]/g,
                        "_"
                    )
                    .substring(
                        0,
                        20
                    );


            /* =========================
               NOM PERSONNALISÉ
            ========================= */

            let customName =
                String(
                    req.body.customName ||
                    ""
                )
                    .trim();


            /*
             * Si aucun nom personnalisé
             * n'est fourni, on utilise
             * le nom original.
             */

            if (
                !customName
            ) {

                customName =
                    req.file.originalname;

            }


            /*
             * Nettoyage du nom.
             */

            customName =
                customName
                    .replace(
                        /[<>:"/\\|?*\x00-\x1F]/g,
                        "_"
                    )
                    .replace(
                        /\s+/g,
                        "_"
                    )
                    .substring(
                        0,
                        100
                    );


            if (
                !customName
            ) {

                customName =
                    "file";

            }


            /* =========================
               EXTENSION
            ========================= */

            const originalExtension =
                path.extname(
                    req.file.originalname
                );


            let finalName =
                customName;


            /*
             * Si l'utilisateur a entré
             * "mon_video", on ajoute
             * automatiquement ".mp4".
             */

            if (
                !path.extname(
                    finalName
                )
            ) {

                finalName +=
                    originalExtension;

            }


            /* =========================
               TIMESTAMP
            ========================= */

            const timestamp =
                Date.now();


            const filename =
                `${timestamp}_${username}_${finalName}`;


            const githubPath =
                `${MEDIA_FOLDER}/${filename}`;


            /* =========================
               BUFFER -> BASE64
            ========================= */

            const content =
                req.file.buffer.toString(
                    "base64"
                );


            /* =========================
               GITHUB UPLOAD
            ========================= */

            const result =
                await githubRequest(

                    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubPath}`,

                    {

                        method:
                            "PUT",

                        headers: {

                            "Content-Type":
                                "application/json"

                        },

                        body:
                            JSON.stringify({

                                message:
                                    `Upload media: ${filename}`,

                                content:
                                    content,

                                branch:
                                    GITHUB_BRANCH

                            })

                    }

                );


            /* =========================
               RAW URL
            ========================= */

            const rawUrl =
                `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${githubPath}`;


            console.log(
                `Upload réussi: ${filename}`
            );


            /* =========================
               BROADCAST
            ========================= */

            broadcast({

                type:
                    "media",

                username:
                    username,

                name:
                    filename,

                url:
                    rawUrl,

                size:
                    req.file.size,

                mimetype:
                    req.file.mimetype

            });


            /* =========================
               RESPONSE
            ========================= */

            res.json({

                success:
                    true,

                name:
                    filename,

                url:
                    rawUrl,

                size:
                    req.file.size,

                mimetype:
                    req.file.mimetype,

                github:
                    result.content?.html_url ||
                    null

            });

        } catch (error) {

            console.error(
                "Erreur upload:",
                error.message
            );


            res.status(500).json({

                error:
                    error.message ||
                    "Erreur pendant l'upload."

            });

        }

    }
);


/* =====================================================
   CHAT LOG - GET FILES
===================================================== */

function getChatLogFiles() {

    try {

        return fs
            .readdirSync(
                CHAT_LOG_DIR
            )
            .filter(
                file =>
                    /^chat_\d+\.json$/.test(
                        file
                    )
            )
            .sort(
                (a, b) => {

                    const numberA =
                        parseInt(
                            a.match(
                                /\d+/
                            )[0]
                        );

                    const numberB =
                        parseInt(
                            b.match(
                                /\d+/
                            )[0]
                        );


                    return (
                        numberA -
                        numberB
                    );

                }
            );

    } catch {

        return [];

    }

}


/* =====================================================
   CHAT LOG - LAST FILE
===================================================== */

function getLastChatLog() {

    const files =
        getChatLogFiles();


    if (
        !files.length
    ) {

        return path.join(

            CHAT_LOG_DIR,

            "chat_0001.json"

        );

    }


    return path.join(

        CHAT_LOG_DIR,

        files[
            files.length - 1
        ]

    );

}


/* =====================================================
   CHAT LOG - SAVE
===================================================== */

function saveChatMessage(
    username,
    message
) {

    try {

        let filePath =
            getLastChatLog();


        let messages = [];


        /* =========================
           LECTURE
        ========================= */

        if (
            fs.existsSync(
                filePath
            )
        ) {

            try {

                const content =
                    fs.readFileSync(
                        filePath,
                        "utf8"
                    );


                if (
                    content.trim()
                ) {

                    messages =
                        JSON.parse(
                            content
                        );

                }

            } catch {

                messages = [];

            }

        }


        /* =========================
           NOUVEAU MESSAGE
        ========================= */

        const chatMessage = {

            username:
                username,

            message:
                message,

            timestamp:
                Date.now()

        };


        messages.push(
            chatMessage
        );


        const newContent =
            JSON.stringify(
                messages,
                null,
                2
            );


        const newSize =
            Buffer.byteLength(
                newContent,
                "utf8"
            );


        /* =========================
           NOUVEAU FICHIER
        ========================= */

        if (
            newSize >
            CHAT_LOG_MAX_SIZE
        ) {

            const files =
                getChatLogFiles();


            let nextNumber =
                1;


            if (
                files.length
            ) {

                nextNumber =
                    Math.max(
                        ...files.map(
                            file =>
                                parseInt(
                                    file.match(
                                        /\d+/
                                    )[0]
                                )
                        )
                    ) + 1;

            }


            filePath =
                path.join(

                    CHAT_LOG_DIR,

                    `chat_${String(
                        nextNumber
                    ).padStart(
                        4,
                        "0"
                    )}.json`

                );


            fs.writeFileSync(

                filePath,

                JSON.stringify(
                    [
                        chatMessage
                    ],
                    null,
                    2
                ),

                "utf8"

            );


            console.log(

                `Nouveau fichier de chat: ${path.basename(
                    filePath
                )}`

            );


            return;

        }


        /* =========================
           ÉCRITURE
        ========================= */

        fs.writeFileSync(

            filePath,

            newContent,

            "utf8"

        );

    } catch (error) {

        console.error(

            "Erreur sauvegarde chat:",
            error.message

        );

    }

}


/* =====================================================
   CHAT HISTORY - LOAD
===================================================== */

function loadChatHistory(
    limit = 100
) {

    const files =
        getChatLogFiles();


    let history = [];


    for (
        const file of files
    ) {

        try {

            const filePath =
                path.join(
                    CHAT_LOG_DIR,
                    file
                );


            const content =
                fs.readFileSync(
                    filePath,
                    "utf8"
                );


            if (
                !content.trim()
            )
                continue;


            const messages =
                JSON.parse(
                    content
                );


            if (
                Array.isArray(
                    messages
                )
            ) {

                history.push(
                    ...messages
                );

            }

        } catch (error) {

            console.error(

                `Erreur lecture ${file}:`,
                error.message

            );

        }

    }


    /*
     * On garde seulement
     * les derniers messages.
     */

    if (
        history.length >
        limit
    ) {

        history =
            history.slice(
                -limit
            );

    }


    return history;

}


/* =====================================================
   CHAT HISTORY API
===================================================== */

app.get(
    "/api/chat/history",
    (req, res) => {

        try {

            const history =
                loadChatHistory(
                    100
                );


            res.json(
                history
            );

        } catch (error) {

            console.error(

                "Erreur historique:",
                error.message

            );


            res.status(500).json({

                error:
                    "Impossible de récupérer l'historique."

            });

        }

    }
);


/* =====================================================
   UPLOAD ERROR HANDLER
===================================================== */

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        if (
            error instanceof
            multer.MulterError
        ) {

            if (
                error.code ===
                "LIMIT_FILE_SIZE"
            ) {

                return res.status(413).json({

                    error:
                        "Fichier trop volumineux. Maximum : 25 Mo."

                });

            }


            return res.status(400).json({

                error:
                    error.message

            });

        }


        if (
            error
        ) {

            return res.status(400).json({

                error:
                    error.message

            });

        }


        next();

    }
);


/* =====================================================
   WEBSOCKET - BROADCAST
===================================================== */

function broadcast(
    data,
    except = null
) {

    const message =
        JSON.stringify(
            data
        );


    wss.clients.forEach(
        client => {

            if (

                client !== except &&

                client.readyState ===
                WebSocket.OPEN

            ) {

                try {

                    client.send(
                        message
                    );

                } catch (error) {

                    console.error(
                        "Erreur envoi WebSocket:",
                        error.message
                    );

                }

            }

        }
    );

}


/* =====================================================
   SEND USERS
===================================================== */

function sendUsers() {

    broadcast({

        type:
            "users",

        users:
            [
                ...users.values()
            ].map(
                user =>
                    user.name
            )

    });

}


/* =====================================================
   WEBSOCKET CONNECTION
===================================================== */

wss.on(
    "connection",
    socket => {

        console.log(
            "Nouvelle connexion"
        );


        /* =========================
           PING / KEEP ALIVE
        ========================= */

        socket.isAlive =
            true;


        socket.on(
            "pong",
            () => {

                socket.isAlive =
                    true;

            }
        );


        /* =========================
           MESSAGE
        ========================= */

        socket.on(
            "message",
            raw => {

                let data;


                try {

                    data =
                        JSON.parse(
                            raw.toString()
                        );

                } catch {

                    return;

                }


                /* =========================
                   JOIN
                ========================= */

                if (
                    data.type ===
                    "join"
                ) {

                    const username =
                        String(
                            data.username ||
                            "anonymous"
                        )
                            .replace(
                                /[<>]/g,
                                ""
                            )
                            .substring(
                                0,
                                20
                            );


                    users.set(
                        socket,
                        {

                            name:
                                username

                        }
                    );


                    socket.send(

                        JSON.stringify({

                            type:
                                "system",

                            message:
                                `Bienvenue ${username}.`

                        })

                    );


                    /*
                     * Envoie les derniers
                     * messages au nouveau joueur.
                     */

                    const history =
                        loadChatHistory(
                            100
                        );


                    socket.send(

                        JSON.stringify({

                            type:
                                "chatHistory",

                            messages:
                                history

                        })

                    );


                    broadcast({

                        type:
                            "join",

                        username:
                            username

                    }, socket);


                    sendUsers();


                    return;

                }


                /* =========================
                   CHAT
                ========================= */

                if (
                    data.type ===
                    "chat"
                ) {

                    const user =
                        users.get(
                            socket
                        );


                    if (
                        !user
                    )
                        return;


                    const message =
                        String(
                            data.message ||
                            ""
                        )
                            .replace(
                                /[<>]/g,
                                ""
                            )
                            .substring(
                                0,
                                300
                            );


                    if (
                        !message
                    )
                        return;


                    /* =====================
                       EASTER EGG MARLEY
                    ===================== */

                    if (

                        message
                            .trim()
                            .toLowerCase()
                            .replace(
                                /[.!?]+$/g,
                                ""
                            ) ===
                        "i love you marley"

                    ) {

                        broadcast({

                            type:
                                "marley",

                            username:
                                user.name

                        });


                        return;

                    }


                    /* =====================
                       SAUVEGARDE
                    ===================== */

                    saveChatMessage(

                        user.name,

                        message

                    );


                    /* =====================
                       CHAT NORMAL
                    ===================== */

                    broadcast({

                        type:
                            "chat",

                        username:
                            user.name,

                        message:
                            message

                    });

                }

            }
        );


        /* =========================
           CLOSE
        ========================= */

        socket.on(
            "close",
            () => {

                const user =
                    users.get(
                        socket
                    );


                if (
                    !user
                )
                    return;


                broadcast({

                    type:
                        "leave",

                    username:
                        user.name

                }, socket);


                users.delete(
                    socket
                );


                sendUsers();


                console.log(

                    `${user.name} est parti.`

                );

            }
        );


        /* =========================
           ERROR
        ========================= */

        socket.on(
            "error",
            error => {

                console.error(
                    "WebSocket error:",
                    error.message
                );

            }
        );

    }
);


/* =====================================================
   WEBSOCKET KEEP ALIVE
===================================================== */

const websocketHeartbeat =
    setInterval(
        () => {

            wss.clients.forEach(
                socket => {

                    if (
                        socket.isAlive ===
                        false
                    ) {

                        console.log(
                            "WebSocket inactif → fermeture."
                        );

                        return socket.terminate();

                    }


                    socket.isAlive =
                        false;


                    socket.ping();

                }
            );

        },
        30000
    );


wss.on(
    "close",
    () => {

        clearInterval(
            websocketHeartbeat
        );

    }
);


/* =====================================================
   SERVER
===================================================== */

const PORT =
    process.env.PORT ||
    3000;


server.listen(
    PORT,
    () => {

        console.log(
            `Serveur lancé sur le port ${PORT}`
        );


        console.log(
            "GitHub owner:",
            GITHUB_OWNER || "(manquant)"
        );


        console.log(
            "GitHub repo:",
            GITHUB_REPO || "(manquant)"
        );


        console.log(
            "GitHub branch:",
            GITHUB_BRANCH
        );


        console.log(
            "GitHub token:",
            GITHUB_TOKEN
                ? "présent"
                : "MANQUANT"
        );

    }
);
