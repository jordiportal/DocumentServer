var PresentationHandlers = (function () {
    "use strict";

    function safeStr(v) {
        if (v === null || v === undefined) return "";
        if (typeof v === "object") return JSON.stringify(v);
        return String(v);
    }

    function safeCallCommand(fn, isWrite) {
        return new Promise(function (resolve) {
            var timeout = setTimeout(function () {
                resolve({ error: "callCommand timeout (15s)" });
            }, 15000);

            try {
                window.Asc.plugin.callCommand(
                    fn,
                    isWrite ? false : false,
                    isWrite ? true : false,
                    function (result) {
                        clearTimeout(timeout);
                        resolve(result || { error: "empty result" });
                    }
                );
            } catch (e) {
                clearTimeout(timeout);
                resolve({ error: "callCommand exception: " + (e.message || String(e)) });
            }
        });
    }

    function getSlides() {
        return safeCallCommand(function () {
            try {
                var pres = Api.GetPresentation();
                var slideCount = pres.GetSlidesCount();
                var slides = [];

                for (var i = 0; i < slideCount; i++) {
                    var slide = pres.GetSlideByIndex(i);
                    var objects = slide.GetAllShapes();
                    var slideInfo = { index: i, title: "", content: [] };

                    for (var j = 0; j < objects.length; j++) {
                        var shape = objects[j];
                        var docContent = shape.GetDocContent();
                        if (docContent) {
                            var elCount = docContent.GetElementsCount();
                            var text = "";
                            for (var e = 0; e < elCount; e++) {
                                var el = docContent.GetElement(e);
                                if (el.GetText) {
                                    text += el.GetText() + "\n";
                                }
                            }
                            text = text.trim();
                            if (text) {
                                if (!slideInfo.title) {
                                    slideInfo.title = text.substring(0, 100);
                                }
                                slideInfo.content.push(text.substring(0, 200));
                            }
                        }
                    }
                    slides.push(slideInfo);
                }

                return { slideCount: slideCount, slides: slides };
            } catch (e) {
                return { error: "getSlides: " + e.message };
            }
        }, false);
    }

    function addSlide(params) {
        window.Asc.scope._position = params.position;
        window.Asc.scope._layout = params.layout || "titleContent";

        return safeCallCommand(function () {
            try {
                var pres = Api.GetPresentation();
                var slide = Api.CreateSlide();

                var master = pres.GetSlideByIndex(0);
                if (master) {
                    var layout = master.GetLayout();
                    if (layout) slide.SetLayout(layout);
                }

                var pos = Asc.scope._position;
                if (pos !== undefined && pos !== null) {
                    pres.AddSlide(slide, pos);
                } else {
                    pres.AddSlide(slide);
                }

                return {
                    added: true,
                    position: pos !== undefined && pos !== null ? pos : pres.GetSlidesCount() - 1,
                    totalSlides: pres.GetSlidesCount()
                };
            } catch (e) {
                return { error: "addSlide: " + e.message };
            }
        }, true);
    }

    function setText(params) {
        if (!params.text) return Promise.resolve({ error: "missing text parameter" });
        if (params.slideIndex === undefined) return Promise.resolve({ error: "missing slideIndex" });

        window.Asc.scope._slideIndex = params.slideIndex;
        window.Asc.scope._placeholder = params.placeholder || "title";
        window.Asc.scope._text = safeStr(params.text);

        return safeCallCommand(function () {
            try {
                var pres = Api.GetPresentation();
                var slide = pres.GetSlideByIndex(Asc.scope._slideIndex);
                if (!slide) return { error: "Slide not found at index " + Asc.scope._slideIndex };

                var shapes = slide.GetAllShapes();
                var placeholderMap = { "title": 0, "subtitle": 1, "body": 1 };
                var targetIdx = placeholderMap[Asc.scope._placeholder];
                if (targetIdx === undefined) targetIdx = 0;

                if (targetIdx >= shapes.length) {
                    return { error: "Placeholder '" + Asc.scope._placeholder + "' not found (only " + shapes.length + " shapes)" };
                }

                var shape = shapes[targetIdx];
                var docContent = shape.GetDocContent();
                if (docContent) {
                    var para = docContent.GetElement(0);
                    if (!para) {
                        para = Api.CreateParagraph();
                        docContent.Push(para);
                    }
                    para.RemoveAllElements();
                    var run = Api.CreateRun();
                    run.AddText(Asc.scope._text);
                    para.AddElement(run);
                }

                return {
                    set: true,
                    slideIndex: Asc.scope._slideIndex,
                    placeholder: Asc.scope._placeholder
                };
            } catch (e) {
                return { error: "setText: " + e.message };
            }
        }, true);
    }

    function insertChart(params) {
        if (!params.data) return Promise.resolve({ error: "missing data parameter" });

        window.Asc.scope._slideIndex = params.slideIndex || 0;
        window.Asc.scope._chartType = params.chartType || "bar";
        window.Asc.scope._data = params.data;
        window.Asc.scope._title = params.title || "";

        return safeCallCommand(function () {
            try {
                var pres = Api.GetPresentation();
                var slide = pres.GetSlideByIndex(Asc.scope._slideIndex);
                if (!slide) return { error: "Slide not found at index " + Asc.scope._slideIndex };

                var typeMap = {
                    "bar": "bar", "line": "lineNormal", "pie": "pie",
                    "scatter": "scatter", "area": "areaNormal"
                };
                var cType = typeMap[Asc.scope._chartType] || "bar";

                var chart = Api.CreateChart(cType, Asc.scope._data, true);
                if (chart && Asc.scope._title) {
                    chart.SetTitle(Asc.scope._title);
                }
                if (chart) {
                    slide.AddObject(chart);
                }

                return {
                    inserted: true,
                    slideIndex: Asc.scope._slideIndex,
                    chartType: Asc.scope._chartType
                };
            } catch (e) {
                return { error: "insertChart: " + e.message };
            }
        }, true);
    }

    return {
        presentation_get_slides: getSlides,
        presentation_add_slide: addSlide,
        presentation_set_text: setText,
        presentation_insert_chart: insertChart
    };
})();
