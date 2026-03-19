(function () {
    "use strict";

    var messagesEl = document.getElementById("messages");
    var inputEl = document.getElementById("user-input");
    var sendBtn = document.getElementById("send-btn");
    var statusIndicator = document.getElementById("status-indicator");
    var statusText = document.getElementById("status-text");
    var settingsBtn = document.getElementById("settings-btn");
    var settingsPanel = document.getElementById("settings-panel");
    var saveSettingsBtn = document.getElementById("save-settings");

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

    function init() {
        sendBtn.disabled = false;
        sendBtn.addEventListener("click", onSend);
        inputEl.addEventListener("keydown", function (e) {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
            }
        });

        if (settingsBtn) {
            settingsBtn.addEventListener("click", toggleSettings);
        }
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener("click", saveSettings);
            loadSettingsValues();
        }

        updateStatus("connected", "Conectado a Brain");
        conversationHistory.push({ role: "system", content: SYSTEM_PROMPT });
    }

    function toggleSettings() {
        if (settingsPanel) {
            settingsPanel.style.display = settingsPanel.style.display === "none" ? "block" : "none";
        }
    }

    function loadSettingsValues() {
        var urlInput = document.getElementById("setting-brain-url");
        var keyInput = document.getElementById("setting-api-key");
        var modelInput = document.getElementById("setting-model");
        if (urlInput) urlInput.value = BrainClient.getBaseUrl();
        if (keyInput) keyInput.value = BrainClient.getApiKey();
        if (modelInput) modelInput.value = BrainClient.getModel();
    }

    function saveSettings() {
        var urlInput = document.getElementById("setting-brain-url");
        var keyInput = document.getElementById("setting-api-key");
        var modelInput = document.getElementById("setting-model");
        try {
            if (urlInput) localStorage.setItem(BrainClient.BRAIN_URL_KEY, urlInput.value);
            if (keyInput) localStorage.setItem(BrainClient.BRAIN_APIKEY_KEY, keyInput.value);
            if (modelInput) localStorage.setItem(BrainClient.BRAIN_MODEL_KEY, modelInput.value);
        } catch (e) { /* ignore */ }
        toggleSettings();
        updateStatus("connected", "Ajustes guardados");
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
        var fullContent = "";

        currentController = BrainClient.chatStream(conversationHistory, {
            onDelta: function (delta) {
                fullContent += delta;
                assistantEl.querySelector(".msg-content").innerHTML = formatMarkdown(fullContent);
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
                isStreaming = false;
                sendBtn.disabled = false;
                currentController = null;
                updateStatus("connected", "Conectado a Brain");
            },
            onError: function (err) {
                if (!fullContent) {
                    assistantEl.querySelector(".msg-content").textContent = "Error: " + err;
                    assistantEl.classList.add("error");
                }
                isStreaming = false;
                sendBtn.disabled = false;
                currentController = null;
                updateStatus("error", "Error: " + err);
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
        if (statusIndicator) {
            statusIndicator.className = state;
        }
        if (statusText) {
            statusText.textContent = text;
        }
    }

    // Integrate with OnlyOffice plugin
    window.Asc.plugin.init = function () {
        init();
    };

    window.Asc.plugin.button = function () {
        if (currentController) {
            currentController.abort();
        }
        this.executeCommand("close", "");
    };
})();
