const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const multer = require("multer");

const app = express();

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
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

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

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

const MEDIA_FOLDER = "site_node/media";


/* =====================================================
   UPLOAD CONFIG
===================================================== */

const MAX_FILE_SIZE = 25 * 1024 * 1024;

const ALLOWED_TYPES = [

    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",

    "video/mp4",
    "video/webm",
    "video/quicktime"

];

const upload = multer({

    storage: multer.memoryStorage(),

    limits: {
        fileSize: MAX_FILE_SIZE
    },

    fileFilter: (req, file, callback) => {

        if (
            ALLOWED_TYPES.includes(
                file.mimetype
            )
        ) {

            callback(null, true);

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

app.get("/", (req, res) => {

    res.send(
        "Terminal server online."
    );

});


/* =====================================================
   DIR /S
===================================================== */

app.get("/api/files", (req, res) => {

    res.json(repoFiles);

});


/* =====================================================
   GITHUB API HELPER
===================================================== */

async function githubRequest(
    path,
    options = {}
) {

    if (!GITHUB_TOKEN) {

        throw new Error(
            "GITHUB_TOKEN manquant."
        );

    }

    const response =
        await fetch(
            `https://api.github.com${path}`,
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
            JSON.parse(text);

    } catch {

        data = {
            message: text
        };

    }


    if (!response.ok) {

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

app.get("/api/media", async (req, res) => {

    try {

        const data =
            await githubRequest(
                `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${MEDIA_FOLDER}?ref=${encodeURIComponent(GITHUB_BRANCH)}`
            );


        if (!Array.isArray(data)) {

            return res.json([]);

        }


        const files =
            data
                .filter(
                    file =>
                        file.type === "file"
                )
                .map(file => ({

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

                }));


        res.json(files);

    } catch (error) {

        console.error(
            "Erreur récupération médias:",
            error.message
        );

        res.status(500).json({

            error:
                "Impossible de récupérer les médias."

        });

    }

});


/* =====================================================
   UPLOAD MEDIA
===================================================== */

app.post(
    "/api/upload",
    upload.single("file"),
    async (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).json({

                    error:
                        "Aucun fichier envoyé."

                });

            }


            if (!GITHUB_TOKEN) {

                return res.status(500).json({

                    error:
                        "GITHUB_TOKEN n'est pas configuré."

                });

            }


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


            /*
             * Nettoyage du nom du fichier
             */

            let originalName =
                req.file.originalname
                    .replace(
                        /[^a-zA-Z0-9._-]/g,
                        "_"
                    )
                    .substring(
                        0,
                        100
                    );


            /*
             * Évite les noms vides
             */

            if (!originalName) {

                originalName =
                    "file";

            }


            /*
             * Timestamp pour éviter
             * les collisions.
             */

            const timestamp =
                Date.now();


            const filename =
                `${timestamp}_${username}_${originalName}`;


            const githubPath =
                `${MEDIA_FOLDER}/${filename}`;


            /*
             * Buffer -> Base64
             */

            const content =
                req.file.buffer.toString(
                    "base64"
                );


            /*
             * Envoi vers GitHub
             */

            const result =
                await githubRequest(
                    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubPath}`,
                    {

                        method: "PUT",

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


            console.log(
                `Upload réussi: ${filename}`
            );


            /*
             * Préviens tous les utilisateurs
             */

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
                "Erreur upload:",
                error
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
   UPLOAD ERROR HANDLER
===================================================== */

app.use(
    (error, req, res, next) => {

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


        if (error) {

            return res.status(400).json({

                error:
                    error.message

            });

        }


        next();

    }
);


/* =====================================================
   WEBSOCKET
===================================================== */

function broadcast(
    data,
    except = null
) {

    const message =
        JSON.stringify(data);


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


wss.on(
    "connection",
    socket => {

        console.log(
            "Nouvelle connexion"
        );


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


                    if (!user) return;


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


                    if (!message)
                        return;


                    /* =====================
                       EASTER EGG
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
           DISCONNECT
        ========================= */

        socket.on(
            "close",
            () => {

                const user =
                    users.get(
                        socket
                    );


                if (!user)
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

    }
);
