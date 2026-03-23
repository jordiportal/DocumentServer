var BrainClient = (function () {
    "use strict";

    var KEYS = {
        brainUrl: "brain_chat_url",
        apiKey:   "brain_chat_api_key",
        model:    "brain_chat_model"
    };

    var DEFAULTS = {
        brainUrl: "http://localhost:8000",
        apiKey:   "",
        model:    "brain-adaptive"
    };

    function get(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    function getBaseUrl() { return get(KEYS.brainUrl) || DEFAULTS.brainUrl; }
    function getApiKey()  { return get(KEYS.apiKey)   || DEFAULTS.apiKey; }
    function getModel()   { return get(KEYS.model)    || DEFAULTS.model; }

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
        KEYS: KEYS,
        DEFAULTS: DEFAULTS
    };
})();
