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

const MUSIC_FOLDER =
    "site_node/musique";

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
   GITHUB
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
            req.session.avatar ||
            null

    };

}


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

            let username =
                cleanUsername(
                    req.body.username
                );

            const password =
                String(
                    req.body.password || ""
                );

            const avatar =
                String(
                    req.body.avatar || ""
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
                user.avatar_url ||
                null;


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
                user.avatar_url ||
                null;


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
            "site_node/musique/",
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
   MEDIA
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
                            file.type === "file"
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
                "MEDIA LIST:",
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


            const filename =
                `${Date.now()}_${username}_${customName}`;


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
   MUSIC
===================================================== */

const MUSIC_MAX_FILE_SIZE =
    50 * 1024 * 1024;


const ALLOWED_MUSIC_TYPES = [

    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/ogg",
    "audio/webm",
    "audio/x-wav",
    "audio/x-m4a",
    "audio/mp4"

];


const musicUpload =
    multer({

        storage:
            multer.memoryStorage(),

        limits: {

            fileSize:
                MUSIC_MAX_FILE_SIZE

        },

        fileFilter:
            (req, file, callback) => {

                const extension =
                    path.extname(
                        file.originalname
                    )
                        .toLowerCase();


                const allowedExtension = [

                    ".mp3",
                    ".wav",
                    ".ogg",
                    ".webm",
                    ".m4a"

                ].includes(
                    extension
                );


                if (
                    ALLOWED_MUSIC_TYPES.includes(
                        file.mimetype
                    ) ||
                    allowedExtension
                ) {

                    callback(
                        null,
                        true
                    );

                } else {

                    callback(
                        new Error(
                            "Type audio non autorisé."
                        )
                    );

                }

            }

    });


/* =====================================================
   MUSIC LIST
===================================================== */

app.get(
    "/api/music",
    async (req, res) => {

        try {

            const data =
                await githubRequest(

                    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${MUSIC_FOLDER}?ref=${encodeURIComponent(GITHUB_BRANCH)}`

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
                            file.type === "file"
                    )
                    .filter(
                        file =>
                            /\.(mp3|wav|ogg|webm|m4a)$/i
                                .test(
                                    file.name
                                )
                    )
                    .map(
                        file => ({

                            name:
                                file.name,

                            path:
                                file.path,

                            size:
                                file.size,

                            sha:
                                file.sha,

                            url:
                                file.download_url ||
                                `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${file.path}`,

                            download_url:
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
                "MUSIC LIST:",
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
   MUSIC UPLOAD
===================================================== */

app.post(
    "/api/music/upload",
    requireAuth,
    musicUpload.single("file"),
    async (req, res) => {

        try {

            if (
                !req.file
            ) {

                return res.status(
                    400
                ).json({

                    error:
                        "Aucune musique envoyée."

                });

            }


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
                        150
                    );


            const extension =
                path.extname(
                    req.file.originalname
                )
                    .toLowerCase();


            if (
                !path.extname(
                    customName
                )
            ) {

                customName +=
                    extension ||
                    ".mp3";

            }


            const githubPath =
                `${MUSIC_FOLDER}/${customName}`;


            const content =
                req.file.buffer.toString(
                    "base64"
                );


            /*
             * Vérifie si le fichier existe déjà.
             */

            let existingSha =
                null;


            try {

                const existing =
                    await githubRequest(

                        `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubPath}?ref=${encodeURIComponent(GITHUB_BRANCH)}`

                    );


                if (
                    existing &&
                    existing.sha
                ) {

                    existingSha =
                        existing.sha;

                }

            } catch {

                existingSha =
                    null;

            }


            const body = {

                message:
                    existingSha
                        ? `Update music: ${customName}`
                        : `Upload music: ${customName}`,

                content:
                    content,

                branch:
                    GITHUB_BRANCH

            };


            if (
                existingSha
            ) {

                body.sha =
                    existingSha;

            }


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
                            JSON.stringify(
                                body
                            )

                    }

                );


            const rawUrl =
                `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${githubPath}`;


            broadcast({

                type:
                    "music",

                name:
                    customName,

                path:
                    githubPath,

                url:
                    rawUrl,

                size:
                    req.file.size

            });


            console.log(
                `🎵 Musique envoyée sur GitHub : ${githubPath}`
            );


            res.json({

                success:
                    true,

                name:
                    customName,

                path:
                    githubPath,

                url:
                    rawUrl,

                size:
                    req.file.size,

                github:
                    result.content?.html_url ||
                    null

            });

        } catch (error) {

            console.error(
                "MUSIC UPLOAD:",
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

const CHAT_LOG_MAX_SIZE =
    10 * 1024 * 1024;


/*
 * Petit cache mémoire.
 *
 * Il sert uniquement à éviter de demander
 * GitHub à chaque message.
 */

let chatLogsCache =
    null;

let chatLogsCacheTime =
    0;

const CHAT_CACHE_TIME =
    10000;


/* =====================================================
   CHAT LOG - LISTE DES FICHIERS
===================================================== */

async function getChatLogFiles() {

    try {

        const data =
            await githubRequest(

                `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CHAT_LOG_FOLDER}?ref=${encodeURIComponent(GITHUB_BRANCH)}`

            );


        if (
            !Array.isArray(data)
        ) {

            return [];

        }


        return data
            .filter(
                file =>
                    file.type === "file"
            )
            .filter(
                file =>
                    /^chat_\d+\.json$/i.test(
                        file.name
                    )
            )
            .sort(
                (a, b) => {

                    const aNumber =
                        parseInt(
                            a.name.match(
                                /\d+/
                            )[0]
                        );

                    const bNumber =
                        parseInt(
                            b.name.match(
                                /\d+/
                            )[0]
                        );

                    return aNumber -
                        bNumber;

                }
            );

    } catch (error) {

        console.error(
            "CHAT FILE LIST:",
            error.message
        );

        return [];

    }

}


/* =====================================================
   CHAT LOG - RECUPERATION FICHIER
===================================================== */

async function getChatLogFileContent(
    file
) {

    try {

        const data =
            await githubRequest(

                `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${file.path}?ref=${encodeURIComponent(GITHUB_BRANCH)}`

            );


        if (
            !data ||
            !data.content
        ) {

            return [];

        }


        const content =
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
            !content.trim()
        ) {

            return [];

        }


        const messages =
            JSON.parse(
                content
            );


        return Array.isArray(
            messages
        )
            ? messages
            : [];

    } catch (error) {

        console.error(
            `CHAT READ ${file.name}:`,
            error.message
        );

        return [];

    }

}


/* =====================================================
   CHAT LOG - HISTORIQUE
===================================================== */

async function loadChatHistory(
    limit = 100
) {

    try {

        const now =
            Date.now();


        if (
            chatLogsCache &&
            now - chatLogsCacheTime <
                CHAT_CACHE_TIME
        ) {

            return chatLogsCache.length > limit
                ? chatLogsCache.slice(
                    -limit
                )
                : chatLogsCache;

        }


        const files =
            await getChatLogFiles();


        let history = [];


        /*
         * On lit les fichiers du plus récent
         * vers l'ancien.
         *
         * Cela évite de charger tout GitHub
         * si on a énormément de logs.
         */

        for (
            let i =
                files.length - 1;
            i >= 0;
            i--
        ) {

            const messages =
                await getChatLogFileContent(
                    files[i]
                );


            if (
                messages.length
            ) {

                history.unshift(
                    ...messages
                );

            }


            if (
                history.length >= limit
            ) {

                break;

            }

        }


        if (
            history.length > limit
        ) {

            history =
                history.slice(
                    -limit
                );

        }


        chatLogsCache =
            history;

        chatLogsCacheTime =
            now;


        return history;

    } catch (error) {

        console.error(
            "CHAT HISTORY:",
            error.message
        );

        return [];

    }

}


/* =====================================================
   CHAT LOG - CREATION / ECRITURE
===================================================== */

async function saveChatMessage(
    username,
    message,
    avatar = null
) {

    try {

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


        let files =
            await getChatLogFiles();


        /*
         * Aucun fichier :
         * création de chat_0001.json
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
                `📄 Nouveau fichier de chat créé : ${filename}`
            );


            chatLogsCache =
                null;


            return;

        }


        /*
         * Dernier fichier.
         */

        const lastFile =
            files[
                files.length - 1
            ];


        const currentMessages =
            await getChatLogFileContent(
                lastFile
            );


        currentMessages.push(
            chatMessage
        );


        const newContent =
            JSON.stringify(
                currentMessages,
                null,
                2
            );


        /*
         * Si le fichier dépasse 10 Mo,
         * création d'un nouveau fichier.
         */

        if (
            Buffer.byteLength(
                newContent,
                "utf8"
            ) >
            CHAT_LOG_MAX_SIZE
        ) {

            const lastNumber =
                parseInt(
                    lastFile.name.match(
                        /\d+/
                    )[0]
                );


            const nextNumber =
                lastNumber + 1;


            const filename =
                `chat_${String(
                    nextNumber
                ).padStart(
                    4,
                    "0"
                )}.json`;


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
                `📄 Nouveau fichier de chat créé : ${filename}`
            );


            chatLogsCache =
                null;


            return;

        }


        /*
         * Mise à jour du fichier existant.
         */

        const githubData =
            await githubRequest(

                `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${lastFile.path}?ref=${encodeURIComponent(GITHUB_BRANCH)}`

            );


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
                            githubData.sha,

                        branch:
                            GITHUB_BRANCH

                    })

            }

        );


        console.log(
            `💬 Message sauvegardé dans ${lastFile.name}`
        );


        chatLogsCache =
            null;

    } catch (error) {

        console.error(
            "CHAT SAVE:",
            error.message
        );

    }

}


/* =====================================================
   CHAT HISTORY API
===================================================== */

app.get(
    "/api/chat-history",
    async (req, res) => {

        try {

            const history =
                await loadChatHistory(
                    100
                );


            res.json(
                history
            );

        } catch (error) {

            console.error(
                "CHAT HISTORY API:",
                error
            );


            res.status(
                500
            ).json({

                error:
                    "Impossible de récupérer l'historique."

            });

        }

    }
);


/* =====================================================
   CHAT HISTORY ALIAS
===================================================== */

app.get(
    "/api/chat/history",
    async (req, res) => {

        try {

            const history =
                await loadChatHistory(
                    100
                );


            res.json(
                history
            );

        } catch (error) {

            console.error(
                "CHAT HISTORY ALIAS:",
                error
            );


            res.status(
                500
            ).json({

                error:
                    "Impossible de récupérer l'historique."

            });

        }

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

                try {

                    client.send(
                        message
                    );

                } catch (error) {

                    console.error(
                        "Broadcast:",
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
                user => ({

                    id:
                        user.id,

                    name:
                        user.name,

                    avatar:
                        user.avatar ||
                        null

                })
            )

    });

}


/* =====================================================
   WEBSOCKET CONNECTION
===================================================== */

wss.on(
    "connection",
    async (socket, request) => {

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


        /*
         * Vérification session.
         */

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


        /*
         * BIENVENUE
         */

        socket.send(
            JSON.stringify({

                type:
                    "system",

                message:
                    `Bienvenue ${username}.`

            })
        );


        /*
         * HISTORIQUE
         *
         * On le charge depuis GitHub.
         */

        try {

            const history =
                await loadChatHistory(
                    100
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
                "WS HISTORY:",
                error.message
            );

        }


        /*
         * JOIN
         */

        broadcast({

            type:
                "join",

            username:
                username,

            avatar:
                user.avatar ||
                null

        }, socket);


        sendUsers();


        /* =================================================
           MESSAGE
        ================================================= */

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


                /*
                 * MARLEY
                 */

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
                            currentUser.avatar ||
                            null

                    });

                    return;

                }


                /*
                 * SAUVEGARDE GITHUB
                 */

                await saveChatMessage(

                    currentUser.name,

                    message,

                    currentUser.avatar

                );


                /*
                 * ENVOI CHAT
                 */

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


                    try {

                        socket.ping();

                    } catch {

                        socket.terminate();

                    }

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
                        "Fichier trop volumineux."

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
                    "========================================"
                );

                console.log(
                    `Serveur lancé sur le port ${PORT}`
                );

                console.log(
                    "========================================"
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


                console.log(
                    "🎵 Dossier musique:",
                    MUSIC_FOLDER
                );


                console.log(
                    "🎵 API musique:",
                    "/api/music"
                );


                console.log(
                    "🎵 Upload musique:",
                    "/api/music/upload"
                );


                console.log(
                    "💬 Dossier chat:",
                    CHAT_LOG_FOLDER
                );


                console.log(
                    "💬 API chat:",
                    "/api/chat-history"
                );

                console.log(
                    "========================================"
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
