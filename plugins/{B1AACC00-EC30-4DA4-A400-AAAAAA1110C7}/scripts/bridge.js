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
        var action = msg.action;
        var handler = handlers[action];

        if (!handler) {
            sendResponse(msg.id, null, "Unknown action: " + action);
            return;
        }

        try {
            var result = handler(msg.params || {});
            if (result && typeof result.then === "function") {
                result.then(function (res) {
                    sendResponse(msg.id, res, null);
                }).catch(function (err) {
                    sendResponse(msg.id, null, err.message || String(err));
                });
            } else {
                sendResponse(msg.id, result, null);
            }
        } catch (err) {
            sendResponse(msg.id, null, err.message || String(err));
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

    // --- Plugin lifecycle ---
    window.Asc.plugin.init = function () {
        connect();
    };

    window.Asc.plugin.onToolbarMenuClick = function (id) {
        if (id === "brain_bridge_reconnect") {
            connect();
        }
    };

    window.Asc.plugin.button = function (id) {
        this.executeCommand("close", "");
    };
})();
