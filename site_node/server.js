const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const multer = require("multer");
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

const users = new Map();


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
    process.env.GITHUB_BRANCH || "main";


/*
 * Dossiers GitHub
 */

const MEDIA_FOLDER =
    "site_node/media";

const CHAT_LOG_FOLDER =
    "site_node/chat_logs";


/*
 * Taille maximale d'un fichier de log.
 *
 * 10 Mo pour éviter d'approcher
 * les limites de GitHub.
 */

const CHAT_LOG_MAX_SIZE =
    10 * 1024 * 1024;


/*
 * Nombre de messages envoyés
 * au client lors de la connexion.
 */

const CHAT_HISTORY_LIMIT =
    100;


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
    "site_node/media/",
    "site_node/chat_logs/"

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

        const error =
            new Error(

                data.message ||
                `GitHub HTTP ${response.status}`

            );


        error.status =
            response.status;


        throw error;

    }


    return data;

}


/* =====================================================
   GITHUB - LIST DIRECTORY
===================================================== */

async function githubListFolder(
    folder
) {

    try {

        const data =
            await githubRequest(

                `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${folder}?ref=${encodeURIComponent(GITHUB_BRANCH)}`

            );


        if (
            !Array.isArray(data)
        ) {

            return [];

        }


        return data;

    } catch (error) {

        /*
         * Si le dossier n'existe pas encore,
         * GitHub renvoie 404.
         *
         * On considère simplement
         * qu'il est vide.
         */

        if (
            error.status === 404
        ) {

            return [];

        }


        throw error;

    }

}


/* =====================================================
   MEDIA LIST
===================================================== */

app.get(
    "/api/media",
    async (req, res) => {

        try {

            const files =
                await githubListFolder(
                    MEDIA_FOLDER
                );


            const media =
                files
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
                media
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


            if (
                !customName
            ) {

                customName =
                    req.file.originalname;

            }


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
   CHAT LOG FILES
===================================================== */

async function getChatLogFiles() {

    const files =
        await githubListFolder(
            CHAT_LOG_FOLDER
        );


    return files

        .filter(
            file =>
                file.type === "file" &&
                /^chat_\d+\.json$/.test(
                    file.name
                )
        )

        .sort(
            (a, b) => {

                const numberA =
                    parseInt(
                        a.name.match(
                            /\d+/
                        )[0]
                    );


                const numberB =
                    parseInt(
                        b.name.match(
                            /\d+/
                        )[0]
                    );


                return (
                    numberA -
                    numberB
                );

            }
        );

}


/* =====================================================
   CHAT LOG - READ FILE
===================================================== */

async function readChatLogFile(
    file
) {

    try {

        const data =
            await githubRequest(

                `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${file.path}?ref=${encodeURIComponent(GITHUB_BRANCH)}`

            );


        if (
            !data.content
        ) {

            return {

                messages: [],
                sha: data.sha

            };

        }


        const decoded =
            Buffer
                .from(
                    data.content.replace(
                        /\n/g,
                        ""
                    ),
                    "base64"
                )
                .toString(
                    "utf8"
                );


        if (
            !decoded.trim()
        ) {

            return {

                messages: [],
                sha: data.sha

            };

        }


        const messages =
            JSON.parse(
                decoded
            );


        return {

            messages:
                Array.isArray(messages)
                    ? messages
                    : [],

            sha:
                data.sha

        };


    } catch (error) {

        console.error(

            `Erreur lecture ${file.name}:`,
            error.message

        );


        return {

            messages: [],
            sha:
                null

        };

    }

}


/* =====================================================
   CHAT LOG - NEXT NUMBER
===================================================== */

function getNextChatLogNumber(
    files
) {

    if (
        !files.length
    ) {

        return 1;

    }


    let highest =
        0;


    for (
        const file of files
    ) {

        const match =
            file.name.match(
                /^chat_(\d+)\.json$/
            );


        if (
            match
        ) {

            const number =
                parseInt(
                    match[1]
                );


            if (
                number >
                highest
            ) {

                highest =
                    number;

            }

        }

    }


    return (
        highest +
        1
    );

}


/* =====================================================
   CHAT LOG - GITHUB SAVE
===================================================== */

/*
 * Les sauvegardes sont mises dans une file
 * pour éviter que deux messages essayent
 * de modifier le même fichier GitHub
 * simultanément.
 */

let chatSaveQueue =
    Promise.resolve();


function queueChatSave(
    username,
    message
) {

    chatSaveQueue =
        chatSaveQueue
            .then(
                () =>
                    saveChatMessageToGitHub(
                        username,
                        message
                    )
            )
            .catch(
                error => {

                    console.error(

                        "Erreur file sauvegarde chat:",
                        error.message

                    );

                }
            );


    return chatSaveQueue;

}


/* =====================================================
   SAVE CHAT MESSAGE TO GITHUB
===================================================== */

async function saveChatMessageToGitHub(
    username,
    message
) {

    const chatMessage = {

        username:
            username,

        message:
            message,

        timestamp:
            Date.now()

    };


    let files =
        await getChatLogFiles();


    /*
     * Aucun fichier
     */

    if (
        !files.length
    ) {

        const filename =
            "chat_0001.json";


        const githubPath =
            `${CHAT_LOG_FOLDER}/${filename}`;


        const content =
            JSON.stringify(
                [
                    chatMessage
                ],
                null,
                2
            );


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
                            `Create chat log: ${filename}`,

                        content:
                            Buffer
                                .from(
                                    content,
                                    "utf8"
                                )
                                .toString(
                                    "base64"
                                ),

                        branch:
                            GITHUB_BRANCH

                    })

            }

        );


        console.log(
            `Création ${filename}`
        );


        return;

    }


    /*
     * Dernier fichier
     */

    const lastFile =
        files[
            files.length - 1
        ];


    const result =
        await readChatLogFile(
            lastFile
        );


    let messages =
        result.messages;


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


    /*
     * Le fichier dépasse la limite.
     *
     * On crée un nouveau fichier.
     */

    if (
        newSize >
        CHAT_LOG_MAX_SIZE
    ) {

        const nextNumber =
            getNextChatLogNumber(
                files
            );


        const filename =
            `chat_${String(
                nextNumber
            ).padStart(
                4,
                "0"
            )}` +
            `.json`;


        const githubPath =
            `${CHAT_LOG_FOLDER}/${filename}`;


        const firstContent =
            JSON.stringify(
                [
                    chatMessage
                ],
                null,
                2
            );


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
                            `Create chat log: ${filename}`,

                        content:
                            Buffer
                                .from(
                                    firstContent,
                                    "utf8"
                                )
                                .toString(
                                    "base64"
                                ),

                        branch:
                            GITHUB_BRANCH

                    })

            }

        );


        console.log(
            `Nouveau fichier chat: ${filename}`
        );


        return;

    }


    /*
     * Mise à jour du fichier existant.
     */

    await githubRequest(

        `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${lastFile.path}`,

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
                        `Update chat log: ${lastFile.name}`,

                    content:
                        Buffer
                            .from(
                                newContent,
                                "utf8"
                            )
                            .toString(
                                "base64"
                            ),

                    sha:
                        result.sha,

                    branch:
                        GITHUB_BRANCH

                })

        }

    );


    console.log(
        `Message sauvegardé dans ${lastFile.name}`
    );

}


/* =====================================================
   LOAD CHAT HISTORY FROM GITHUB
===================================================== */

async function loadChatHistory(
    limit = CHAT_HISTORY_LIMIT
) {

    const files =
        await getChatLogFiles();


    let history = [];


    /*
     * Les fichiers sont déjà
     * dans l'ordre chronologique.
     */

    for (
        const file of files
    ) {

        const result =
            await readChatLogFile(
                file
            );


        if (
            result.messages.length
        ) {

            history.push(
                ...result.messages
            );

        }

    }


    /*
     * Seulement les derniers messages.
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

/*
 * Route principale utilisée
 * par ton HTML.
 */

app.get(
    "/api/chat-history",
    async (req, res) => {

        try {

            const history =
                await loadChatHistory(
                    CHAT_HISTORY_LIMIT
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
                    error.message ||
                    "Impossible de récupérer l'historique."

            });

        }

    }
);


/*
 * Ancienne route conservée
 * pour compatibilité.
 */

app.get(
    "/api/chat/history",
    async (req, res) => {

        try {

            const history =
                await loadChatHistory(
                    CHAT_HISTORY_LIMIT
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
                    error.message ||
                    "Impossible de récupérer l'historique."

            });

        }

    }
);


/* =====================================================
   WEBSOCKET BROADCAST
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

                        "Erreur WebSocket:",
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
            ]
                .map(
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
           KEEP ALIVE
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
            async raw => {

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
                     * Historique depuis GitHub
                     */

                    try {

                        const history =
                            await loadChatHistory(
                                CHAT_HISTORY_LIMIT
                            );


                        if (
                            socket.readyState ===
                            WebSocket.OPEN
                        ) {

                            socket.send(

                                JSON.stringify({

                                    type:
                                        "chatHistory",

                                    messages:
                                        history

                                })

                            );

                        }

                    } catch (error) {

                        console.error(

                            "Erreur envoi historique:",
                            error.message

                        );

                    }


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
                       MARLEY
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
                       SAUVEGARDE GITHUB
                    ===================== */

                    queueChatSave(

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
   WEBSOCKET HEARTBEAT
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


        console.log(
            "Media folder:",
            MEDIA_FOLDER
        );


        console.log(
            "Chat log folder:",
            CHAT_LOG_FOLDER
        );

    }

);
