<!DOCTYPE html>
<html lang="fr">

<head>

<meta charset="UTF-8">

<meta name="viewport"
      content="width=device-width, initial-scale=1.0">

<title>TERMINAL // NETWORK</title>

<style>

/* =====================================================
   BASE
===================================================== */

* {
    box-sizing: border-box;
}

html,
body {
    margin: 0;
    width: 100%;
    height: 100%;
}

body {

    background: #020302;

    color: #00ff66;

    font-family:
        "Courier New",
        monospace;

    overflow: hidden;

    text-shadow:
        0 0 4px rgba(0,255,102,.5);
}


/* =====================================================
   CRT
===================================================== */

#crt {

    position: fixed;

    inset: 0;

    overflow: hidden;

    border-radius: 4%;

    transform:
        perspective(900px)
        scale(.985);

    background:
        radial-gradient(
            ellipse at center,
            rgba(0,40,15,.25),
            rgba(0,0,0,.95)
        );

    box-shadow:
        inset 0 0 100px rgba(0,0,0,.95),
        inset 0 0 30px rgba(0,255,100,.08),
        0 0 30px #000;
}

#crt::before {

    content: "";

    position: absolute;

    inset: -5%;

    pointer-events: none;

    z-index: 900;

    border-radius: 8%;

    background:
        radial-gradient(
            ellipse at center,
            transparent 55%,
            rgba(0,0,0,.15) 75%,
            rgba(0,0,0,.75) 100%
        );
}


/* =====================================================
   SCANLINES
===================================================== */

#scanlines {

    position: fixed;

    inset: 0;

    pointer-events: none;

    z-index: 950;

    background:
        repeating-linear-gradient(
            to bottom,
            rgba(255,255,255,.025) 0px,
            rgba(255,255,255,.025) 1px,
            rgba(0,0,0,.13) 2px,
            rgba(0,0,0,.13) 4px
        );

    animation:
        scanMove .12s linear infinite;
}

@keyframes scanMove {

    from {
        transform: translateY(0);
    }

    to {
        transform: translateY(4px);
    }
}


/* =====================================================
   VHS
===================================================== */

#vhs {

    position: fixed;

    inset: 0;

    pointer-events: none;

    z-index: 960;

    opacity: .12;

    background-image:
        repeating-linear-gradient(
            0deg,
            transparent 0px,
            transparent 2px,
            rgba(255,255,255,.12) 3px
        );

    animation:
        vhsMove .15s steps(2) infinite;
}

@keyframes vhsMove {

    0% {
        transform: translate(0,0);
    }

    25% {
        transform: translate(2px,-1px);
    }

    50% {
        transform: translate(-1px,1px);
    }

    75% {
        transform: translate(1px,0);
    }

    100% {
        transform: translate(0,0);
    }
}


/* =====================================================
   RGB GLITCH
===================================================== */

#rgb-glitch {

    position: fixed;

    inset: 0;

    pointer-events: none;

    z-index: 970;

    mix-blend-mode: screen;

    opacity: .04;

    background:
        linear-gradient(
            90deg,
            rgba(255,0,0,.5),
            transparent 30%,
            transparent 70%,
            rgba(0,0,255,.5)
        );

    animation:
        rgbShift 3s infinite steps(2);
}

@keyframes rgbShift {

    0%,95%,100% {
        transform: translateX(0);
    }

    96% {
        transform: translateX(4px);
    }

    97% {
        transform: translateX(-3px);
    }

    98% {
        transform: translateX(2px);
    }
}


/* =====================================================
   BOOT
===================================================== */

#boot {

    position: fixed;

    inset: 0;

    z-index: 500;

    display: flex;

    flex-direction: column;

    justify-content: center;

    align-items: center;

    background: #020302;
}

#bootText {

    width: min(700px,90%);

    line-height: 1.5;

    margin-bottom: 25px;

    white-space: pre-wrap;
}

#bootBar {

    width: min(700px,90%);

    height: 20px;

    border: 1px solid #00ff66;

    padding: 2px;
}

#bootProgress {

    height: 100%;

    width: 0%;

    background: #00ff66;

    box-shadow:
        0 0 10px #00ff66;

    transition: width .08s linear;
}

#bootPercent {
    margin-top: 10px;
}


/* =====================================================
   APP
===================================================== */

#app {

    position: fixed;

    inset: 0;

    z-index: 10;

    display: none;

    padding: 15px;

    gap: 12px;

    grid-template-columns:
        1.4fr
        1fr
        1fr;

    grid-template-rows:
        55px
        1fr
        1fr
        180px;
}


/* =====================================================
   HEADER
===================================================== */

#header {

    grid-column: 1 / 4;

    border: 1px solid #00ff66;

    display: flex;

    align-items: center;

    justify-content: space-between;

    padding: 0 15px;

    background:
        rgba(0,15,5,.75);

    box-shadow:
        0 0 12px rgba(0,255,102,.12);
}

#title {

    font-size: 18px;

    font-weight: bold;
}

#connection {
    font-size: 13px;
}


/* =====================================================
   PANELS
===================================================== */

.panel {

    position: relative;

    min-width: 0;

    min-height: 0;

    border: 1px solid #00ff66;

    background:
        rgba(0,10,4,.82);

    overflow: hidden;

    box-shadow:
        inset 0 0 25px rgba(0,255,102,.04);
}

.panelTitle {

    height: 32px;

    border-bottom:
        1px solid #00ff66;

    display: flex;

    align-items: center;

    padding-left: 10px;

    background:
        rgba(0,255,102,.06);

    font-weight: bold;

    font-size: 13px;
}


/* =====================================================
   TERMINAL
===================================================== */

#terminalPanel {

    grid-column: 1;

    grid-row: 2;
}

#terminalOutput {

    position: absolute;

    top: 32px;

    bottom: 40px;

    left: 0;

    right: 0;

    padding: 10px;

    overflow-y: auto;

    white-space: pre-wrap;

    scrollbar-width: thin;
}

#terminalInputLine {

    position: absolute;

    bottom: 0;

    left: 0;

    right: 0;

    height: 40px;

    display: flex;

    align-items: center;

    padding: 0 10px;

    border-top:
        1px solid rgba(0,255,102,.4);
}

#terminalInput {

    flex: 1;

    background: transparent;

    border: none;

    outline: none;

    color: #00ff66;

    font-family:
        "Courier New",
        monospace;

    font-size: 14px;
}


/* =====================================================
   CHAT
===================================================== */

#chatPanel {

    grid-column: 2;

    grid-row: 2;
}

#chatMessages {

    position: absolute;

    top: 32px;

    bottom: 42px;

    left: 0;

    right: 0;

    padding: 10px;

    overflow-y: auto;

    white-space: pre-wrap;
}

#chatInputLine {

    position: absolute;

    bottom: 0;

    left: 0;

    right: 0;

    height: 42px;

    display: flex;

    border-top:
        1px solid rgba(0,255,102,.4);
}

#chatInput {

    flex: 1;

    background: transparent;

    border: none;

    outline: none;

    color: #00ff66;

    padding: 0 10px;

    font-family:
        "Courier New",
        monospace;
}


/* =====================================================
   USERS
===================================================== */

#usersPanel {

    grid-column: 3;

    grid-row: 2;
}

#usersList {

    padding: 10px;

    overflow-y: auto;

    height:
        calc(100% - 32px);
}


/* =====================================================
   MEDIA
===================================================== */

#mediaPanel {

    grid-column: 1 / 3;

    grid-row: 3;
}

#mediaContent {

    position: absolute;

    inset: 32px 0 0 0;

    display: flex;

    flex-direction: column;

    overflow: hidden;
}

#mediaControls {

    padding: 8px;

    border-bottom:
        1px solid rgba(0,255,102,.35);

    display: flex;

    gap: 8px;

    align-items: center;

    flex-wrap: wrap;
}

#mediaFile {

    max-width: 220px;

    color: #00ff66;

    font-family:
        "Courier New",
        monospace;
}

.mediaButton {

    background: #001a08;

    color: #00ff66;

    border: 1px solid #00ff66;

    padding: 5px 10px;

    font-family:
        "Courier New",
        monospace;

    cursor: pointer;
}

.mediaButton:hover {

    background: #00ff66;

    color: #001a08;
}

#mediaStatus {

    font-size: 11px;

    width: 100%;
}

#mediaProgress {

    width: 100%;

    height: 8px;

    border: 1px solid #00ff66;

    display: none;
}

#mediaProgressBar {

    height: 100%;

    width: 0%;

    background: #00ff66;

    box-shadow:
        0 0 8px #00ff66;
}

#mediaList {

    flex: 1;

    overflow-y: auto;

    padding: 8px;

    display: grid;

    grid-template-columns:
        repeat(auto-fill,minmax(130px,1fr));

    gap: 8px;
}

.mediaItem {

    border:
        1px solid rgba(0,255,102,.5);

    padding: 6px;

    min-width: 0;

    background:
        rgba(0,20,7,.7);
}

.mediaPreview {

    width: 100%;

    height: 90px;

    object-fit: contain;

    background: #000;

    display: block;

    margin-bottom: 5px;
}

.mediaName {

    font-size: 10px;

    word-break: break-all;

    margin-bottom: 4px;
}

.mediaInfo {

    font-size: 9px;

    opacity: .7;

    margin-bottom: 5px;
}

.mediaOpen {

    color: #00ff66;

    font-size: 10px;
}


/* =====================================================
   DIR
===================================================== */

#dirPanel {

    grid-column: 3;

    grid-row: 3 / 5;
}

#dirOutput {

    position: absolute;

    inset: 32px 0 0 0;

    overflow: hidden;

    padding: 10px;

    font-size: 12px;

    line-height: 1.35;
}

.dirLine {

    opacity: .8;

    animation:
        dirAppear .2s linear;
}

@keyframes dirAppear {

    from {
        opacity: 0;
    }

    to {
        opacity: .8;
    }
}


/* =====================================================
   MATRIX
===================================================== */

#matrixPanel {

    grid-column: 1 / 3;

    grid-row: 4;
}

#matrix {

    position: absolute;

    inset: 32px 0 0 0;

    width: 100%;

    height:
        calc(100% - 32px);
}


/* =====================================================
   MARLEY
===================================================== */

#marley {

    position: fixed;

    inset: 0;

    z-index: 800;

    display: none;

    align-items: center;

    justify-content: center;

    pointer-events: none;

    background:
        radial-gradient(
            circle,
            rgba(255,0,120,.25),
            transparent 65%
        );
}

#marleyText {

    font-size:
        clamp(30px,8vw,100px);

    text-align: center;

    font-weight: bold;

    animation:
        marleyAnim 3s ease forwards;
}

@keyframes marleyAnim {

    0% {
        opacity: 0;
        transform:
            scale(.1)
            rotate(-30deg);
    }

    25% {
        opacity: 1;
        transform:
            scale(1.3)
            rotate(10deg);
    }

    50% {
        transform:
            scale(1)
            rotate(-5deg);
    }

    75% {
        opacity: 1;
        transform:
            scale(1.1);
    }

    100% {
        opacity: 0;
        transform:
            scale(1.5);
    }
}


/* =====================================================
   MOBILE
===================================================== */

@media (max-width: 900px) {

    body {
        overflow: auto;
    }

    #app {

        position: relative;

        min-height: 100vh;

        grid-template-columns:
            1fr 1fr;

        grid-template-rows:
            55px
            350px
            350px
            300px
            300px;

    }

    #header {
        grid-column: 1 / 3;
    }

    #terminalPanel {
        grid-column: 1;
        grid-row: 2;
    }

    #chatPanel {
        grid-column: 2;
        grid-row: 2;
    }

    #usersPanel {
        grid-column: 1 / 3;
        grid-row: 3;
    }

    #mediaPanel {
        grid-column: 1 / 3;
        grid-row: 4;
    }

    #matrixPanel {
        grid-column: 1;
        grid-row: 5;
    }

    #dirPanel {
        grid-column: 2;
        grid-row: 5;
    }

}

</style>

</head>

<body>


<div id="crt">

<div id="app">


<!-- =====================================================
     HEADER
===================================================== -->

<div id="header">

    <div id="title">
        TERMINAL // NETWORK
    </div>

    <div id="connection">
        OFFLINE
    </div>

</div>


<!-- =====================================================
     TERMINAL
===================================================== -->

<div
    id="terminalPanel"
    class="panel">

    <div class="panelTitle">
        [ TERMINAL ]
    </div>

    <div id="terminalOutput"></div>

    <div id="terminalInputLine">

        <span id="terminalPrompt">
            guest@terminal:~$
        </span>

        <input
            id="terminalInput"
            autocomplete="off"
        >

    </div>

</div>


<!-- =====================================================
     CHAT
===================================================== -->

<div
    id="chatPanel"
    class="panel">

    <div class="panelTitle">
        [ PROXIMITY CHAT ]
    </div>

    <div id="chatMessages"></div>

    <div id="chatInputLine">

        <input
            id="chatInput"
            placeholder="message..."
            autocomplete="off"
        >

    </div>

</div>


<!-- =====================================================
     USERS
===================================================== -->

<div
    id="usersPanel"
    class="panel">

    <div class="panelTitle">
        [ USERS ONLINE ]
    </div>

    <div id="usersList">
        SYSTEM: 0 USERS
    </div>

</div>


<!-- =====================================================
     MEDIA
===================================================== -->

<div
    id="mediaPanel"
    class="panel">

    <div class="panelTitle">
        [ MEDIA // GITHUB ]
    </div>

    <div id="mediaContent">

        <div id="mediaControls">

            <input
                type="file"
                id="mediaFile"
                accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
            >

            <button
                class="mediaButton"
                id="uploadButton">
                UPLOAD
            </button>

            <button
                class="mediaButton"
                id="refreshMedia">
                REFRESH
            </button>

            <div id="mediaStatus">
                READY.
            </div>

            <div id="mediaProgress">

                <div id="mediaProgressBar"></div>

            </div>

        </div>

        <div id="mediaList"></div>

    </div>

</div>


<!-- =====================================================
     DIR
===================================================== -->

<div
    id="dirPanel"
    class="panel">

    <div class="panelTitle">
        [ DIR /S // LIVE ]
    </div>

    <div id="dirOutput"></div>

</div>


<!-- =====================================================
     MATRIX
===================================================== -->

<div
    id="matrixPanel"
    class="panel">

    <div class="panelTitle">
        [ MATRIX ]
    </div>

    <canvas id="matrix"></canvas>

</div>


</div>
</div>


<!-- =====================================================
     BOOT
===================================================== -->

<div id="boot">

    <div id="bootText">
BOOTING TERMINAL...

INITIALIZING SYSTEM...
    </div>

    <div id="bootBar">

        <div id="bootProgress"></div>

    </div>

    <div id="bootPercent">
        0%
    </div>

</div>


<div id="scanlines"></div>

<div id="vhs"></div>

<div id="rgb-glitch"></div>


<!-- =====================================================
     MARLEY
===================================================== -->

<div id="marley">

    <div id="marleyText">
        ❤️ I LOVE YOU MARLEY ❤️
    </div>

</div>


<script>

/* =====================================================
   CONFIG
===================================================== */

const SERVER =
    "wss://site-node-ph5r.onrender.com";

const API =
    "https://site-node-ph5r.onrender.com";


/* =====================================================
   VARIABLES
===================================================== */

let socket = null;

let username = "";

let reconnectTimer = null;

let dirFiles = [];

let dirIndex = 0;


/* =====================================================
   ELEMENTS
===================================================== */

const boot =
    document.getElementById("boot");

const bootText =
    document.getElementById("bootText");

const bootProgress =
    document.getElementById("bootProgress");

const bootPercent =
    document.getElementById("bootPercent");

const app =
    document.getElementById("app");

const terminalOutput =
    document.getElementById("terminalOutput");

const terminalInput =
    document.getElementById("terminalInput");

const terminalPrompt =
    document.getElementById("terminalPrompt");

const chatMessages =
    document.getElementById("chatMessages");

const chatInput =
    document.getElementById("chatInput");

const usersList =
    document.getElementById("usersList");

const connection =
    document.getElementById("connection");

const dirOutput =
    document.getElementById("dirOutput");

const mediaFile =
    document.getElementById("mediaFile");

const uploadButton =
    document.getElementById("uploadButton");

const refreshMedia =
    document.getElementById("refreshMedia");

const mediaStatus =
    document.getElementById("mediaStatus");

const mediaProgress =
    document.getElementById("mediaProgress");

const mediaProgressBar =
    document.getElementById("mediaProgressBar");

const mediaList =
    document.getElementById("mediaList");


/* =====================================================
   BOOT
===================================================== */

async function bootAnimation() {

    const steps = [

        "BOOTING...",

        "CHECKING MEMORY...",

        "LOADING TERMINAL...",

        "LOADING CHAT...",

        "LOADING MEDIA SYSTEM...",

        "LOADING MATRIX...",

        "LOADING FILE SYSTEM...",

        "INITIALIZING NETWORK...",

        "READY."

    ];


    for (
        let i = 0;
        i <= 100;
        i++
    ) {

        bootProgress.style.width =
            i + "%";

        bootPercent.textContent =
            i + "%";


        if (
            i % 12 === 0
        ) {

            const index =
                Math.floor(i / 12);

            bootText.textContent =
                steps[
                    Math.min(
                        index,
                        steps.length - 1
                    )
                ];

        }


        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    20
                )
        );

    }


    await new Promise(
        resolve =>
            setTimeout(
                resolve,
                500
            )
    );


    boot.style.display =
        "none";

    app.style.display =
        "grid";


    startMatrix();

    startInfiniteDir();

    loadMedia();

    connect();

}


/* =====================================================
   TERMINAL
===================================================== */

function terminalPrint(text) {

    const line =
        document.createElement("div");

    line.textContent =
        text;

    terminalOutput.appendChild(
        line
    );

    terminalOutput.scrollTop =
        terminalOutput.scrollHeight;

}


/* =====================================================
   CHAT
===================================================== */

function chatPrint(
    user,
    message
) {

    const line =
        document.createElement("div");

    line.textContent =
        "[" +
        user +
        "] " +
        message;

    chatMessages.appendChild(
        line
    );

    chatMessages.scrollTop =
        chatMessages.scrollHeight;

}


/* =====================================================
   CONNECT
===================================================== */

function connect() {

    username =
        prompt(
            "Choisis ton username temporaire :"
        );


    if (!username) {

        username =
            "guest";

    }


    username =
        username
            .replace(/[<>]/g, "")
            .substring(0,20);


    terminalPrompt.textContent =
        username +
        "@terminal:~$";


    terminalPrint(
        "Initialisation..."
    );

    terminalPrint(
        "Connexion au serveur..."
    );


    socket =
        new WebSocket(
            SERVER
        );


    socket.onopen = () => {

        connection.textContent =
            "● ONLINE";


        terminalPrint(
            "[OK] Serveur connecté."
        );


        socket.send(
            JSON.stringify({

                type:
                    "join",

                username:
                    username

            })
        );


        terminalInput.focus();

    };


    socket.onmessage = event => {

        let data;

        try {

            data =
                JSON.parse(
                    event.data
                );

        } catch {

            return;

        }


        if (
            data.type ===
            "system"
        ) {

            terminalPrint(
                "[SYSTEM] " +
                data.message
            );

        }


        if (
            data.type ===
            "join"
        ) {

            terminalPrint(
                "[+] " +
                data.username +
                " vient de rejoindre."
            );

        }


        if (
            data.type ===
            "leave"
        ) {

            terminalPrint(
                "[-] " +
                data.username +
                " est parti."
            );

        }


        if (
            data.type ===
            "chat"
        ) {

            chatPrint(
                data.username,
                data.message
            );

        }


        if (
            data.type ===
            "users"
        ) {

            usersList.textContent =
                "SYSTEM: " +
                data.users.length +
                " USERS\n\n" +
                data.users.join("\n");

        }


        if (
            data.type ===
            "marley"
        ) {

            terminalPrint(
                "[EASTER EGG] " +
                data.username +
                " a trouvé quelque chose..."
            );

            marleyAnimation();

        }


        /* NOUVEAU MEDIA */

        if (
            data.type ===
            "media"
        ) {

            terminalPrint(
                "[MEDIA] " +
                data.username +
                " a uploadé " +
                data.name
            );

            addMedia(data);

        }

    };


    socket.onerror = () => {

        connection.textContent =
            "● ERROR";

        terminalPrint(
            "[ERROR] WebSocket error."
        );

    };


    socket.onclose = () => {

        connection.textContent =
            "● OFFLINE";

        terminalPrint(
            "[SYSTEM] Connexion perdue."
        );


        if (
            !reconnectTimer
        ) {

            reconnectTimer =
                setTimeout(
                    () => {

                        reconnectTimer =
                            null;

                        terminalPrint(
                            "[SYSTEM] Reconnexion..."
                        );

                        connect();

                    },
                    5000
                );

        }

    };

}


/* =====================================================
   CHAT SEND
===================================================== */

function sendChat(message) {

    if (
        !socket ||
        socket.readyState !==
        WebSocket.OPEN
    ) {

        return;

    }


    socket.send(
        JSON.stringify({

            type:
                "chat",

            message:
                message

        })
    );

}


/* =====================================================
   TERMINAL COMMANDS
===================================================== */

async function terminalCommand(
    command
) {

    const lower =
        command
            .trim()
            .toLowerCase();


    terminalPrint(
        terminalPrompt.textContent +
        " " +
        command
    );


    if (
        lower ===
        "dir /s"
    ) {

        try {

            const response =
                await fetch(
                    API +
                    "/api/files"
                );

            const files =
                await response.json();


            files.forEach(
                file =>
                    terminalPrint(file)
            );

        } catch {

            terminalPrint(
                "[ERROR] FILE SYSTEM OFFLINE."
            );

        }

        return;

    }


    if (
        lower ===
        "media"
    ) {

        loadMedia();

        terminalPrint(
            "[MEDIA] Liste actualisée."
        );

        return;

    }


    if (
        lower ===
        "clear"
    ) {

        terminalOutput.innerHTML =
            "";

        return;

    }


    if (
        lower ===
        "help"
    ) {

        terminalPrint(
            "AVAILABLE COMMANDS:"
        );

        terminalPrint(
            "dir /s"
        );

        terminalPrint(
            "media"
        );

        terminalPrint(
            "clear"
        );

        terminalPrint(
            "help"
        );

        terminalPrint(
            "chat <message>"
        );

        return;

    }


    if (
        lower
            .replace(
                /[.!?]+$/g,
                ""
            )
            .trim() ===
        "i love you marley"
    ) {

        sendChat(command);

        return;

    }


    if (
        lower.startsWith("chat ")
    ) {

        sendChat(
            command.substring(5)
        );

        return;

    }


    sendChat(command);

}


/* =====================================================
   INPUTS
===================================================== */

terminalInput.addEventListener(
    "keydown",
    event => {

        if (
            event.key !== "Enter"
        )
            return;


        const command =
            terminalInput.value.trim();


        terminalInput.value = "";


        if (command)
            terminalCommand(command);

    }
);


chatInput.addEventListener(
    "keydown",
    event => {

        if (
            event.key !== "Enter"
        )
            return;


        const message =
            chatInput.value.trim();


        chatInput.value = "";


        if (message)
            sendChat(message);

    }
);


/* =====================================================
   MEDIA HELPERS
===================================================== */

function formatSize(bytes) {

    if (bytes < 1024)
        return bytes + " B";

    if (bytes < 1024 * 1024)
        return (
            (bytes / 1024).toFixed(1)
            + " KB"
        );

    return (
        (bytes / 1024 / 1024).toFixed(2)
        + " MB"
    );

}


function isVideo(file) {

    const name =
        file.name.toLowerCase();

    return (
        name.endsWith(".mp4") ||
        name.endsWith(".webm") ||
        name.endsWith(".mov")
    );

}


/* =====================================================
   MEDIA DISPLAY
===================================================== */

function addMedia(file) {

    if (
        document.querySelector(
            `[data-media-path="${CSS.escape(file.path || file.name)}"]`
        )
    ) {

        return;

    }


    const item =
        document.createElement("div");

    item.className =
        "mediaItem";

    item.dataset.mediaPath =
        file.path || file.name;


    let preview;


    if (isVideo(file)) {

        preview =
            document.createElement("video");

        preview.controls =
            true;

        preview.preload =
            "metadata";

    } else {

        preview =
            document.createElement("img");

        preview.alt =
            file.name;

    }


    preview.className =
        "mediaPreview";

    preview.src =
        file.url;


    const name =
        document.createElement("div");

    name.className =
        "mediaName";

    name.textContent =
        file.name;


    const info =
        document.createElement("div");

    info.className =
        "mediaInfo";

    info.textContent =
        formatSize(
            file.size || 0
        );


    const link =
        document.createElement("a");

    link.className =
        "mediaOpen";

    link.href =
        file.url;

    link.target =
        "_blank";

    link.rel =
        "noopener";

    link.textContent =
        "[ OPEN ]";


    item.appendChild(preview);

    item.appendChild(name);

    item.appendChild(info);

    item.appendChild(link);


    mediaList.prepend(item);

}


/* =====================================================
   LOAD MEDIA
===================================================== */

async function loadMedia() {

    mediaStatus.textContent =
        "LOADING MEDIA...";


    try {

        const response =
            await fetch(
                API +
                "/api/media?" +
                Date.now()
            );


        if (!response.ok) {

            throw new Error(
                "HTTP " +
                response.status
            );

        }


        const files =
            await response.json();


        mediaList.innerHTML =
            "";


        files.forEach(
            addMedia
        );


        mediaStatus.textContent =
            files.length +
            " MEDIA FOUND.";

    } catch (error) {

        console.error(error);

        mediaStatus.textContent =
            "[ERROR] MEDIA OFFLINE.";

    }

}


/* =====================================================
   UPLOAD
===================================================== */

uploadButton.addEventListener(
    "click",
    () => {

        const file =
            mediaFile.files[0];


        if (!file) {

            mediaStatus.textContent =
                "[ERROR] SELECT A FILE.";

            return;

        }


        const MAX =
            25 * 1024 * 1024;


        if (
            file.size >
            MAX
        ) {

            mediaStatus.textContent =
                "[ERROR] MAXIMUM 25 MB.";

            return;

        }


        const form =
            new FormData();


        form.append(
            "file",
            file
        );

        form.append(
            "username",
            username
        );


        const xhr =
            new XMLHttpRequest();


        xhr.open(
            "POST",
            API + "/api/upload"
        );


        mediaProgress.style.display =
            "block";

        mediaProgressBar.style.width =
            "0%";

        uploadButton.disabled =
            true;


        mediaStatus.textContent =
            "UPLOADING...";


        xhr.upload.onprogress =
            event => {

                if (!event.lengthComputable)
                    return;


                const percent =
                    Math.round(
                        event.loaded /
                        event.total *
                        100
                    );


                mediaProgressBar.style.width =
                    percent + "%";


                mediaStatus.textContent =
                    "UPLOADING... " +
                    percent +
                    "%";

            };


        xhr.onload =
            () => {

                uploadButton.disabled =
                    false;


                let data;

                try {

                    data =
                        JSON.parse(
                            xhr.responseText
                        );

                } catch {

                    data = {};

                }


                if (
                    xhr.status >= 200 &&
                    xhr.status < 300 &&
                    data.success
                ) {

                    mediaStatus.textContent =
                        "[OK] UPLOAD COMPLETE.";


                    addMedia({

                        name:
                            data.name,

                        url:
                            data.url,

                        size:
                            data.size,

                        path:
                            "uploaded/" +
                            data.name

                    });


                    mediaFile.value =
                        "";


                } else {

                    mediaStatus.textContent =
                        "[ERROR] " +
                        (
                            data.error ||
                            "UPLOAD FAILED."
                        );

                }

            };


        xhr.onerror =
            () => {

                uploadButton.disabled =
                    false;

                mediaStatus.textContent =
                    "[ERROR] NETWORK ERROR.";

            };


        xhr.onloadend =
            () => {

                setTimeout(
                    () => {

                        mediaProgress.style.display =
                            "none";

                    },
                    1000
                );

            };


        xhr.send(form);

    }
);


/* =====================================================
   REFRESH
===================================================== */

refreshMedia.addEventListener(
    "click",
    () => {

        loadMedia();

    }
);


/* =====================================================
   MARLEY
===================================================== */

function marleyAnimation() {

    const element =
        document.getElementById(
            "marley"
        );


    element.style.display =
        "flex";


    setTimeout(
        () => {

            element.style.display =
                "none";

        },
        3000
    );

}


/* =====================================================
   MATRIX
===================================================== */

function startMatrix() {

    const canvas =
        document.getElementById(
            "matrix"
        );

    const ctx =
        canvas.getContext("2d");


    function resize() {

        canvas.width =
            canvas.clientWidth;

        canvas.height =
            canvas.clientHeight;

    }


    resize();


    window.addEventListener(
        "resize",
        resize
    );


    const chars =
        "01ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%アイウエオ";


    const fontSize =
        12;


    let columns =
        Math.floor(
            canvas.width /
            fontSize
        );


    let drops =
        new Array(
            columns
        ).fill(1);


    setInterval(
        () => {

            ctx.fillStyle =
                "rgba(0,0,0,.08)";

            ctx.fillRect(
                0,
                0,
                canvas.width,
                canvas.height
            );


            ctx.fillStyle =
                "#00ff66";

            ctx.font =
                fontSize +
                "px monospace";


            for (
                let i = 0;
                i < drops.length;
                i++
            ) {

                const char =
                    chars[
                        Math.floor(
                            Math.random() *
                            chars.length
                        )
                    ];


                ctx.fillText(
                    char,
                    i * fontSize,
                    drops[i] *
                    fontSize
                );


                if (
                    drops[i] *
                    fontSize >
                    canvas.height &&
                    Math.random() >
                    .975
                ) {

                    drops[i] = 0;

                }


                drops[i]++;

            }

        },
        45
    );

}


/* =====================================================
   INFINITE DIR
===================================================== */

async function loadDirFiles() {

    try {

        const response =
            await fetch(
                API +
                "/api/files"
            );


        dirFiles =
            await response.json();

    } catch {

        dirFiles = [

            "C:\\SYSTEM\\BOOT.INI",

            "C:\\SYSTEM\\CONFIG.SYS",

            "C:\\TERMINAL\\CHAT.LOG",

            "C:\\USERS\\GUEST\\DATA.DAT",

            "C:\\NETWORK\\SOCKET.WS"

        ];

    }

}


async function startInfiniteDir() {

    await loadDirFiles();


    if (
        !dirFiles.length
    )
        return;


    setInterval(
        () => {

            const line =
                document.createElement(
                    "div"
                );


            const file =
                dirFiles[
                    dirIndex %
                    dirFiles.length
                ];


            dirIndex++;


            line.className =
                "dirLine";


            line.textContent =
                "C:\\>" +
                file;


            dirOutput.appendChild(
                line
            );


            while (
                dirOutput.children.length >
                35
            ) {

                dirOutput.removeChild(
                    dirOutput.firstChild
                );

            }

        },
        250
    );

}


/* =====================================================
   START
===================================================== */

bootAnimation();

</script>

</body>

</html>
