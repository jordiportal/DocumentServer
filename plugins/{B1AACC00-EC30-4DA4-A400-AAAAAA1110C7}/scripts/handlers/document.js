var DocumentHandlers = (function () {
    "use strict";

    function getContext(params) {
        return new Promise(function (resolve) {
            var sampleN = (params && params.sampleParagraphs) || 5;
            window.Asc.scope._sampleN = sampleN;

            window.Asc.plugin.callCommand(function () {
                var doc = Api.GetDocument();
                var elements = doc.GetAllParagraphs();
                var totalParagraphs = elements.length;
                var sampleN = Asc.scope._sampleN;

                var headings = [];
                var wordCount = 0;

                for (var i = 0; i < totalParagraphs; i++) {
                    var text = elements[i].GetText();
                    wordCount += text.split(/\s+/).filter(function (w) { return w.length > 0; }).length;
                    var style = elements[i].GetStyle();
                    if (style) {
                        var styleName = style.GetName();
                        if (styleName && styleName.indexOf("heading") !== -1) {
                            headings.push({ index: i, level: styleName, text: text.substring(0, 100) });
                        }
                    }
                }

                var topParagraphs = [];
                for (var t = 0; t < Math.min(sampleN, totalParagraphs); t++) {
                    topParagraphs.push(elements[t].GetText());
                }

                var bottomParagraphs = [];
                if (totalParagraphs > sampleN) {
                    var start = Math.max(totalParagraphs - sampleN, sampleN);
                    for (var b = start; b < totalParagraphs; b++) {
                        bottomParagraphs.push(elements[b].GetText());
                    }
                }

                return {
                    totalParagraphs: totalParagraphs,
                    wordCount: wordCount,
                    headings: headings,
                    topParagraphs: topParagraphs,
                    bottomParagraphs: bottomParagraphs
                };
            }, false, false, function (result) {
                resolve(result);
            });
        });
    }

    function readText(params) {
        return new Promise(function (resolve) {
            window.Asc.scope._start = params.startParagraph || 0;
            window.Asc.scope._end = params.endParagraph || null;

            window.Asc.plugin.callCommand(function () {
                var doc = Api.GetDocument();
                var elements = doc.GetAllParagraphs();
                var start = Asc.scope._start;
                var end = Asc.scope._end || elements.length;
                end = Math.min(end, elements.length);

                var paragraphs = [];
                for (var i = start; i < end; i++) {
                    paragraphs.push(elements[i].GetText());
                }

                return {
                    startParagraph: start,
                    endParagraph: end,
                    total: elements.length,
                    paragraphs: paragraphs
                };
            }, false, false, function (result) {
                resolve(result);
            });
        });
    }

    function insertText(params) {
        return new Promise(function (resolve) {
            window.Asc.scope._text = params.text;
            window.Asc.scope._style = params.style || "normal";

            window.Asc.plugin.callCommand(function () {
                var doc = Api.GetDocument();
                var para = Api.CreateParagraph();

                var styleMap = {
                    "heading1": "Heading 1",
                    "heading2": "Heading 2",
                    "heading3": "Heading 3",
                    "normal": "Normal"
                };
                var styleName = styleMap[Asc.scope._style] || "Normal";
                var style = doc.GetStyle(styleName);
                if (style) para.SetStyle(style);

                para.AddText(Asc.scope._text);
                doc.Push(para);

                return { inserted: true, style: Asc.scope._style };
            }, true, false, function (result) {
                resolve(result);
            });
        });
    }

    function replaceText(params) {
        return new Promise(function (resolve) {
            window.Asc.scope._search = params.searchText;
            window.Asc.scope._replace = params.replaceWith;
            window.Asc.scope._matchCase = params.matchCase || false;

            window.Asc.plugin.callCommand(function () {
                var doc = Api.GetDocument();
                var search = doc.SearchAndReplace({
                    searchString: Asc.scope._search,
                    replaceString: Asc.scope._replace,
                    matchCase: Asc.scope._matchCase
                });
                return { replaced: true, searchText: Asc.scope._search };
            }, true, false, function (result) {
                resolve(result);
            });
        });
    }

    function insertTable(params) {
        return new Promise(function (resolve) {
            window.Asc.scope._headers = params.headers;
            window.Asc.scope._rows = params.rows;

            window.Asc.plugin.callCommand(function () {
                var doc = Api.GetDocument();
                var headers = Asc.scope._headers;
                var rows = Asc.scope._rows;
                var totalRows = rows.length + 1;
                var totalCols = headers.length;

                var table = Api.CreateTable(totalCols, totalRows);

                for (var c = 0; c < totalCols; c++) {
                    var cell = table.GetCell(0, c);
                    var content = cell.GetContent();
                    var para = content.GetElement(0);
                    para.AddText(headers[c]);
                    para.SetBold(true);
                }

                for (var r = 0; r < rows.length; r++) {
                    for (var cc = 0; cc < Math.min(rows[r].length, totalCols); cc++) {
                        var dataCell = table.GetCell(r + 1, cc);
                        var dataPara = dataCell.GetContent().GetElement(0);
                        dataPara.AddText(rows[r][cc]);
                    }
                }

                doc.Push(table);

                return { inserted: true, rows: totalRows, cols: totalCols };
            }, true, false, function (result) {
                resolve(result);
            });
        });
    }

    return {
        document_get_context: getContext,
        document_read_text: readText,
        document_insert_text: insertText,
        document_replace_text: replaceText,
        document_insert_table: insertTable
    };
})();
