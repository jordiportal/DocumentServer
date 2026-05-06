---
name: onlyoffice-plugin-sdk
description: >-
  Reference for developing OnlyOffice Document Server plugins (spreadsheet/cell editor).
  Covers Asc.plugin API, callCommand, executeMethod, PluginWindow, context menus,
  toolbar, events, persistence, and common pitfalls. Use when building, debugging,
  or modifying OnlyOffice plugins, or when the user mentions OnlyOffice plugin SDK.
---

# OnlyOffice Plugin SDK — Spreadsheet Reference

## Plugin Lifecycle

```javascript
// Every plugin MUST define init and button
window.Asc.plugin.init = function() {
    // Called once when plugin loads. Register UI here (use setTimeout for toolbar).
};

window.Asc.plugin.button = function(id, windowId) {
    // id: 0 = primary button, 1 = secondary/cancel, -1 = close
    // windowId: set when the button belongs to a PluginWindow
};

// Required stubs (SDK expects them)
window.Asc.plugin.onExternalMouseUp = function() {};
window.Asc.plugin.onTranslate = function() {};
window.Asc.plugin.onThemeChanged = function(theme) {};
```

## callCommand — Execute Code in Document Context

Runs a function inside the editor with access to the **Office JavaScript API** (`Api.*`).
The function is serialized and executed in isolation — no closures, no outer variables.

```javascript
// Signature
window.Asc.plugin.callCommand(func, isClose, isCalc, callback);
// isClose: close plugin after execution (default false)
// isCalc:  recalculate document after (default true)
// callback: receives the return value of func
```

### Passing Data with Asc.scope

`Asc.scope` is the ONLY way to pass data into callCommand. Values must be JSON-serializable.

```javascript
// BEFORE callCommand — set data on scope
window.Asc.scope.myData = [1, 2, 3];
window.Asc.scope.config = JSON.stringify(complexObject);

window.Asc.plugin.callCommand(function() {
    // INSIDE — read from Asc.scope
    var data = Asc.scope.myData;
    var config = JSON.parse(Asc.scope.config);
    var sheet = Api.GetActiveSheet();
    sheet.GetRange("A1").SetValue(data[0]);
    return { success: true };  // returned to callback
}, false, true, function(result) {
    console.log(result); // { success: true }
});
```

### Common Patterns

```javascript
// READING (no recalc needed): isClose=false, isCalc=false
window.Asc.plugin.callCommand(function() {
    var sheet = Api.GetActiveSheet();
    var cell = sheet.GetActiveCell();
    return {
        row: cell.GetRow(),
        col: cell.GetCol(),
        value: cell.GetValue(),
        sheetName: sheet.GetName()
    };
}, false, false, function(result) {
    // result = { row, col, value, sheetName }
});

// WRITING (recalc needed): isClose=false, isCalc=true
window.Asc.plugin.callCommand(function() {
    var sheet = Api.GetActiveSheet();
    sheet.GetRangeByNumber(0, 0).SetValue("Hello");
}, false, true);

// BULK WRITE with callback
window.Asc.plugin.callCommand(function() {
    var sheet = Api.GetActiveSheet();
    var data = Asc.scope.rows; // array of arrays or objects
    // ... write loop ...
    return { count: data.length };
}, false, true, function(result) {
    console.log("Wrote " + result.count + " rows");
});
```

## Spreadsheet API (inside callCommand)

### Workbook / Sheets

```javascript
Api.GetActiveSheet()           // → ApiWorksheet
Api.GetSheet("SheetName")      // → ApiWorksheet or null
Api.GetSheets()                // → ApiWorksheet[]
Api.AddSheet("NewSheet")       // create sheet
sheet.GetName()                // → string
sheet.SetName("NewName")       // rename
sheet.SetActive()              // activate
sheet.SetVisible(false)        // hide sheet
sheet.GetUsedRange()           // → ApiRange (bounding box of data)
```

### Ranges / Cells

```javascript
sheet.GetRange("A1:B5")        // → ApiRange by address
sheet.GetRangeByNumber(row, col) // → ApiRange (0-indexed)
sheet.GetActiveCell()          // → ApiRange (current cell)
sheet.GetSelection()           // → ApiRange (selected range)
range.GetRow()                 // → number (0-indexed)
range.GetCol()                 // → number (0-indexed)
range.GetValue()               // → string (single cell) or string[][] (range)
range.SetValue(val)            // set value
range.GetRowsCount()           // number of rows in range
range.GetColumnsCount()        // number of cols in range
range.GetCells(row, col)       // → cell within range
range.Select()                 // select the range
range.GetAddress()             // → string like "$A$1:$B$5"
```

### Formatting

```javascript
range.SetBold(true)
range.SetItalic(true)
range.SetFontSize(12)
range.SetFontColor(Api.CreateColorFromRGB(r, g, b))
range.SetFillColor(Api.CreateColorFromRGB(r, g, b))
range.SetFillColor('No Fill')  // remove fill
range.SetAlignHorizontal('left' | 'center' | 'right')
range.SetNumberFormat("#,##0.00")
Api.CreateColorFromRGB(30, 58, 95)  // → ApiColor
```

### Custom Properties (Persistence in Document)

```javascript
// Save data that persists in the .xlsx file
var props = Api.GetCustomProperties();
props.AddStringProperty("MY_KEY", "my value");
props.AddNumberProperty("MY_NUM", 42);
props.AddBoolProperty("MY_BOOL", true);

// Read
var val = props.GetPropertyValueByName("MY_KEY"); // → string or null
```

### Named Ranges

```javascript
sheet.AddDefName("myRange", "Sheet1!$A$1:$B$10");
var defName = sheet.GetDefName("myRange");
```

### Charts / Pivot

```javascript
// Pivot table (creates new worksheet)
var pivot = Api.InsertPivotNewWorksheet(dataRange);
pivot.AddRowField(fieldIndex);
pivot.AddDataField(fieldIndex);

// Charts
sheet.AddChart(dataRange, isRow, chartType, style, extX_EMU, extY_EMU);
```

## executeMethod — Call Editor Methods

Methods that operate on the editor UI, not the document content.

```javascript
window.Asc.plugin.executeMethod("MethodName", [params], callback);
```

### Key Methods for Spreadsheets

| Method | Params | Description |
|--------|--------|-------------|
| `AddToolbarMenuItem` | `[menuConfig]` | Register toolbar tab/buttons |
| `AddContextMenuItem` | `[menuConfig]` | Register context menu items |
| `CloseWindow` | `[]` | Close current plugin window |
| `GetSelectionType` | `[]` | Returns "none", "text", "drawing", etc. |
| `GetSelectedText` | `[]` | Get selected text content |
| `OnWindowDockChangedCallback` | `[windowId]` | Sync docking state |
| `AttachEvent` | `[eventName, callback]` | Attach editor event |
| `ToolbarMenuClick` | `[itemId]` | Programmatic toolbar click |

## Toolbar Registration

```javascript
window.Asc.plugin.executeMethod('AddToolbarMenuItem', [{
    guid: window.Asc.plugin.info.guid,
    tabs: [{
        id: 'MyTab',
        text: 'My Tab Label',
        items: [
            {
                id: 'my-btn',
                type: 'button',
                text: 'Button Label',
                hint: 'Tooltip text',
                icons: 'resources/icons/%theme-type%(light|dark)/icon.svg'
            },
            {
                id: 'my-split',
                type: 'button',
                text: 'Split Button',
                icons: 'resources/icons/%theme-type%(light|dark)/icon.svg',
                split: true,
                items: [
                    { id: 'sub-1', text: 'Sub Action 1' },
                    { id: 'sub-2', text: 'Sub Action 2' }
                ]
            }
        ]
    }]
}]);

// Handle clicks
window.Asc.plugin.onToolbarMenuClick = function(id) {
    switch (id) {
        case 'my-btn': doSomething(); break;
    }
};
```

## Context Menu

### Dynamic Context Menu (recommended)

```javascript
// Listen for context menu show — MUST respond with AddContextMenuItem
window.Asc.plugin.attachEditorEvent('onContextMenuShow', function(options) {
    // options.type: "None", "Target", "Selection", "Image", "Shape", "OleObject"
    var items = [];
    if (options.type === 'Target' || options.type === 'Selection') {
        items.push({ id: 'my-action', text: 'My Action' });
    }
    window.Asc.plugin.executeMethod('AddContextMenuItem', [{
        guid: window.Asc.plugin.info.guid,
        items: items
    }]);
});

// Handle clicks
window.Asc.plugin.onContextMenuClick = function(id) {
    if (id === 'my-action') { /* ... */ }
};
```

### Legacy Context Menu (ButtonContextMenu)

```javascript
if (window.Asc.ButtonContextMenu) {
    var main = new window.Asc.ButtonContextMenu();
    main.text = 'Parent Menu';
    main.icons = 'resources/icons/%theme-type%(light|dark)/icon.svg';
    main.addCheckers('All');  // or 'Selection'

    var child = new window.Asc.ButtonContextMenu(main);
    child.text = 'Child Action';
    child.addCheckers('All');
    child.attachOnClick(function() { doSomething(); });
}
```

## PluginWindow — Modal Windows & Dockable Panels

### Creating Windows

```javascript
var myWindow = new window.Asc.PluginWindow();

// Attach events BEFORE show()
myWindow.attachEvent('onMyEvent', function(data) { /* from child */ });
myWindow.attachEvent('onClose', function() { myWindow = null; });
myWindow.attachEvent('onDockedChanged', function(newType) {
    // newType: "window" or "panel"
    localStorage.setItem('placement', newType);
    window.Asc.plugin.executeMethod('OnWindowDockChangedCallback', [myWindow.id]);
});

myWindow.show({
    url: 'my-page.html',
    description: 'Window Title',
    isVisual: true,
    buttons: [
        { text: 'OK', primary: true },      // id = 0
        { text: 'Cancel', primary: false }   // id = 1
    ],
    isModal: true,           // true = modal, false = modeless
    isCanDocked: false,      // true = can be docked as panel
    type: 'window',          // 'window' or 'panel' (for dockable)
    EditorsSupport: ['cell'],
    size: [640, 480]         // [width, height]
});
```

### Communication: Background ↔ Child Window

```
Background (parent)                    Child Window (iframe)
─────────────────                      ────────────────────
myWindow.command('eventName', data) →  Asc.plugin.attachEvent('eventName', fn)
                                       
myWindow.attachEvent('evt', fn)     ←  Asc.plugin.sendToPlugin('evt', data)
```

```javascript
// PARENT → CHILD
myWindow.command('onConfigLoaded', { key: 'value' });

// CHILD (in the HTML page loaded by the window)
window.Asc.plugin.attachEvent('onConfigLoaded', function(data) {
    console.log(data.key); // 'value'
});

// CHILD → PARENT
window.Asc.plugin.sendToPlugin('onUserAction', { action: 'save' });

// PARENT
myWindow.attachEvent('onUserAction', function(data) {
    console.log(data.action); // 'save'
});
```

### Button Handler in Child Windows

```javascript
// In child HTML
window.Asc.plugin.button = function(id) {
    if (id === 0) { /* primary — do work */ }
    if (id === 1 || id === -1) {
        window.Asc.plugin.executeMethod('CloseWindow');
    }
};
```

## Editor Events

Subscribe with `attachEditorEvent` (preferred since v8.2) or via `postMessage` pattern.

### Available Spreadsheet Events

| Event | Fires When | Callback Params |
|-------|-----------|-----------------|
| `onTargetPositionChanged` | Cell selection changes | (none — read cell via callCommand) |
| `onChangeCurrentSheet` | User switches sheet | `index` |
| `onContextMenuShow` | Right-click menu opens | `options` with `.type` |
| `onDocumentContentReady` | Document fully loaded | (none) |

```javascript
window.Asc.plugin.attachEditorEvent('onTargetPositionChanged', function() {
    // Read current cell position via callCommand
});

window.Asc.plugin.attachEditorEvent('onChangeCurrentSheet', function(index) {
    // Restore state for this sheet
});
```

### Legacy Event Attachment (postMessage)

Used when `attachEditorEvent` is not available:

```javascript
function attachEvent(eventName) {
    var info = window.Asc.plugin.info;
    info.type = 'attachEvent';
    info.name = eventName;
    var msg = JSON.stringify(info);
    if (window.parent !== window) window.parent.postMessage(msg, '*');
    if (typeof window.plugin_sendMessage === 'function') window.plugin_sendMessage(msg);
}

// Then handle via message listener
window.addEventListener('message', function(event) {
    var msg = JSON.parse(event.data);
    if (msg.type === 'onEvent') {
        if (msg.eventName === 'onToolbarMenuClick') handleClick(msg.eventData);
    }
});
```

## config.json Structure

```json
{
    "name": "Plugin Name",
    "guid": "asc.{GUID}",
    "version": "1.0.0",
    "variations": [
        {
            "url": "background.html",
            "type": "background",
            "isVisual": false,
            "isModal": false,
            "isInsideMode": false,
            "EditorsSupport": ["cell"],
            "initDataType": "none",
            "events": ["onToolbarMenuClick", "onContextMenuClick"]
        },
        {
            "url": "index.html",
            "type": "panel",
            "isVisual": true,
            "isModal": false,
            "isInsideMode": true,
            "EditorsSupport": ["cell"],
            "size": [380, 600]
        }
    ]
}
```

## Persistence Strategies

| Strategy | Scope | Survives Reopen | Notes |
|----------|-------|-----------------|-------|
| `ApiCustomProperties` | Document | Yes | Best for config. Key-value strings in the .xlsx |
| Hidden sheet (`_Meta`) | Document | Yes | Good for tabular metadata |
| `localStorage` | Browser | No (per-browser) | Good for UI preferences (panel position, format) |

## Common Pitfalls

1. **Missing `plugins-ui.js`**: `sendToPlugin` is undefined without `<script src="../v1/plugins-ui.js">` in child windows
2. **`.gz` caching**: OnlyOffice pre-compresses files. After updating plugin files, delete `.gz` versions: `find /path/to/plugin -name "*.gz" -delete`
3. **`Asc.scope` limitations**: Only JSON-serializable values. No functions, no DOM, no class instances. Use `JSON.stringify` for complex objects
4. **Async in `button` handler**: Plugin context may be destroyed before async completes. Keep button handlers synchronous; use `sendToPlugin` from child for async flows
5. **`callCommand` isolation**: The function runs in a separate context. No closures, no outer variables. Only `Asc.scope` and `Api.*` are available
6. **Context menu timing**: When listening to `onContextMenuShow`, you MUST call `AddContextMenuItem` (even with empty items) or the menu hangs
7. **Cache busting**: Append `?v=N` to script tags in HTML files to force reload after updates
8. **Guard `PluginWindow`**: Always check `if (!window.Asc.PluginWindow) return;` before creating windows
9. **`attachEvent` in init**: Register toolbar/context menu in `init` with `setTimeout(fn, 100)` to ensure editor is ready
10. **Button IDs**: In `PluginWindow.show({ buttons: [...] })`, buttons get IDs 0, 1, 2... in order. Primary = 0, Cancel = 1
