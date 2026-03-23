(function () {
    "use strict";

    var PLUGIN_NAME = "Brain Bridge";
    var WS_URL_KEY = "brain_bridge_ws_url";
    var DEFAULT_WS_URL = "ws://localhost:3002/ws";
    var RECONNECT_INTERVAL_MS = 5000;

    var ws = null;
    var sessionId = null;
    var reconnectTimer = null;
    var editorType = null;

    var handlers = {};
    var commandQueue = [];
    var commandRunning = false;

    var handlerSources = [
        typeof SpreadsheetHandlers !== "undefined" ? SpreadsheetHandlers : null,
        typeof DocumentHandlers !== "undefined" ? DocumentHandlers : null,
        typeof PresentationHandlers !== "undefined" ? PresentationHandlers : null,
        typeof BiwHandlers !== "undefined" ? BiwHandlers : null
    ];

    handlerSources.forEach(function (source) {
        if (source) {
            Object.keys(source).forEach(function (key) {
                handlers[key] = source[key];
            });
        }
    });

    function getWsUrl() {
        try {
            return localStorage.getItem(WS_URL_KEY) || DEFAULT_WS_URL;
        } catch (e) {
            return DEFAULT_WS_URL;
        }
    }

    function detectEditorType() {
        try {
            var info = window.Asc.plugin.info;
            if (info && info.editorType) {
                return info.editorType;
            }
        } catch (e) { /* ignore */ }
        return "cell";
    }

    function getDocumentName() {
        try {
            var info = window.Asc.plugin.info;
            if (info && info.documentTitle) {
                return info.documentTitle;
            }
        } catch (e) { /* ignore */ }
        return "unknown";
    }

    function connect() {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        var url = getWsUrl();
        console.log("[" + PLUGIN_NAME + "] Connecting to " + url);

        try {
            ws = new WebSocket(url);
        } catch (e) {
            console.error("[" + PLUGIN_NAME + "] WebSocket creation failed:", e);
            scheduleReconnect();
            return;
        }

        ws.onopen = function () {
            console.log("[" + PLUGIN_NAME + "] WebSocket connected");
            editorType = detectEditorType();
            var docName = getDocumentName();

            ws.send(JSON.stringify({
                type: "register",
                editorType: editorType,
                documentName: docName
            }));
        };

        ws.onmessage = function (event) {
            var msg;
            try {
                msg = JSON.parse(event.data);
            } catch (e) {
                console.error("[" + PLUGIN_NAME + "] Invalid message:", event.data);
                return;
            }

            if (msg.type === "registered") {
                sessionId = msg.sessionId;
                console.log("[" + PLUGIN_NAME + "] Registered with session " + sessionId);
                return;
            }

            if (msg.type === "command") {
                handleCommand(msg);
            }
        };

        ws.onclose = function () {
            console.log("[" + PLUGIN_NAME + "] WebSocket disconnected");
            sessionId = null;
            scheduleReconnect();
        };

        ws.onerror = function (e) {
            console.error("[" + PLUGIN_NAME + "] WebSocket error:", e);
        };
    }

    function scheduleReconnect() {
        if (reconnectTimer) return;
        reconnectTimer = setTimeout(function () {
            reconnectTimer = null;
            connect();
        }, RECONNECT_INTERVAL_MS);
    }

    function handleCommand(msg) {
        commandQueue.push(msg);
        if (!commandRunning) {
            drainQueue();
        }
    }

    function drainQueue() {
        if (commandQueue.length === 0) {
            commandRunning = false;
            return;
        }
        commandRunning = true;
        var msg = commandQueue.shift();
        executeOneCommand(msg, function () {
            setTimeout(drainQueue, 50);
        });
    }

    function executeOneCommand(msg, done) {
        var action = msg.action;
        var handler = handlers[action];

        if (!handler) {
            sendResponse(msg.id, null, "Unknown action: " + action);
            done();
            return;
        }

        try {
            var result = handler(msg.params || {});
            if (result && typeof result.then === "function") {
                result.then(function (res) {
                    sendResponse(msg.id, res, null);
                    done();
                }).catch(function (err) {
                    sendResponse(msg.id, null, err.message || String(err));
                    done();
                });
            } else {
                sendResponse(msg.id, result, null);
                done();
            }
        } catch (err) {
            sendResponse(msg.id, null, err.message || String(err));
            done();
        }
    }

    function sendResponse(id, result, error) {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        var msg = { type: "response", id: id };
        if (error) {
            msg.error = error;
        } else {
            msg.result = result;
        }
        ws.send(JSON.stringify(msg));
    }

    // --- Toolbar & Chat Panel ---
    var chatPanel = null;

    function iconPath(name) {
        return "resources/icons/%theme-type%(light|dark)/" + name + ".svg";
    }

    function registerToolbar() {
        var guid = window.Asc.plugin.info.guid;
        window.Asc.plugin.executeMethod("AddToolbarMenuItem", [{
            guid: guid,
            tabs: [{
                id: "BrainTab",
                text: "Brain AI",
                items: [
                    {
                        id: "brain-chat",
                        type: "button",
                        text: "Chat",
                        hint: "Abrir chat de Brain AI",
                        icons: iconPath("chat")
                    },
                    {
                        id: "brain-reconnect",
                        type: "button",
                        text: "Reconectar",
                        hint: "Reconectar con el servidor Brain MCP",
                        icons: iconPath("reconnect")
                    },
                    {
                        id: "brain-settings",
                        type: "button",
                        text: "Configuración",
                        hint: "Configurar conexión con Brain AI",
                        icons: iconPath("settings")
                    }
                ]
            }]
        }]);
    }

    function closePanel(panel) {
        if (panel) {
            try { panel.close(); } catch (e) {}
        }
    }

    function openChatPanel(page) {
        if (!window.Asc.PluginWindow) {
            console.warn("[" + PLUGIN_NAME + "] PluginWindow API not available");
            return;
        }

        closePanel(chatPanel);
        chatPanel = null;

        chatPanel = new window.Asc.PluginWindow();

        chatPanel.attachEvent("onClose", function () {
            chatPanel = null;
        });

        chatPanel.attachEvent("onDockedChanged", function (newType) {
            try { localStorage.setItem("brain_chat_placement", newType); } catch (e) {}
            window.Asc.plugin.executeMethod("OnWindowDockChangedCallback", [chatPanel.id]);
        });

        var savedType = "panel";
        try {
            savedType = localStorage.getItem("brain_chat_placement") || "panel";
        } catch (e) {}

        chatPanel.show({
            url: page || "index.html",
            description: "Brain AI Chat",
            isVisual: true,
            buttons: [],
            isModal: false,
            isCanDocked: true,
            type: savedType,
            EditorsSupport: ["word", "cell", "slide", "pdf"],
            size: [400, 600]
        });
    }

    // --- Plugin lifecycle ---
    var isInitialized = false;

    window.Asc.plugin.init = function () {
        if (isInitialized) return;
        isInitialized = true;

        console.log("[" + PLUGIN_NAME + "] init called");

        // Method 1: SDK executeMethod (official API)
        try {
            window.Asc.plugin.executeMethod("AttachEvent", ["onToolbarMenuClick"]);
            console.log("[" + PLUGIN_NAME + "] AttachEvent via executeMethod");
        } catch (e) {
            console.warn("[" + PLUGIN_NAME + "] executeMethod AttachEvent failed:", e);
        }

        // Method 2: postMessage (legacy, like BIW)
        try {
            var info = window.Asc.plugin.info;
            if (info) {
                var saved = { type: info.type, name: info.name };
                info.type = "attachEvent";
                info.name = "onToolbarMenuClick";
                var message = JSON.stringify(info);
                info.type = saved.type;
                info.name = saved.name;
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage(message, "*");
                }
                if (typeof window.plugin_sendMessage === "function") {
                    window.plugin_sendMessage(message);
                }
                console.log("[" + PLUGIN_NAME + "] AttachEvent via postMessage");
            }
        } catch (e) {
            console.warn("[" + PLUGIN_NAME + "] postMessage attachEvent failed:", e);
        }

        setTimeout(function () {
            try {
                registerToolbar();
                console.log("[" + PLUGIN_NAME + "] Toolbar registered");
            } catch (e) {
                console.error("[" + PLUGIN_NAME + "] registerToolbar failed:", e);
            }
        }, 500);

        setTimeout(function () {
            try { connect(); } catch (e) {
                console.error("[" + PLUGIN_NAME + "] connect failed:", e);
            }
        }, 1000);
    };

    function handleMenuClick(id) {
        console.log("[" + PLUGIN_NAME + "] Menu click: " + id);
        switch (id) {
            case "brain-chat":
                openChatPanel("index.html");
                break;
            case "brain-settings":
                openChatPanel("config.html");
                break;
            case "brain-reconnect":
                connect();
                break;
        }
    }

    window.Asc.plugin.onToolbarMenuClick = function (id) {
        handleMenuClick(id);
    };

    window.Asc.plugin.button = function (id, windowId) {
        if (!windowId) return;

        if (chatPanel && windowId === chatPanel.id) {
            chatPanel.close();
            chatPanel = null;
        }
    };

    // --- Message listener (actual event delivery mechanism in OnlyOffice) ---
    window.addEventListener("message", function (event) {
        try {
            var msg = typeof event.data === "string" ? JSON.parse(event.data) : event.data;

            if (msg.type === "onEvent") {
                if (msg.eventName === "onToolbarMenuClick") {
                    handleMenuClick(msg.eventData);
                }
            }
        } catch (e) { /* ignore non-JSON messages */ }
    });
})();
