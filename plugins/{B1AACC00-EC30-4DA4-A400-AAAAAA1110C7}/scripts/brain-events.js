var BrainEvents = (function () {
    "use strict";

    var BRAIN_EVENT_RE = /<!--BRAIN_EVENT:(.*?)-->/gs;

    var ACTION_ICONS = {
        search:        "&#128269;",
        web_search:    "&#127760;",
        web_fetch:     "&#11015;",
        browse:        "&#127760;",
        code:          "&#128187;",
        code_exec:     "&#9654;",
        python:        "&#128013;",
        shell:         "&#128187;",
        javascript:    "&#128187;",
        file:          "&#128196;",
        file_read:     "&#128214;",
        file_write:    "&#9999;",
        file_create:   "&#128196;",
        analyze:       "&#128202;",
        data:          "&#128202;",
        data_analysis: "&#128202;",
        slides:        "&#128444;",
        image:         "&#128444;",
        write:         "&#9999;",
        read:          "&#128214;",
        web:           "&#127760;",
        files:         "&#128193;",
        outline:       "&#128221;",
        planning:      "&#128203;",
        summarizing:   "&#128221;",
        delegate:      "&#129302;",
        generate:      "&#10024;"
    };

    var ACTION_LABELS = {
        search:        "Buscando",
        web_search:    "Buscando en web",
        web_fetch:     "Obteniendo web",
        browse:        "Navegando",
        code:          "Código",
        code_exec:     "Ejecutando código",
        python:        "Ejecutando Python",
        shell:         "Terminal",
        javascript:    "Ejecutando JS",
        file:          "Procesando archivo",
        file_read:     "Leyendo archivo",
        file_write:    "Escribiendo archivo",
        file_create:   "Creando archivo",
        analyze:       "Analizando",
        data:          "Procesando datos",
        data_analysis: "Analizando datos",
        slides:        "Presentación",
        image:         "Generando imagen",
        write:         "Escribiendo",
        read:          "Leyendo",
        web:           "Web",
        files:         "Archivos",
        outline:       "Estructura",
        planning:      "Planificando",
        summarizing:   "Resumiendo",
        delegate:      "Subagente",
        generate:      "Generando"
    };

    function decodeBase64(str) {
        try {
            return decodeURIComponent(
                atob(str).split("").map(function (c) {
                    return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
                }).join("")
            );
        } catch (e) {
            return "";
        }
    }

    function eventKey(evt) {
        var key = evt.type || "unknown";
        if (evt.type === "action") {
            key += ":" + (evt.action || evt.action_type || "");
            if (evt.agent_name) key += ":" + evt.agent_name;
        } else if (evt.type === "thinking") {
            key += ":" + (evt.title || "");
        } else if (evt.type === "status" && evt.status_type === "iteration") {
            key += ":iter:" + (evt.iteration || "");
        }
        return key;
    }

    function parse(content) {
        var allEvents = [];
        var text = content;
        BRAIN_EVENT_RE.lastIndex = 0;
        var match;
        while ((match = BRAIN_EVENT_RE.exec(content)) !== null) {
            try {
                var evt = JSON.parse(match[1]);
                if (evt.content_base64) {
                    evt.content = decodeBase64(evt.content_base64);
                    delete evt.content_base64;
                }
                allEvents.push(evt);
            } catch (e) { /* skip malformed */ }
        }
        BRAIN_EVENT_RE.lastIndex = 0;
        text = content.replace(BRAIN_EVENT_RE, "").trim();

        var seen = {};
        var order = [];
        for (var i = 0; i < allEvents.length; i++) {
            var k = eventKey(allEvents[i]);
            if (seen[k] !== undefined) {
                order[seen[k]] = allEvents[i];
            } else {
                seen[k] = order.length;
                order.push(allEvents[i]);
            }
        }

        return { text: text, events: order };
    }

    function statusClass(status) {
        if (status === "complete" || status === "completed") return "be-complete";
        if (status === "error") return "be-error";
        return "be-active";
    }

    function statusIcon(status) {
        if (status === "complete" || status === "completed") return "&#10003;";
        if (status === "error") return "&#10007;";
        return "";
    }

    function renderThinking(evt) {
        var cls = statusClass(evt.status);
        var isActive = cls === "be-active";
        var title = evt.title || "Pensando";
        var hasContent = evt.content && evt.content.trim();

        var html = '<div class="be-block be-thinking ' + cls + '">';
        html += '<div class="be-header" onclick="this.parentNode.classList.toggle(\'be-collapsed\')">';
        html += '<span class="be-icon">&#128161;</span>';
        html += '<span class="be-title">' + escapeHtml(title) + '</span>';
        if (isActive) html += '<span class="be-spinner"></span>';
        else html += '<span class="be-status-icon">' + statusIcon(evt.status) + '</span>';
        if (hasContent) html += '<span class="be-chevron">&#9660;</span>';
        html += '</div>';
        if (hasContent) {
            html += '<div class="be-body">';
            html += '<pre class="be-thinking-text">' + escapeHtml(evt.content) + '</pre>';
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    function renderAction(evt) {
        var cls = statusClass(evt.status);
        var isActive = cls === "be-active";
        var action = evt.action || evt.action_type || "";
        var icon = ACTION_ICONS[action] || "&#9889;";
        var label = ACTION_LABELS[action] || action || "Procesando";
        var desc = evt.description || evt.content || "";

        if (action === "delegate" && evt.agent_name) {
            label = "Delegando a " + evt.agent_name;
        }

        var html = '<div class="be-block be-action ' + cls + '">';
        html += '<span class="be-icon">' + icon + '</span>';
        html += '<span class="be-label">' + escapeHtml(label) + '</span>';
        if (desc) html += '<span class="be-desc">' + escapeHtml(desc) + '</span>';
        if (isActive) html += '<span class="be-spinner"></span>';
        else html += '<span class="be-status-icon">' + statusIcon(evt.status) + '</span>';
        html += '</div>';
        return html;
    }

    function renderSources(evt) {
        var sources = evt.sources || [];
        if (sources.length === 0) return "";

        var html = '<div class="be-block be-sources">';
        html += '<div class="be-header">';
        html += '<span class="be-icon">&#128279;</span>';
        html += '<span class="be-title">Fuentes (' + sources.length + ')</span>';
        html += '</div>';
        html += '<div class="be-body"><ul class="be-source-list">';
        for (var i = 0; i < sources.length; i++) {
            var s = sources[i];
            html += '<li>';
            if (s.url) {
                html += '<a href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener">' + escapeHtml(s.title || s.url) + '</a>';
            } else {
                html += escapeHtml(s.title || "Fuente " + (i + 1));
            }
            if (s.snippet) html += '<span class="be-snippet">' + escapeHtml(s.snippet) + '</span>';
            html += '</li>';
        }
        html += '</ul></div></div>';
        return html;
    }

    function renderError(evt) {
        var msg = evt.content || evt.error || "Error desconocido";
        var html = '<div class="be-block be-err">';
        html += '<span class="be-icon">&#9888;</span>';
        html += '<span class="be-label">' + escapeHtml(msg) + '</span>';
        html += '</div>';
        return html;
    }

    function renderTaskPlan(evt) {
        var steps = evt.steps || [];
        if (steps.length === 0) return "";
        var goal = evt.goal || "Plan de ejecución";

        var html = '<div class="be-block be-plan">';
        html += '<div class="be-header">';
        html += '<span class="be-icon">&#128203;</span>';
        html += '<span class="be-title">' + escapeHtml(goal) + '</span>';
        html += '</div>';
        html += '<div class="be-body"><ol class="be-steps">';
        for (var i = 0; i < steps.length; i++) {
            var step = steps[i];
            var sCls = "";
            if (step.status === "completed" || step.status === "complete") sCls = "be-step-done";
            else if (step.status === "running" || step.status === "in_progress") sCls = "be-step-running";
            else if (step.status === "error" || step.status === "failed") sCls = "be-step-error";
            html += '<li class="' + sCls + '">' + escapeHtml(step.description || "Paso " + (i + 1)) + '</li>';
        }
        html += '</ol></div></div>';
        return html;
    }

    function renderEvent(evt) {
        switch (evt.type) {
            case "thinking": return renderThinking(evt);
            case "action":   return renderAction(evt);
            case "sources":  return renderSources(evt);
            case "error":    return renderError(evt);
            case "task_plan":
            case "task_plan_update": return renderTaskPlan(evt);
            case "status":   return "";
            default: return "";
        }
    }

    function renderAll(events) {
        if (!events || events.length === 0) return "";

        var lastIter = null;
        for (var i = events.length - 1; i >= 0; i--) {
            if (events[i].type === "status" && events[i].status_type === "iteration") {
                lastIter = events[i];
                break;
            }
        }

        var html = '<div class="be-events">';
        for (var i = 0; i < events.length; i++) {
            html += renderEvent(events[i]);
        }
        if (lastIter) {
            var n = lastIter.iteration || "?";
            var m = lastIter.max_iterations || "?";
            html += '<span class="be-iter-badge">iter ' + n + '/' + m + '</span>';
        }
        html += '</div>';
        return html;
    }

    function escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    return {
        parse: parse,
        renderEvent: renderEvent,
        renderAll: renderAll
    };
})();
