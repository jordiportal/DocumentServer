var BrainClient = (function () {
    "use strict";

    var BRAIN_URL_KEY = "brain_bridge_brain_url";
    var BRAIN_APIKEY_KEY = "brain_bridge_api_key";
    var BRAIN_MODEL_KEY = "brain_bridge_model";

    var DEFAULT_BRAIN_URL = "http://localhost:8000";
    var DEFAULT_MODEL = "brain";

    function getSetting(key, defaultVal) {
        try { return localStorage.getItem(key) || defaultVal; } catch (e) { return defaultVal; }
    }

    function getBaseUrl() { return getSetting(BRAIN_URL_KEY, DEFAULT_BRAIN_URL); }
    function getApiKey()  { return getSetting(BRAIN_APIKEY_KEY, ""); }
    function getModel()   { return getSetting(BRAIN_MODEL_KEY, DEFAULT_MODEL); }

    /**
     * Send a chat completion request with streaming.
     * @param {Array} messages - Array of {role, content} message objects
     * @param {Object} opts - Optional: { onDelta, onDone, onError, onToolCall }
     * @returns {AbortController} - Can be used to cancel the request
     */
    function chatStream(messages, opts) {
        opts = opts || {};
        var controller = new AbortController();
        var url = getBaseUrl() + "/v1/chat/completions";
        var apiKey = getApiKey();

        var headers = { "Content-Type": "application/json" };
        if (apiKey) {
            headers["Authorization"] = "Bearer " + apiKey;
        }

        var body = JSON.stringify({
            model: getModel(),
            messages: messages,
            stream: true,
            temperature: 0.7
        });

        fetch(url, {
            method: "POST",
            headers: headers,
            body: body,
            signal: controller.signal
        }).then(function (response) {
            if (!response.ok) {
                response.text().then(function (text) {
                    if (opts.onError) opts.onError("HTTP " + response.status + ": " + text);
                });
                return;
            }

            var reader = response.body.getReader();
            var decoder = new TextDecoder();
            var buffer = "";

            function processChunk() {
                reader.read().then(function (chunk) {
                    if (chunk.done) {
                        if (opts.onDone) opts.onDone();
                        return;
                    }

                    buffer += decoder.decode(chunk.value, { stream: true });
                    var lines = buffer.split("\n");
                    buffer = lines.pop();

                    for (var i = 0; i < lines.length; i++) {
                        var line = lines[i].trim();
                        if (!line || !line.startsWith("data: ")) continue;
                        var data = line.substring(6);
                        if (data === "[DONE]") {
                            if (opts.onDone) opts.onDone();
                            return;
                        }
                        try {
                            var parsed = JSON.parse(data);
                            var delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
                            if (delta) {
                                if (delta.content && opts.onDelta) {
                                    opts.onDelta(delta.content);
                                }
                                if (delta.tool_calls && opts.onToolCall) {
                                    opts.onToolCall(delta.tool_calls);
                                }
                            }
                        } catch (e) { /* skip malformed */ }
                    }

                    processChunk();
                }).catch(function (err) {
                    if (err.name !== "AbortError" && opts.onError) {
                        opts.onError(err.message);
                    }
                });
            }

            processChunk();
        }).catch(function (err) {
            if (err.name !== "AbortError" && opts.onError) {
                opts.onError(err.message);
            }
        });

        return controller;
    }

    return {
        chatStream: chatStream,
        getBaseUrl: getBaseUrl,
        getApiKey: getApiKey,
        getModel: getModel,
        BRAIN_URL_KEY: BRAIN_URL_KEY,
        BRAIN_APIKEY_KEY: BRAIN_APIKEY_KEY,
        BRAIN_MODEL_KEY: BRAIN_MODEL_KEY
    };
})();
