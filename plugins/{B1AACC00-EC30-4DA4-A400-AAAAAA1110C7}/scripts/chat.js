(function () {
    "use strict";

    var messagesEl = document.getElementById("messages");
    var inputEl = document.getElementById("user-input");
    var sendBtn = document.getElementById("send-btn");
    var statusIndicator = document.getElementById("status-indicator");
    var statusText = document.getElementById("status-text");

    var settingsToggle = document.getElementById("settings-toggle");
    var settingsSection = document.getElementById("settings-section");
    var cfgUrl = document.getElementById("cfg-brain-url");
    var cfgKey = document.getElementById("cfg-api-key");
    var cfgModel = document.getElementById("cfg-model");
    var cfgTest = document.getElementById("cfg-test");
    var cfgSave = document.getElementById("cfg-save");
    var cfgStatus = document.getElementById("cfg-status");

    var conversationHistory = [];
    var currentController = null;
    var isStreaming = false;

    var SYSTEM_PROMPT =
        "You are Brain, an AI assistant embedded in OnlyOffice. " +
        "You help users with their spreadsheets, documents, and presentations. " +
        "You have access to tools that let you read and write data in the open editor. " +
        "When the user asks about data analysis, formulas, formatting, or chart creation, " +
        "use the available spreadsheet tools. Always be concise and helpful. " +
        "Respond in the same language the user uses.";

    // --- Settings ---

    function loadSettings() {
        cfgUrl.value   = BrainClient.getBaseUrl();
        cfgKey.value   = BrainClient.getApiKey();
        cfgModel.value = BrainClient.getModel();
    }

    function saveSettings() {
        try {
            localStorage.setItem(BrainClient.KEYS.brainUrl, cfgUrl.value.trim());
            localStorage.setItem(BrainClient.KEYS.apiKey,   cfgKey.value.trim());
            localStorage.setItem(BrainClient.KEYS.model,    cfgModel.value.trim());
        } catch (e) { /* ignore */ }
        showCfgStatus("ok", "Guardado");
        checkConnection();
    }

    function testConnection() {
        var url = cfgUrl.value.trim() + "/v1/models";
        var apiKey = cfgKey.value.trim();
        var headers = {};
        if (apiKey) headers["Authorization"] = "Bearer " + apiKey;

        showCfgStatus("", "Probando...");

        fetch(url, { headers: headers })
            .then(function (res) {
                if (res.ok) {
                    showCfgStatus("ok", "OK (HTTP " + res.status + ")");
                } else {
                    showCfgStatus("fail", "Error HTTP " + res.status);
                }
            })
            .catch(function (err) {
                showCfgStatus("fail", err.message);
            });
    }

    function showCfgStatus(cls, text) {
        cfgStatus.className = cls;
        cfgStatus.textContent = text;
    }

    function toggleSettings() {
        var visible = settingsSection.style.display !== "none";
        settingsSection.style.display = visible ? "none" : "block";
        if (!visible) loadSettings();
    }

    // --- Chat ---

    function init() {
        sendBtn.addEventListener("click", onSend);
        inputEl.addEventListener("keydown", function (e) {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
            }
        });

        settingsToggle.addEventListener("click", toggleSettings);
        cfgTest.addEventListener("click", testConnection);
        cfgSave.addEventListener("click", saveSettings);

        conversationHistory.push({ role: "system", content: SYSTEM_PROMPT });

        if (window._BRAIN_SHOW_SETTINGS) {
            loadSettings();
        }

        checkConnection();
    }

    function checkConnection() {
        var baseUrl = BrainClient.getBaseUrl();
        var apiKey = BrainClient.getApiKey();

        if (!apiKey) {
            updateStatus("error", "Sin API Key — pulsa ⚙ para configurar");
            sendBtn.disabled = false;
            return;
        }

        updateStatus("streaming", "Conectando...");
        var headers = { "Authorization": "Bearer " + apiKey };

        fetch(baseUrl + "/v1/models", { headers: headers })
            .then(function (res) {
                if (res.ok) {
                    updateStatus("connected", "Conectado (" + BrainClient.getModel() + ")");
                    sendBtn.disabled = false;
                } else {
                    updateStatus("error", "Error HTTP " + res.status + " — pulsa ⚙");
                    sendBtn.disabled = false;
                }
            })
            .catch(function (err) {
                updateStatus("error", err.message + " — pulsa ⚙");
                sendBtn.disabled = false;
            });
    }

    function onSend() {
        var text = inputEl.value.trim();
        if (!text || isStreaming) return;

        addMessage("user", text);
        conversationHistory.push({ role: "user", content: text });
        inputEl.value = "";

        isStreaming = true;
        sendBtn.disabled = true;
        updateStatus("streaming", "Pensando...");

        var assistantEl = addMessage("assistant", "");
        var contentEl = assistantEl.querySelector(".msg-content");
        var fullContent = "";

        currentController = BrainClient.chatStream(conversationHistory, {
            onDelta: function (delta) {
                fullContent += delta;
                var parsed = BrainEvents.parse(fullContent);
                var eventsHtml = BrainEvents.renderAll(parsed.events);
                var textHtml = parsed.text ? formatMarkdown(parsed.text) : "";
                contentEl.innerHTML = eventsHtml + textHtml;
                messagesEl.scrollTop = messagesEl.scrollHeight;
            },
            onToolCall: function (toolCalls) {
                for (var i = 0; i < toolCalls.length; i++) {
                    var tc = toolCalls[i];
                    var fn = tc.function;
                    if (fn && fn.name) {
                        updateStatus("streaming", "Usando: " + fn.name + "...");
                    }
                }
            },
            onDone: function () {
                if (fullContent) {
                    conversationHistory.push({ role: "assistant", content: fullContent });
                }
                var parsed = BrainEvents.parse(fullContent);
                var eventsHtml = BrainEvents.renderAll(parsed.events);
                var textHtml = parsed.text ? formatMarkdown(parsed.text) : "";
                contentEl.innerHTML = eventsHtml + textHtml;
                isStreaming = false;
                sendBtn.disabled = false;
                currentController = null;
                updateStatus("connected", "Conectado (" + BrainClient.getModel() + ")");
            },
            onError: function (err) {
                if (!fullContent) {
                    contentEl.textContent = "Error: " + err;
                    assistantEl.classList.add("error");
                }
                isStreaming = false;
                sendBtn.disabled = false;
                currentController = null;
                updateStatus("error", "Error — pulsa ⚙ para revisar config");
            }
        });
    }

    function addMessage(role, text) {
        var el = document.createElement("div");
        el.className = "message message-" + role;

        var label = document.createElement("div");
        label.className = "msg-label";
        label.textContent = role === "user" ? "Tú" : "Brain";
        el.appendChild(label);

        var content = document.createElement("div");
        content.className = "msg-content";
        content.innerHTML = text ? formatMarkdown(text) : "";
        el.appendChild(content);

        messagesEl.appendChild(el);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return el;
    }

    function formatMarkdown(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
            .replace(/`([^`]+)`/g, "<code>$1</code>")
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/\*(.+?)\*/g, "<em>$1</em>")
            .replace(/\n/g, "<br>");
    }

    function updateStatus(state, text) {
        if (statusIndicator) statusIndicator.className = state;
        if (statusText) statusText.textContent = text;
    }

    window.Asc.plugin.init = function () {
        init();
    };

    window.Asc.plugin.button = function () {
        if (currentController) currentController.abort();
        this.executeCommand("close", "");
    };
})();
