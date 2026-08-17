const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const session = require("express-session");
const pg = require("pg");
const connectPgSimple = require("connect-pg-simple");

const app = express();

const {
    Pool
} = pg;


/* =====================================================
   CONFIGURATION
===================================================== */

const PORT =
    process.env.PORT || 3000;

const GITHUB_TOKEN =
    process.env.GITHUB_TOKEN;

const GITHUB_OWNER =
    process.env.GITHUB_OWNER;

const GITHUB_REPO =
    process.env.GITHUB_REPO;

const GITHUB_BRANCH =
    process.env.GITHUB_BRANCH || "main";


/* =====================================================
   GITHUB PATHS
===================================================== */

const MEDIA_FOLDER =
    "site_node/media";

const CHAT_LOG_FOLDER =
    "site_node/chat_logs";


/* =====================================================
   POSTGRESQL
===================================================== */

if (!process.env.DATABASE_URL) {

    console.error(
        "ERREUR : DATABASE_URL est manquante."
    );

}

const pool =
    new Pool({

        connectionString:
            process.env.DATABASE_URL,

        ssl:
            process.env.NODE_ENV === "production"
                ? {
                    rejectUnauthorized: false
                }
                : false

    });


/* =====================================================
   EXPRESS
===================================================== */

app.set(
    "trust proxy",
    1
);

app.use(
    express.json({
        limit: "1mb"
    })
);

app.use(
    express.urlencoded({
        extended: true
    })
);


/* =====================================================
   CORS
===================================================== */

app.use(
    (req, res, next) => {

        const origin =
            req.headers.origin;

        if (origin) {

            res.setHeader(
                "Access-Control-Allow-Origin",
                origin
            );

            res.setHeader(
                "Access-Control-Allow-Credentials",
                "true"
            );

        }

        res.setHeader(
            "Access-Control-Allow-Methods",
            "GET, POST, PUT, DELETE, OPTIONS"
        );

        res.setHeader(
            "Access-Control-Allow-Headers",
            "Content-Type"
        );

        if (
            req.method === "OPTIONS"
        ) {

            return res.sendStatus(
                204
            );

        }

        next();

    }
);


/* =====================================================
   SESSION
===================================================== */

const PgSession =
    connectPgSimple(
        session
    );

const sessionMiddleware =
    session({

        store:
            new PgSession({

                pool:
                    pool,

                tableName:
                    "user_sessions",

                createTableIfMissing:
                    true

            }),

        secret:
            process.env.SESSION_SECRET ||
            "CHANGE-ME-ON-RENDER",

        resave:
            false,

        saveUninitialized:
            false,

        cookie: {

            httpOnly:
                true,

            secure:
                process.env.NODE_ENV === "production",

            sameSite:
                "none",

            maxAge:
                1000 *
                60 *
                60 *
                24 *
                30

        }

    });

app.use(
    sessionMiddleware
);


/* =====================================================
   HTTP SERVER
===================================================== */

const server =
    http.createServer(
        app
    );


/* =====================================================
   WEBSOCKET
===================================================== */

const wss =
    new WebSocket.Server({
        noServer: true
    });


/* =====================================================
   WEBSOCKET SESSION
===================================================== */

server.on(
    "upgrade",
    (request, socket, head) => {

        let pathname;

        try {

            pathname =
                new URL(
                    request.url,
                    `http://${request.headers.host}`
                ).pathname;

        } catch {

            socket.destroy();

            return;

        }


        if (
            pathname !== "/"
        ) {

            socket.destroy();

            return;

        }


        sessionMiddleware(
            request,
            {},
            () => {

                wss.handleUpgrade(
                    request,
                    socket,
                    head,
                    ws => {

                        wss.emit(
                            "connection",
                            ws,
                            request
                        );

                    }
                );

            }
        );

    }
);


/* =====================================================
   USERS ONLINE
===================================================== */

const users =
    new Map();


/* =====================================================
   DATABASE INITIALIZATION
===================================================== */

async function initializeDatabase() {

    await pool.query(`

        CREATE TABLE IF NOT EXISTS users (

            id SERIAL PRIMARY KEY,

            username VARCHAR(20)
                UNIQUE NOT NULL,

            password_hash TEXT
                NOT NULL,

            avatar_url TEXT,

            created_at TIMESTAMPTZ
                NOT NULL
                DEFAULT NOW()

        );

    `);

    console.log(
        "Table users OK."
    );

}


/* =====================================================
   GITHUB HELPER
===================================================== */

function githubConfigOK() {

    return Boolean(

        GITHUB_TOKEN &&
        GITHUB_OWNER &&
        GITHUB_REPO

    );

}


async function githubRequest(
    apiPath,
    options = {}
) {

    if (
        !githubConfigOK()
    ) {

        throw new Error(
            "Configuration GitHub incomplète."
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
                text

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
   ACCOUNT HELPERS
===================================================== */

function cleanUsername(
    username
) {

    return String(
        username || ""
    )
        .trim()
        .replace(
            /[^a-zA-Z0-9_-]/g,
            ""
        )
        .substring(
            0,
            20
        );

}


function getCurrentUser(
    req
) {

    if (
        !req.session ||
        !req.session.userId
    ) {

        return null;

    }


    return {

        id:
            req.session.userId,

        username:
            req.session.username,

        avatar:
            req.session.avatar || null

    };

}


/* =====================================================
   AUTH MIDDLEWARE
===================================================== */

function requireAuth(
    req,
    res,
    next
) {

    if (
        !req.session ||
        !req.session.userId
    ) {

        return res.status(
            401
        ).json({

            error:
                "Vous devez être connecté."

        });

    }


    next();

}


/* =====================================================
   REGISTER
===================================================== */

app.post(
    "/api/auth/register",
    async (req, res) => {

        try {

            let {
                username,
                password,
                avatar
            } = req.body;


            username =
                cleanUsername(
                    username
                );


            password =
                String(
                    password || ""
                );


            avatar =
                String(
                    avatar || ""
                )
                    .trim()
                    .substring(
                        0,
                        500
                    );


            if (
                username.length < 3
            ) {

                return res.status(
                    400
                ).json({

                    error:
                        "Le pseudo doit contenir au moins 3 caractères."

                });

            }


            if (
                password.length < 6
            ) {

                return res.status(
                    400
                ).json({

                    error:
                        "Le mot de passe doit contenir au moins 6 caractères."

                });

            }


            const existing =
                await pool.query(

                    `SELECT id
                     FROM users
                     WHERE LOWER(username) = LOWER($1)
                     LIMIT 1`,

                    [
                        username
                    ]

                );


            if (
                existing.rows.length
            ) {

                return res.status(
                    409
                ).json({

                    error:
                        "Ce pseudo est déjà utilisé."

                });

            }


            const passwordHash =
                await bcrypt.hash(
                    password,
                    12
                );


            const result =
                await pool.query(

                    `INSERT INTO users
                     (username, password_hash, avatar_url)
                     VALUES ($1, $2, $3)
                     RETURNING id, username, avatar_url, created_at`,

                    [
                        username,
                        passwordHash,
                        avatar || null
                    ]

                );


            const user =
                result.rows[0];


            req.session.userId =
                user.id;

            req.session.username =
                user.username;

            req.session.avatar =
                user.avatar_url || null;


            req.session.save(
                error => {

                    if (error) {

                        console.error(
                            "Erreur session:",
                            error
                        );

                        return res.status(
                            500
                        ).json({

                            error:
                                "Compte créé mais impossible de créer la session."

                        });

                    }


                    res.json({

                        success:
                            true,

                        user: {

                            id:
                                user.id,

                            username:
                                user.username,

                            avatar:
                                user.avatar_url

                        }

                    });

                }
            );

        } catch (error) {

            console.error(
                "REGISTER:",
                error
            );


            res.status(
                500
            ).json({

                error:
                    "Erreur pendant l'inscription."

            });

        }

    }
);


/* =====================================================
   LOGIN
===================================================== */

app.post(
    "/api/auth/login",
    async (req, res) => {

        try {

            const username =
                cleanUsername(
                    req.body.username
                );


            const password =
                String(
                    req.body.password || ""
                );


            if (
                !username ||
                !password
            ) {

                return res.status(
                    400
                ).json({

                    error:
                        "Pseudo et mot de passe requis."

                });

            }


            const result =
                await pool.query(

                    `SELECT
                        id,
                        username,
                        password_hash,
                        avatar_url
                     FROM users
                     WHERE LOWER(username) = LOWER($1)
                     LIMIT 1`,

                    [
                        username
                    ]

                );


            if (
                !result.rows.length
            ) {

                return res.status(
                    401
                ).json({

                    error:
                        "Pseudo ou mot de passe incorrect."

                });

            }


            const user =
                result.rows[0];


            const valid =
                await bcrypt.compare(
                    password,
                    user.password_hash
                );


            if (
                !valid
            ) {

                return res.status(
                    401
                ).json({

                    error:
                        "Pseudo ou mot de passe incorrect."

                });

            }


            req.session.userId =
                user.id;

            req.session.username =
                user.username;

            req.session.avatar =
                user.avatar_url || null;


            req.session.save(
                error => {

                    if (error) {

                        console.error(
                            "LOGIN SESSION:",
                            error
                        );

                        return res.status(
                            500
                        ).json({

                            error:
                                "Impossible de créer la session."

                        });

                    }


                    res.json({

                        success:
                            true,

                        user: {

                            id:
                                user.id,

                            username:
                                user.username,

                            avatar:
                                user.avatar_url

                        }

                    });

                }
            );

        } catch (error) {

            console.error(
                "LOGIN:",
                error
            );


            res.status(
                500
            ).json({

                error:
                    "Erreur pendant la connexion."

            });

        }

    }
);


/* =====================================================
   LOGOUT
===================================================== */

app.post(
    "/api/auth/logout",
    (req, res) => {

        req.session.destroy(
            error => {

                if (error) {

                    return res.status(
                        500
                    ).json({

                        error:
                            "Impossible de se déconnecter."

                    });

                }


                res.clearCookie(
                    "connect.sid"
                );


                res.json({

                    success:
                        true

                });

            }
        );

    }
);


/* =====================================================
   CURRENT ACCOUNT
===================================================== */

app.get(
    "/api/account/me",
    async (req, res) => {

        try {

            const user =
                getCurrentUser(
                    req
                );


            if (
                !user
            ) {

                return res.json({

                    loggedIn:
                        false,

                    user:
                        null

                });

            }


            const result =
                await pool.query(

                    `SELECT
                        id,
                        username,
                        avatar_url,
                        created_at
                     FROM users
                     WHERE id = $1
                     LIMIT 1`,

                    [
                        user.id
                    ]

                );


            if (
                !result.rows.length
            ) {

                req.session.destroy(
                    () => {}
                );


                return res.json({

                    loggedIn:
                        false,

                    user:
                        null

                });

            }


            const dbUser =
                result.rows[0];


            res.json({

                loggedIn:
                    true,

                user: {

                    id:
                        dbUser.id,

                    username:
                        dbUser.username,

                    avatar:
                        dbUser.avatar_url,

                    createdAt:
                        dbUser.created_at

                }

            });

        } catch (error) {

            console.error(
                "ME:",
                error
            );


            res.status(
                500
            ).json({

                error:
                    "Erreur récupération compte."

            });

        }

    }
);


/* =====================================================
   UPDATE PROFILE
===================================================== */

app.put(
    "/api/account/profile",
    requireAuth,
    async (req, res) => {

        try {

            const avatar =
                String(
                    req.body.avatar || ""
                )
                    .trim()
                    .substring(
                        0,
                        500
                    );


            const result =
                await pool.query(

                    `UPDATE users
                     SET avatar_url = $1
                     WHERE id = $2
                     RETURNING id, username, avatar_url`,

                    [
                        avatar || null,
                        req.session.userId
                    ]

                );


            if (
                !result.rows.length
            ) {

                return res.status(
                    404
                ).json({

                    error:
                        "Compte introuvable."

                });

            }


            req.session.avatar =
                result.rows[0].avatar_url;


            /*
             * Mise à jour de l'avatar
             * pour les connexions WebSocket
             * déjà ouvertes.
             */

            for (
                const [
                    ws,
                    user
                ]
                of users.entries()
            ) {

                if (
                    user.id ===
                    req.session.userId
                ) {

                    user.avatar =
                        result.rows[0].avatar_url;

                }

            }


            res.json({

                success:
                    true,

                user: {

                    id:
                        result.rows[0].id,

                    username:
                        result.rows[0].username,

                    avatar:
                        result.rows[0].avatar_url

                }

            });

        } catch (error) {

            console.error(
                "PROFILE:",
                error
            );


            res.status(
                500
            ).json({

                error:
                    "Impossible de modifier le profil."

            });

        }

    }
);


/* =====================================================
   FILE LIST
===================================================== */

app.get(
    "/api/files",
    (req, res) => {

        res.json([

            "site_node/",
            "site_node/server.js",
            "site_node/package.json",
            "site_node/package-lock.json",
            "site_node/media/",
            "site_node/chat_logs/"

        ]);

    }
);


/* =====================================================
   HOME
===================================================== */

app.get(
    "/",
    (req, res) => {

        res.send(
            "David Terminal Server online."
        );

    }
);


/* =====================================================
   MEDIA CONFIG
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
   MEDIA LIST
===================================================== */

app.get(
    "/api/media",
    async (req, res) => {

        try {

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


            res.status(
                500
            ).json({

                error:
                    error.message

            });

        }

    }
);


/* =====================================================
   MEDIA UPLOAD
===================================================== */

app.post(
    "/api/upload",
    requireAuth,
    upload.single("file"),
    async (req, res) => {

        try {

            if (
                !req.file
            ) {

                return res.status(
                    400
                ).json({

                    error:
                        "Aucun fichier envoyé."

                });

            }


            const username =
                req.session.username;


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


            const extension =
                path.extname(
                    req.file.originalname
                );


            if (
                !path.extname(
                    customName
                )
            ) {

                customName +=
                    extension;

            }


            const timestamp =
                Date.now();


            const filename =
                `${timestamp}_${username}_${customName}`;


            const githubPath =
                `${MEDIA_FOLDER}/${filename}`;


            const content =
                req.file.buffer.toString(
                    "base64"
                );


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


            const rawUrl =
                `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${githubPath}`;


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
                "UPLOAD:",
                error
            );


            res.status(
                500
            ).json({

                error:
                    error.message

            });

        }

    }
);


/* =====================================================
   CHAT LOG
===================================================== */

const CHAT_LOG_DIR =
    path.join(
        __dirname,
        "chat_logs"
    );


const CHAT_LOG_MAX_SIZE =
    10 * 1024 * 1024;


if (
    !fs.existsSync(
        CHAT_LOG_DIR
    )
) {

    fs.mkdirSync(
        CHAT_LOG_DIR,
        {
            recursive:
                true
        }
    );

}


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
                (a, b) =>
                    parseInt(
                        a.match(
                            /\d+/
                        )[0]
                    ) -
                    parseInt(
                        b.match(
                            /\d+/
                        )[0]
                    )
            );

    } catch {

        return [];

    }

}


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
   SAVE CHAT MESSAGE
===================================================== */

function saveChatMessage(
    username,
    message,
    avatar = null
) {

    try {

        let filePath =
            getLastChatLog();


        let messages = [];


        if (
            fs.existsSync(
                filePath
            )
        ) {

            try {

                messages =
                    JSON.parse(
                        fs.readFileSync(
                            filePath,
                            "utf8"
                        )
                    );

            } catch {

                messages = [];

            }

        }


        const chatMessage = {

            username:
                username,

            avatar:
                avatar || null,

            message:
                message,

            timestamp:
                Date.now()

        };


        messages.push(
            chatMessage
        );


        const content =
            JSON.stringify(
                messages,
                null,
                2
            );


        if (
            Buffer.byteLength(
                content,
                "utf8"
            ) >
            CHAT_LOG_MAX_SIZE
        ) {

            const files =
                getChatLogFiles();


            const nextNumber =
                files.length
                    ? Math.max(
                        ...files.map(
                            file =>
                                parseInt(
                                    file.match(
                                        /\d+/
                                    )[0]
                                )
                        )
                    ) + 1
                    : 1;


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

        } else {

            fs.writeFileSync(

                filePath,

                content,

                "utf8"

            );

        }

    } catch (error) {

        console.error(
            "Erreur sauvegarde chat:",
            error.message
        );

    }

}


/* =====================================================
   LOAD CHAT HISTORY
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

            const content =
                fs.readFileSync(
                    path.join(
                        CHAT_LOG_DIR,
                        file
                    ),
                    "utf8"
                );


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

        } catch {

            // fichier ignoré

        }

    }


    return history.length > limit
        ? history.slice(-limit)
        : history;

}


/* =====================================================
   CHAT HISTORY API
===================================================== */

app.get(
    "/api/chat-history",
    (req, res) => {

        res.json(
            loadChatHistory(
                100
            )
        );

    }
);


/* =====================================================
   CHAT HISTORY ALIAS
===================================================== */

app.get(
    "/api/chat/history",
    (req, res) => {

        res.json(
            loadChatHistory(
                100
            )
        );

    }
);


/* =====================================================
   BROADCAST
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

                client.send(
                    message
                );

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
                user => ({

                    id:
                        user.id,

                    name:
                        user.name,

                    avatar:
                        user.avatar || null

                })
            )

    });

}


/* =====================================================
   WEBSOCKET CONNECTION
===================================================== */

wss.on(
    "connection",
    (socket, request) => {

        console.log(
            "Nouvelle connexion WebSocket"
        );


        socket.isAlive =
            true;


        socket.on(
            "pong",
            () => {

                socket.isAlive =
                    true;

            }
        );


        /* =================================================
           VÉRIFICATION SESSION
        ================================================= */

        if (
            !request.session ||
            !request.session.userId
        ) {

            socket.send(
                JSON.stringify({

                    type:
                        "authRequired",

                    message:
                        "Connexion requise."

                })
            );


            socket.close();

            return;

        }


        const username =
            request.session.username;


        const user = {

            id:
                request.session.userId,

            name:
                username,

            avatar:
                request.session.avatar ||
                null

        };


        users.set(
            socket,
            user
        );


        /* =================================================
           BIENVENUE
        ================================================= */

        socket.send(
            JSON.stringify({

                type:
                    "system",

                message:
                    `Bienvenue ${username}.`

            })
        );


        /* =================================================
           HISTORIQUE
        ================================================= */

        socket.send(
            JSON.stringify({

                type:
                    "chatHistory",

                messages:
                    loadChatHistory(
                        100
                    )

            })
        );


        /* =================================================
           JOIN
        ================================================= */

        broadcast({

            type:
                "join",

            username:
                username,

            avatar:
                user.avatar || null

        }, socket);


        sendUsers();


        /* =================================================
           MESSAGE
        ================================================= */

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


                if (
                    data.type !==
                    "chat"
                ) {

                    return;

                }


                const currentUser =
                    users.get(
                        socket
                    );


                if (
                    !currentUser
                ) {

                    return;

                }


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
                        )
                        .trim();


                if (
                    !message
                ) {

                    return;

                }


                /* =================================================
                   MARLEY
                ================================================= */

                if (

                    message
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
                            currentUser.name,

                        avatar:
                            currentUser.avatar || null

                    });

                    return;

                }


                /* =================================================
                   SAUVEGARDE
                ================================================= */

                saveChatMessage(

                    currentUser.name,

                    message,

                    currentUser.avatar

                );


                /* =================================================
                   ENVOI CHAT
                ================================================= */

                broadcast({

                    type:
                        "chat",

                    username:
                        currentUser.name,

                    avatar:
                        currentUser.avatar ||
                        null,

                    message:
                        message,

                    timestamp:
                        Date.now()

                });

            }
        );


        /* =================================================
           CLOSE
        ================================================= */

        socket.on(
            "close",
            () => {

                const user =
                    users.get(
                        socket
                    );


                if (
                    !user
                ) {

                    return;

                }


                users.delete(
                    socket
                );


                broadcast({

                    type:
                        "leave",

                    username:
                        user.name,

                    avatar:
                        user.avatar ||
                        null

                });


                sendUsers();


                console.log(
                    `${user.name} est parti.`
                );

            }
        );


        /* =================================================
           ERROR
        ================================================= */

        socket.on(
            "error",
            error => {

                console.error(
                    "WebSocket:",
                    error.message
                );

            }
        );

    }
);


/* =====================================================
   WEBSOCKET KEEP ALIVE
===================================================== */

const heartbeat =
    setInterval(
        () => {

            wss.clients.forEach(
                socket => {

                    if (
                        socket.isAlive ===
                        false
                    ) {

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
            heartbeat
        );

    }
);


/* =====================================================
   MULTER ERROR
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

                return res.status(
                    413
                ).json({

                    error:
                        "Fichier trop volumineux. Maximum : 25 Mo."

                });

            }

        }


        if (
            error
        ) {

            return res.status(
                400
            ).json({

                error:
                    error.message

            });

        }


        next();

    }
);


/* =====================================================
   START SERVER
===================================================== */

async function startServer() {

    try {

        await initializeDatabase();


        server.listen(
            PORT,
            () => {

                console.log(
                    `Serveur lancé sur le port ${PORT}`
                );


                console.log(
                    "GitHub owner:",
                    GITHUB_OWNER ||
                    "(manquant)"
                );


                console.log(
                    "GitHub repo:",
                    GITHUB_REPO ||
                    "(manquant)"
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
                    "PostgreSQL:",
                    process.env.DATABASE_URL
                        ? "présent"
                        : "MANQUANT"
                );


                console.log(
                    "Sessions PostgreSQL activées."
                );

            }
        );

    } catch (error) {

        console.error(
            "Impossible de démarrer le serveur:",
            error
        );


        process.exit(
            1
        );

    }

}


startServer();
