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
   🎵 MUSIC / WINAMP CONFIG
===================================================== */

const MAX_MUSIC_SIZE =
    25 * 1024 * 1024;


const ALLOWED_MUSIC_TYPES = [

    "audio/mpeg",
    "audio/mp3",

    "audio/wav",
    "audio/x-wav",

    "audio/ogg",

    "audio/opus",

    "audio/mp4",

    "audio/aac",

    "audio/flac",

    "audio/webm"

];


const ALLOWED_MUSIC_EXTENSIONS = [

    ".mp3",
    ".wav",
    ".ogg",
    ".opus",
    ".m4a",
    ".aac",
    ".flac",
    ".webm"

];


const musicUpload =
    multer({

        storage:
            multer.memoryStorage(),

        limits: {

            fileSize:
                MAX_MUSIC_SIZE

        },

        fileFilter:
            (req, file, callback) => {

                const extension =
                    path.extname(
                        file.originalname
                    )
                    .toLowerCase();


                const typeOK =
                    ALLOWED_MUSIC_TYPES.includes(
                        file.mimetype
                    );


                const extensionOK =
                    ALLOWED_MUSIC_EXTENSIONS.includes(
                        extension
                    );


                if (
                    typeOK ||
                    extensionOK
                ) {

                    callback(
                        null,
                        true
                    );

                } else {

                    callback(
                        new Error(
                            "Format audio non autorisé."
                        )
                    );

                }

            }

    });


/* =====================================================
   🎵 MUSIC LIST
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


            const music =
                data
                    .filter(
                        file =>
                            file.type ===
                            "file"
                    )
                    .filter(
                        file => {

                            const extension =
                                path.extname(
                                    file.name
                                )
                                .toLowerCase();


                            return ALLOWED_MUSIC_EXTENSIONS.includes(
                                extension
                            );

                        }
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
                                `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${file.path}`,

                            download_url:
                                file.download_url,

                            html_url:
                                file.html_url

                        })
                    );


            res.json(
                music
            );

        } catch (error) {

            /*
             * Si le dossier n'existe pas encore,
             * GitHub renvoie une erreur 404.
             *
             * Dans ce cas on renvoie simplement
             * une bibliothèque vide.
             */

            if (
                String(
                    error.message
                ).includes(
                    "Not Found"
                )
            ) {

                return res.json([]);

            }


            console.error(
                "MUSIC LIST:",
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
   🎵 MUSIC UPLOAD
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
                        "Aucune musique reçue."

                });

            }


            let filename =
                String(
                    req.body.customName ||
                    req.file.originalname ||
                    "musique"
                )
                    .trim();


            filename =
                filename
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


            const originalExtension =
                path.extname(
                    req.file.originalname
                )
                .toLowerCase();


            if (
                !path.extname(
                    filename
                )
            ) {

                filename +=
                    originalExtension;

            }


            const extension =
                path.extname(
                    filename
                )
                .toLowerCase();


            if (
                !ALLOWED_MUSIC_EXTENSIONS.includes(
                    extension
                )
            ) {

                return res.status(
                    400
                ).json({

                    error:
                        "Extension audio non autorisée."

                });

            }


            const githubPath =
                `${MUSIC_FOLDER}/${filename}`;


            const content =
                req.file.buffer.toString(
                    "base64"
                );


            console.log(
                "========================================"
            );

            console.log(
                "🎵 UPLOAD MUSIQUE"
            );

            console.log(
                "Fichier:",
                filename
            );

            console.log(
                "Chemin:",
                githubPath
            );

            console.log(
                "Taille:",
                req.file.size,
                "octets"
            );

            console.log(
                "Type:",
                req.file.mimetype
            );


            /*
             * On regarde si le fichier existe déjà.
             *
             * Cela permet de récupérer son SHA
             * et de le remplacer correctement.
             */

            let existingFile =
                null;


            try {

                existingFile =
                    await githubRequest(

                        `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubPath}?ref=${encodeURIComponent(GITHUB_BRANCH)}`

                    );

            } catch (error) {

                /*
                 * 404 = fichier inexistant.
                 * Ce n'est donc pas une erreur.
                 */

                if (
                    !String(
                        error.message
                    ).includes(
                        "Not Found"
                    )
                ) {

                    throw error;

                }

            }


            const body = {

                message:
                    existingFile
                        ? `Update music: ${filename}`
                        : `Upload music: ${filename}`,

                content:
                    content,

                branch:
                    GITHUB_BRANCH

            };


            if (
                existingFile &&
                existingFile.sha
            ) {

                body.sha =
                    existingFile.sha;

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


            console.log(
                "✅ MUSIQUE ENVOYÉE SUR GITHUB"
            );

            console.log(
                rawUrl
            );

            console.log(
                "========================================"
            );


            /*
             * On informe tous les Winamp connectés.
             */

            broadcast({

                type:
                    "music",

                action:
                    existingFile
                        ? "updated"
                        : "added",

                username:
                    req.session.username,

                name:
                    filename,

                path:
                    githubPath,

                url:
                    rawUrl,

                size:
                    req.file.size,

                mimetype:
                    req.file.mimetype,

                timestamp:
                    Date.now()

            });


            res.json({

                success:
                    true,

                action:
                    existingFile
                        ? "updated"
                        : "added",

                name:
                    filename,

                path:
                    githubPath,

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
                "❌ MUSIC UPLOAD:",
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
   🎵 MUSIC DELETE
===================================================== */

app.delete(
    "/api/music/:filename",
    requireAuth,
    async (req, res) => {

        try {

            const filename =
                path.basename(
                    String(
                        req.params.filename ||
                        ""
                    )
                );


            if (
                !filename
            ) {

                return res.status(
                    400
                ).json({

                    error:
                        "Nom de fichier invalide."

                });

            }


            const extension =
                path.extname(
                    filename
                )
                .toLowerCase();


            if (
                !ALLOWED_MUSIC_EXTENSIONS.includes(
                    extension
                )
            ) {

                return res.status(
                    400
                ).json({

                    error:
                        "Fichier audio non autorisé."

                });

            }


            const githubPath =
                `${MUSIC_FOLDER}/${filename}`;


            /*
             * On récupère le SHA obligatoire
             * pour supprimer un fichier GitHub.
             */

            const existing =
                await githubRequest(

                    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubPath}?ref=${encodeURIComponent(GITHUB_BRANCH)}`

                );


            if (
                !existing ||
                !existing.sha
            ) {

                return res.status(
                    404
                ).json({

                    error:
                        "Musique introuvable."

                });

            }


            await githubRequest(

                `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubPath}`,

                {

                    method:
                        "DELETE",

                    headers: {

                        "Content-Type":
                            "application/json"

                    },

                    body:
                        JSON.stringify({

                            message:
                                `Delete music: ${filename}`,

                            sha:
                                existing.sha,

                            branch:
                                GITHUB_BRANCH

                        })

                }

            );


            broadcast({

                type:
                    "music",

                action:
                    "deleted",

                name:
                    filename,

                path:
                    githubPath,

                username:
                    req.session.username,

                timestamp:
                    Date.now()

            });


            res.json({

                success:
                    true,

                name:
                    filename

            });

        } catch (error) {

            console.error(
                "MUSIC DELETE:",
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
   CHAT LOG — GITHUB JSON
===================================================== */

const CHAT_LOG_FOLDER =
    "site_node/chat_logs";

const CHAT_LOG_MAX_SIZE =
    10 * 1024 * 1024; // 10 Mo

const CHAT_HISTORY_LIMIT =
    100;


/* =====================================================
   GITHUB CHAT LOG CACHE
===================================================== */

/*
 * Cache temporaire en mémoire du dernier fichier.
 *
 * Le fichier réel reste sur GitHub.
 * Le cache évite de télécharger le même fichier
 * à chaque nouveau message.
 */

let chatLogCache = {

    path: null,

    sha: null,

    messages: []

};


/* =====================================================
   NETTOYAGE NOM FICHIER
===================================================== */

function chatLogFilename(
    number
) {

    return `chat_${String(
        number
    ).padStart(
        4,
        "0"
    )}.json`;

}


/* =====================================================
   RÉCUPÉRER LES FICHIERS CHAT SUR GITHUB
===================================================== */

async function getChatLogFiles() {

    try {

        const data =
            await githubRequest(

                `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CHAT_LOG_FOLDER}?ref=${encodeURIComponent(
                    GITHUB_BRANCH
                )}`

            );


        if (
            !Array.isArray(data)
        ) {

            return [];

        }


        return data

            .filter(
                file =>
                    file.type === "file" &&
                    /^chat_\d+\.json$/i.test(
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

                    return numberA - numberB;

                }
            );

    } catch (error) {

        /*
         * Si le dossier n'existe pas encore,
         * GitHub renvoie généralement 404.
         */

        if (
            error.message &&
            error.message.includes("Not Found")
        ) {

            return [];

        }


        console.error(
            "Erreur récupération logs GitHub:",
            error.message
        );

        throw error;

    }

}


/* =====================================================
   CRÉER LE PREMIER FICHIER CHAT
===================================================== */

async function createChatLogFile(
    number
) {

    const filename =
        chatLogFilename(
            number
        );

    const githubPath =
        `${CHAT_LOG_FOLDER}/${filename}`;


    const content =
        JSON.stringify(
            [],
            null,
            2
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
                            `Create chat log ${filename}`,

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
        `📄 Nouveau fichier GitHub créé : ${githubPath}`
    );


    return {

        path:
            githubPath,

        sha:
            result.content?.sha ||
            null,

        messages:
            []

    };

}


/* =====================================================
   LIRE UN LOG GITHUB
===================================================== */

async function readChatLogFile(
    file
) {

    try {

        const data =
            await githubRequest(

                `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${file.path}?ref=${encodeURIComponent(
                    GITHUB_BRANCH
                )}`

            );


        let messages = [];


        if (
            data.content
        ) {

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
                decoded.trim()
            ) {

                try {

                    const parsed =
                        JSON.parse(
                            decoded
                        );


                    if (
                        Array.isArray(
                            parsed
                        )
                    ) {

                        messages =
                            parsed;

                    }

                } catch (error) {

                    console.error(
                        `JSON invalide dans ${file.name}:`,
                        error.message
                    );

                    messages = [];

                }

            }

        }


        return {

            path:
                file.path,

            sha:
                data.sha,

            messages:
                messages

        };

    } catch (error) {

        console.error(
            `Erreur lecture ${file.name}:`,
            error.message
        );

        return {

            path:
                file.path,

            sha:
                file.sha || null,

            messages:
                []

        };

    }

}


/* =====================================================
   OBTENIR LE DERNIER FICHIER
===================================================== */

async function getLastChatLog() {

    const files =
        await getChatLogFiles();


    /*
     * Aucun fichier.
     * On crée chat_0001.json.
     */

    if (
        !files.length
    ) {

        return await createChatLogFile(
            1
        );

    }


    const lastFile =
        files[
            files.length - 1
        ];


    /*
     * Utilisation du cache si possible.
     */

    if (
        chatLogCache.path ===
        lastFile.path &&
        chatLogCache.sha ===
        lastFile.sha
    ) {

        return {

            path:
                chatLogCache.path,

            sha:
                chatLogCache.sha,

            messages:
                chatLogCache.messages

        };

    }


    const log =
        await readChatLogFile(
            lastFile
        );


    chatLogCache = {

        path:
            log.path,

        sha:
            log.sha,

        messages:
            log.messages

    };


    return log;

}


/* =====================================================
   SAUVEGARDER UN LOG SUR GITHUB
===================================================== */

async function saveChatLogToGitHub(
    filePath,
    messages,
    sha,
    commitMessage
) {

    const content =
        JSON.stringify(
            messages,
            null,
            2
        );


    const encoded =
        Buffer
            .from(
                content,
                "utf8"
            )
            .toString(
                "base64"
            );


    const body = {

        message:
            commitMessage,

        content:
            encoded,

        branch:
            GITHUB_BRANCH

    };


    /*
     * Pour modifier un fichier existant,
     * GitHub exige son SHA.
     */

    if (
        sha
    ) {

        body.sha =
            sha;

    }


    const result =
        await githubRequest(

            `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`,

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


    const newSha =
        result.content?.sha ||
        null;


    chatLogCache = {

        path:
            filePath,

        sha:
            newSha,

        messages:
            messages

    };


    return {

        sha:
            newSha,

        content:
            content

    };

}


/* =====================================================
   SAUVEGARDE MESSAGE
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


        /*
         * Récupération du dernier fichier.
         */

        let log =
            await getLastChatLog();


        let messages =
            Array.isArray(
                log.messages
            )
                ? [
                    ...log.messages
                ]
                : [];


        messages.push(
            chatMessage
        );


        /*
         * Calcul de la nouvelle taille.
         */

        let content =
            JSON.stringify(
                messages,
                null,
                2
            );


        const size =
            Buffer.byteLength(
                content,
                "utf8"
            );


        /*
         * Si le fichier dépasse 10 Mo,
         * on crée le suivant.
         */

        if (
            size >
            CHAT_LOG_MAX_SIZE
        ) {

            const files =
                await getChatLogFiles();


            let nextNumber =
                1;


            if (
                files.length
            ) {

                const numbers =
                    files.map(
                        file =>
                            parseInt(
                                file.name.match(
                                    /\d+/
                                )[0]
                            )
                    );


                nextNumber =
                    Math.max(
                        ...numbers
                    ) + 1;

            }


            const newLog =
                await createChatLogFile(
                    nextNumber
                );


            log =
                newLog;


            messages = [
                chatMessage
            ];


            content =
                JSON.stringify(
                    messages,
                    null,
                    2
                );


            /*
             * Sauvegarde dans le nouveau fichier.
             */

            await saveChatLogToGitHub(

                log.path,

                messages,

                log.sha,

                `Add message to ${path.basename(
                    log.path
                )}`

            );

        } else {

            /*
             * Modification du fichier actuel.
             */

            await saveChatLogToGitHub(

                log.path,

                messages,

                log.sha,

                `Add message to ${path.basename(
                    log.path
                )}`

            );

        }


        console.log(
            `💬 Message sauvegardé sur GitHub : ${log.path}`
        );


    } catch (error) {

        console.error(
            "❌ Erreur sauvegarde chat GitHub:",
            error
        );

    }

}


/* =====================================================
   HISTORIQUE PROGRESSIF
===================================================== */

async function loadChatHistory(
    limit = CHAT_HISTORY_LIMIT
) {

    try {

        const files =
            await getChatLogFiles();


        if (
            !files.length
        ) {

            return [];

        }


        const history = [];


        /*
         * On commence par le fichier
         * le plus récent.
         *
         * On ne télécharge donc pas
         * inutilement tous les anciens logs.
         */

        for (
            let i =
                files.length - 1;

            i >= 0;

            i--
        ) {

            const log =
                await readChatLogFile(
                    files[i]
                );


            if (
                Array.isArray(
                    log.messages
                )
            ) {

                history.unshift(
                    ...log.messages
                );

            }


            /*
             * Dès qu'on possède suffisamment
             * de messages, on arrête.
             */

            if (
                history.length >=
                limit
            ) {

                break;

            }

        }


        /*
         * Seulement les derniers messages.
         */

        if (
            history.length >
            limit
        ) {

            return history.slice(
                -limit
            );

        }


        return history;

    } catch (error) {

        console.error(
            "❌ Erreur chargement historique:",
            error
        );

        return [];

    }

}
/* =====================================================
   SAVE CHAT MESSAGE
===================================================== */

function await saveChatMessage(
    currentUser.name,
    message,
    currentUser.avatar
);

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
   CHAT HISTORY API
===================================================== */

app.get(
    "/api/chat-history",
    (req, res) => {

        try {

            res.json(
                loadChatHistory(
                    100
                )
            );

        } catch (error) {

            console.error(
                "CHAT HISTORY:",
                error
            );

            res.status(
                500
            ).json({

                error:
                    "Impossible de charger l'historique."

            });

        }

    }
);


/* =====================================================
   CHAT HISTORY ALIAS
===================================================== */

app.get(
    "/api/chat/history",
    (req, res) => {

        try {

            res.json(
                loadChatHistory(
                    100
                )
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
                    "Impossible de charger l'historique."

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
                    data.type ===
                    "chat"
                ) {

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


                    /* =========================================
                       MARLEY
                    ========================================= */

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


                    /* =========================================
                       SAUVEGARDE
                    ========================================= */

                    saveChatMessage(

                        currentUser.name,

                        message,

                        currentUser.avatar

                    );


                    /* =========================================
                       ENVOI CHAT
                    ========================================= */

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

                    return;

                }


                /*
                 * Le type music est normalement envoyé
                 * par HTTP et non par WebSocket.
                 *
                 * On ne permet donc pas aux clients
                 * de créer eux-mêmes des fichiers.
                 */

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

                /*
                 * Cette route peut être utilisée
                 * par les médias OU la musique.
                 */

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
