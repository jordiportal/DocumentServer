/**
 * PivotConfig — Models the complete state of a data analysis view.
 *
 * Zones:
 *   rowFields    — dimension names displayed as row headers (leading columns)
 *   columnFields — dimension names whose values become dynamic column groups (cross-tab)
 *   filterFields — dimension names used to filter (not displayed in table)
 *   valueFields  — measure names displayed as data columns
 *
 * When columnFields is empty the layout is a flat table.
 * When columnFields has entries the layout becomes a cross-tab / pivot.
 */

(function(window) {
    'use strict';

    var ZONES = ['rowFields', 'columnFields', 'filterFields', 'valueFields'];

    function PivotConfig(init) {
        var cfg = init || {};
        this.source       = cfg.source       || '';
        this.sourceName   = cfg.sourceName   || '';
        this.rowFields    = (cfg.rowFields    || []).slice();
        this.columnFields = (cfg.columnFields || []).slice();
        this.filterFields = (cfg.filterFields || []).slice();
        this.valueFields  = (cfg.valueFields  || []).slice();
        this.filters      = {};
        this.sortField    = cfg.sortField    || null;
        // hierarchyState: { [hierarchyName]: { expandedLevel: number, expandedNodes: { [path]: true } } }
        this.hierarchyState = {};

        if (cfg.filters) {
            for (var k in cfg.filters) {
                if (cfg.filters.hasOwnProperty(k)) {
                    this.filters[k] = cfg.filters[k].slice();
                }
            }
        }
        if (cfg.hierarchyState) {
            for (var h in cfg.hierarchyState) {
                if (cfg.hierarchyState.hasOwnProperty(h)) {
                    this.hierarchyState[h] = {
                        expandedLevel: cfg.hierarchyState[h].expandedLevel || 0,
                        expandedNodes: cfg.hierarchyState[h].expandedNodes || {}
                    };
                }
            }
        }
    }

    PivotConfig.ZONES = ZONES;

    /**
     * Returns true when the layout is a cross-tab (has column dimensions).
     */
    PivotConfig.prototype.isCrossTab = function() {
        return this.columnFields.length > 0;
    };

    PivotConfig.prototype.moveField = function(name, fromZone, toZone) {
        if (fromZone && this[fromZone]) {
            var idx = this[fromZone].indexOf(name);
            if (idx !== -1) this[fromZone].splice(idx, 1);
        }
        if (toZone && this[toZone]) {
            if (this[toZone].indexOf(name) === -1) {
                this[toZone].push(name);
            }
        }
    };

    PivotConfig.prototype.removeField = function(name) {
        for (var i = 0; i < ZONES.length; i++) {
            var arr = this[ZONES[i]];
            var idx = arr.indexOf(name);
            if (idx !== -1) { arr.splice(idx, 1); return ZONES[i]; }
        }
        return null;
    };

    PivotConfig.prototype.findZone = function(name) {
        for (var i = 0; i < ZONES.length; i++) {
            if (this[ZONES[i]].indexOf(name) !== -1) return ZONES[i];
        }
        return null;
    };

    PivotConfig.prototype.setFilters = function(dimName, values) {
        if (!values || values.length === 0) {
            delete this.filters[dimName];
        } else {
            this.filters[dimName] = values.slice();
        }
    };

    /**
     * Build query parameters. columnFields are requested as dimensions too so the
     * DataSource returns the cartesian product needed for pivoting.
     * Hierarchies in rowFields are expanded into their constituent dimensions up to expandedLevel+1.
     */
    PivotConfig.prototype.getQueryParams = function(metadata) {
        var self = this;
        var resolvedRowDims = [];

        this.rowFields.forEach(function(name) {
            var hier = self._findHierarchy(name, metadata);
            if (hier) {
                var maxLevel = self.getEffectiveLevel(name, hier);
                for (var i = 0; i < maxLevel; i++) {
                    var dimRef = hier.levels[i].dimensionRef;
                    if (resolvedRowDims.indexOf(dimRef) === -1) {
                        resolvedRowDims.push(dimRef);
                    }
                }
            } else {
                if (resolvedRowDims.indexOf(name) === -1) {
                    resolvedRowDims.push(name);
                }
            }
        });

        var allDims = resolvedRowDims.concat(this.columnFields, this.filterFields);
        var filters = [];
        for (var dim in this.filters) {
            if (this.filters.hasOwnProperty(dim) && this.filters[dim].length > 0) {
                filters.push({ dimension: dim, values: this.filters[dim] });
            }
        }
        return {
            source: this.source,
            dimensions: allDims.length > 0 ? allDims : undefined,
            measures: this.valueFields.length > 0 ? this.valueFields : undefined,
            filters: filters.length > 0 ? filters : undefined
        };
    };

    /**
     * Find a hierarchy definition by name from metadata.
     * Returns the hierarchy object or null.
     */
    PivotConfig.prototype._findHierarchy = function(name, metadata) {
        if (!metadata || !metadata.hierarchies) return null;
        for (var i = 0; i < metadata.hierarchies.length; i++) {
            if (metadata.hierarchies[i].name === name) return metadata.hierarchies[i];
        }
        return null;
    };

    /**
     * Get ordered column captions for flat layout (no cross-tab).
     * Row dims first (expanding hierarchies), then measures.
     */
    PivotConfig.prototype.getColumnOrder = function(metadata) {
        var self = this;
        var cols = [];

        this.rowFields.forEach(function(name) {
            var hier = self._findHierarchy(name, metadata);
            if (hier) {
                var maxLevel = self.getEffectiveLevel(name, hier);
                for (var i = 0; i < maxLevel; i++) {
                    var lev = hier.levels[i];
                    var dim = metadata.dimensions.find(function(d) { return d.name === lev.dimensionRef; });
                    cols.push(dim ? dim.caption : lev.caption);
                }
            } else {
                var dim = metadata.dimensions.find(function(d) { return d.name === name; });
                cols.push(dim ? dim.caption : name);
            }
        });

        this.valueFields.forEach(function(name) {
            var meas = metadata.measures.find(function(m) { return m.name === name; });
            cols.push(meas ? meas.caption : name);
        });

        return cols;
    };

    /**
     * Returns an array aligned with getColumnOrder():
     *   null for dimension columns, { unit, decimals, symbol } for measure columns.
     * `symbol` is the resolved display character (pre-resolved so callCommand doesn't need window access).
     */
    PivotConfig.prototype.getColumnFormats = function(metadata, isHierarchyMode) {
        var self = this;
        var formats = [];

        if (isHierarchyMode) {
            // In hierarchy mode, buildHierarchicalData outputs a single tree column
            formats.push(null);
        } else {
            this.rowFields.forEach(function(name) {
                var hier = self._findHierarchy(name, metadata);
                if (hier) {
                    var maxLevel = self.getEffectiveLevel(name, hier);
                    for (var i = 0; i < maxLevel; i++) {
                        formats.push(null);
                    }
                } else {
                    formats.push(null);
                }
            });
        }

        this.valueFields.forEach(function(name) {
            var meas = metadata.measures.find(function(m) { return m.name === name; });
            if (meas && meas.unit) {
                var sym = window.UnitFormatter ? window.UnitFormatter.displayLabel(meas.unit) : meas.unit;
                formats.push({ unit: meas.unit, decimals: meas.decimals != null ? meas.decimals : 2, symbol: sym });
            } else {
                formats.push(null);
            }
        });

        return formats;
    };

    /**
     * Returns true if any rowField is a hierarchy.
     */
    PivotConfig.prototype.hasHierarchies = function(metadata) {
        if (!metadata || !metadata.hierarchies || metadata.hierarchies.length === 0) return false;
        var self = this;
        return this.rowFields.some(function(name) {
            return self._findHierarchy(name, metadata) !== null;
        });
    };

    /**
     * Set the expanded level for a hierarchy (global panel control).
     */
    PivotConfig.prototype.setHierarchyLevel = function(hierName, level) {
        if (!this.hierarchyState[hierName]) {
            this.hierarchyState[hierName] = { expandedLevel: 0, expandedNodes: {} };
        }
        this.hierarchyState[hierName].expandedLevel = level;
        // Reset individual drill-down state when panel level changes
        this.hierarchyState[hierName].expandedNodes = {};
    };

    /**
     * Toggle a node's expanded state for drill-down.
     * expandedNodes values: true = explicitly expanded, false = explicitly collapsed
     * Nodes NOT in expandedNodes use globalLevel to determine state.
     * @param {string} hierName
     * @param {string} nodePath
     * @returns {boolean} new expanded state
     */
    PivotConfig.prototype.toggleNode = function(hierName, nodePath) {
        if (!this.hierarchyState[hierName]) {
            this.hierarchyState[hierName] = { expandedLevel: 0, expandedNodes: {} };
        }
        var state = this.hierarchyState[hierName];
        var nodes = state.expandedNodes;
        var nodeLevel = nodePath.split('/').length - 1;
        var isImplicitlyExpanded = nodeLevel < state.expandedLevel;

        var currentlyExpanded;
        if (nodes.hasOwnProperty(nodePath)) {
            currentlyExpanded = nodes[nodePath];
        } else {
            currentlyExpanded = isImplicitlyExpanded;
        }

        if (currentlyExpanded) {
            // Collapse: if implicitly expanded, mark as explicitly collapsed
            if (isImplicitlyExpanded) {
                nodes[nodePath] = false;
            } else {
                delete nodes[nodePath];
            }
            // Also collapse children
            var prefix = nodePath + '/';
            for (var key in nodes) {
                if (nodes.hasOwnProperty(key) && key.indexOf(prefix) === 0) {
                    delete nodes[key];
                }
            }
            return false;
        } else {
            // Expand: if explicitly collapsed, just remove the override; otherwise mark as expanded
            if (nodes[nodePath] === false) {
                delete nodes[nodePath];
            } else {
                nodes[nodePath] = true;
            }
            return true;
        }
    };

    /**
     * Check if a node is expanded (considering both explicit state and globalLevel).
     */
    PivotConfig.prototype.isNodeExpanded = function(hierName, nodePath) {
        var state = this.hierarchyState[hierName];
        if (!state) return false;
        var nodes = state.expandedNodes || {};
        if (nodes.hasOwnProperty(nodePath)) {
            return nodes[nodePath];
        }
        var nodeLevel = nodePath.split('/').length - 1;
        return nodeLevel < state.expandedLevel;
    };

    /**
     * Get the effective query level: max of expandedLevel and deepest expanded node + 1.
     */
    PivotConfig.prototype.getEffectiveLevel = function(hierName, hierarchy) {
        var state = this.hierarchyState[hierName];
        if (!state) return 1;
        var level = state.expandedLevel;
        if (state.expandedNodes) {
            for (var path in state.expandedNodes) {
                if (state.expandedNodes.hasOwnProperty(path) && state.expandedNodes[path] === true) {
                    var depth = path.split('/').length;
                    if (depth > level) level = depth;
                }
            }
        }
        return Math.min(level + 1, hierarchy.levels.length);
    };

    /**
     * Build hierarchical data with drill-down indicators.
     * Uses a SINGLE tree column (hierarchy caption) with ▶/▼ + indentation,
     * followed by measure columns.
     *
     * Generates tree nodes for EACH unique prefix path in the data, so parent rows
     * always appear above their children.
     *
     * Returns { columns: string[], rows: Object[], drillColumn: number, drillInfo: Object[] }
     */
    PivotConfig.prototype.buildHierarchicalData = function(metadata, flatData) {
        var self = this;
        if (!flatData || flatData.length === 0) return { columns: [], rows: [], drillColumn: -1, drillInfo: [] };

        // Find the hierarchy
        var hierName = null;
        var hierarchy = null;
        var hierDimCaptions = [];

        this.rowFields.forEach(function(name) {
            var hier = self._findHierarchy(name, metadata);
            if (hier) {
                hierName = name;
                hierarchy = hier;
                var maxLevel = self.getEffectiveLevel(name, hier);
                for (var i = 0; i < maxLevel; i++) {
                    var lev = hier.levels[i];
                    var dim = metadata.dimensions.find(function(d) { return d.name === lev.dimensionRef; });
                    hierDimCaptions.push(dim ? dim.caption : lev.caption);
                }
            }
        });

        if (!hierarchy || hierDimCaptions.length === 0) {
            return { columns: [], rows: flatData, drillColumn: -1, drillInfo: [] };
        }

        var totalHierDepth = hierarchy.levels.length;
        var state = self.hierarchyState[hierName] || { expandedLevel: 0, expandedNodes: {} };
        var expandedNodes = state.expandedNodes || {};
        var globalLevel = state.expandedLevel || 0;

        // Output columns: single tree column + measures
        var treeColName = hierarchy.caption || hierName;
        var measureCaptions = [];
        this.valueFields.forEach(function(name) {
            var m = metadata.measures.find(function(x) { return x.name === name; });
            measureCaptions.push(m ? m.caption : name);
        });
        var columns = [treeColName].concat(measureCaptions);

        // Step 1: Build a tree of unique nodes from the flat data.
        // Each node: { path, level, displayValue, measures (aggregated from children) }
        var nodeMap = {}; // path → { displayValue, measures, level }

        for (var r = 0; r < flatData.length; r++) {
            var row = flatData[r];
            // Generate a node for EACH prefix level
            for (var lvl = 0; lvl < hierDimCaptions.length; lvl++) {
                var val = row[hierDimCaptions[lvl]];
                if (!val) break;
                var parts = [];
                for (var p = 0; p <= lvl; p++) parts.push(row[hierDimCaptions[p]]);
                var path = parts.join('/');

                if (!nodeMap[path]) {
                    nodeMap[path] = { displayValue: val, level: lvl, measures: {} };
                    for (var m = 0; m < measureCaptions.length; m++) {
                        nodeMap[path].measures[measureCaptions[m]] = 0;
                    }
                }
                // Aggregate measures at this node (sum of all rows that pass through)
                if (lvl === hierDimCaptions.length - 1) {
                    for (var m = 0; m < measureCaptions.length; m++) {
                        var v = parseFloat(row[measureCaptions[m]]);
                        if (!isNaN(v)) nodeMap[path].measures[measureCaptions[m]] += v;
                    }
                }
            }
        }

        // Also aggregate measures up to parent nodes
        var allPaths = Object.keys(nodeMap).sort();
        for (var i = 0; i < allPaths.length; i++) {
            var node = nodeMap[allPaths[i]];
            if (node.level > 0) {
                var parentParts = allPaths[i].split('/');
                parentParts.pop();
                var parentPath = parentParts.join('/');
                if (nodeMap[parentPath] && node.level === hierDimCaptions.length - 1) {
                    // Don't double-aggregate; parent sums will be built separately below
                }
            }
        }

        // Rebuild parent measures as sum of their immediate children at deepest query level
        // (simpler: just sum all leaf descendants)
        for (var i = 0; i < allPaths.length; i++) {
            var node = nodeMap[allPaths[i]];
            if (node.level < hierDimCaptions.length - 1) {
                // Reset and sum from children
                for (var m = 0; m < measureCaptions.length; m++) {
                    node.measures[measureCaptions[m]] = 0;
                }
                var prefix = allPaths[i] + '/';
                for (var j = 0; j < allPaths.length; j++) {
                    var child = nodeMap[allPaths[j]];
                    if (allPaths[j].indexOf(prefix) === 0 && child.level === hierDimCaptions.length - 1) {
                        for (var m = 0; m < measureCaptions.length; m++) {
                            node.measures[measureCaptions[m]] += child.measures[measureCaptions[m]];
                        }
                    }
                }
            }
        }

        // Step 2: Sort nodes for tree display (alphabetical within each parent group)
        allPaths.sort(function(a, b) {
            var pa = a.split('/'), pb = b.split('/');
            for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
                var va = pa[i] || '', vb = pb[i] || '';
                var cmp = va.localeCompare(vb);
                if (cmp !== 0) return cmp;
            }
            return 0;
        });

        // Step 3: Build output with subtotals using recursive tree traversal
        var visibleRows = [];
        var drillInfo = [];

        function isNodeExpanded(path, level) {
            if (expandedNodes.hasOwnProperty(path)) {
                return expandedNodes[path];
            }
            return level < globalLevel;
        }

        function makeIndent(level) {
            var s = '';
            for (var i = 0; i < level; i++) s += '    ';
            return s;
        }

        function getDirectChildren(parentPath, parentLevel) {
            var prefix = parentPath + '/';
            var childLevel = parentLevel + 1;
            var children = [];
            for (var i = 0; i < allPaths.length; i++) {
                var p = allPaths[i];
                if (nodeMap[p].level === childLevel && p.indexOf(prefix) === 0) {
                    // Ensure it's a direct child (no further slashes after prefix)
                    var remainder = p.substring(prefix.length);
                    if (remainder.indexOf('/') === -1) {
                        children.push(p);
                    }
                }
            }
            return children;
        }

        function emitNode(path) {
            var node = nodeMap[path];
            var expanded = isNodeExpanded(path, node.level);
            var hasChildren = node.level < totalHierDepth - 1;

            var prefix = hasChildren ? (expanded ? '\u25BC ' : '\u25B6 ') : '    ';
            var indent = makeIndent(node.level);

            var outRow = {};
            outRow[treeColName] = prefix + indent + node.displayValue;
            for (var m = 0; m < measureCaptions.length; m++) {
                outRow[measureCaptions[m]] = node.measures[measureCaptions[m]];
            }
            visibleRows.push(outRow);
            drillInfo.push({
                hierName: hierName,
                nodePath: path,
                level: node.level,
                expanded: expanded,
                hasChildren: hasChildren
            });

            // If expanded, emit children recursively, then subtotal
            if (expanded && hasChildren) {
                var children = getDirectChildren(path, node.level);
                for (var c = 0; c < children.length; c++) {
                    emitNode(children[c]);
                }
                // Subtotal row after the group
                var totalRow = {};
                totalRow[treeColName] = makeIndent(node.level + 1) + 'Total ' + node.displayValue;
                for (var m = 0; m < measureCaptions.length; m++) {
                    totalRow[measureCaptions[m]] = node.measures[measureCaptions[m]];
                }
                visibleRows.push(totalRow);
                drillInfo.push({
                    hierName: hierName,
                    nodePath: path,
                    level: node.level,
                    isTotal: true
                });
            }
        }

        // Emit all top-level nodes
        var topLevelPaths = [];
        for (var i = 0; i < allPaths.length; i++) {
            if (nodeMap[allPaths[i]].level === 0) topLevelPaths.push(allPaths[i]);
        }
        for (var i = 0; i < topLevelPaths.length; i++) {
            emitNode(topLevelPaths[i]);
        }

        // Gran Total row
        var grandRow = {};
        grandRow[treeColName] = 'Gran Total';
        for (var m = 0; m < measureCaptions.length; m++) {
            var sum = 0;
            for (var i = 0; i < topLevelPaths.length; i++) {
                sum += nodeMap[topLevelPaths[i]].measures[measureCaptions[m]];
            }
            grandRow[measureCaptions[m]] = sum;
        }
        visibleRows.push(grandRow);
        drillInfo.push({
            hierName: hierName,
            nodePath: '',
            level: -1,
            isGrandTotal: true
        });

        return {
            columns: columns,
            rows: visibleRows,
            drillColumn: 0,
            drillInfo: drillInfo
        };
    };

    /**
     * Add subtotals and Grand Total to flat (non-hierarchical) data.
     * Groups by the first row dimension, inserts subtotal after each group,
     * and appends a Grand Total at the end.
     * Returns { rows, drillInfo }.
     */
    PivotConfig.prototype.addTotalsToFlatData = function(metadata, flatData, columns) {
        if (!flatData || flatData.length === 0) return { rows: flatData, drillInfo: [] };

        var self = this;
        var measureCaptions = [];
        this.valueFields.forEach(function(name) {
            var m = metadata.measures.find(function(x) { return x.name === name; });
            measureCaptions.push(m ? m.caption : name);
        });

        // Resolve dimension captions for row fields
        var dimCaptions = [];
        this.rowFields.forEach(function(name) {
            var dim = metadata.dimensions.find(function(d) { return d.name === name; });
            dimCaptions.push(dim ? dim.caption : name);
        });

        var rows = [];
        var drillInfo = [];

        // Only add subtotals if there are 2+ row dimensions
        if (dimCaptions.length >= 2) {
            var groupCol = dimCaptions[0];
            var currentGroup = null;
            var groupMeasures = {};

            for (var r = 0; r < flatData.length; r++) {
                var groupVal = flatData[r][groupCol];

                // Detect group change
                if (groupVal !== currentGroup && currentGroup !== null) {
                    // Emit subtotal for previous group
                    var subRow = {};
                    subRow[groupCol] = 'Total ' + currentGroup;
                    for (var m = 0; m < measureCaptions.length; m++) {
                        subRow[measureCaptions[m]] = groupMeasures[measureCaptions[m]];
                    }
                    rows.push(subRow);
                    drillInfo.push({ isTotal: true });
                    groupMeasures = {};
                }

                if (groupVal !== currentGroup) {
                    currentGroup = groupVal;
                    for (var m = 0; m < measureCaptions.length; m++) {
                        groupMeasures[measureCaptions[m]] = 0;
                    }
                }

                // Accumulate measures
                for (var m = 0; m < measureCaptions.length; m++) {
                    var v = parseFloat(flatData[r][measureCaptions[m]]);
                    if (!isNaN(v)) groupMeasures[measureCaptions[m]] += v;
                }

                rows.push(flatData[r]);
                drillInfo.push(null);
            }

            // Last group subtotal
            if (currentGroup !== null) {
                var subRow = {};
                subRow[groupCol] = 'Total ' + currentGroup;
                for (var m = 0; m < measureCaptions.length; m++) {
                    subRow[measureCaptions[m]] = groupMeasures[measureCaptions[m]];
                }
                rows.push(subRow);
                drillInfo.push({ isTotal: true });
            }
        } else {
            // Single dimension: no subtotals, just copy data
            for (var r = 0; r < flatData.length; r++) {
                rows.push(flatData[r]);
                drillInfo.push(null);
            }
        }

        // Gran Total
        var grandRow = {};
        if (columns && columns.length > 0) {
            grandRow[columns[0]] = 'Gran Total';
        }
        for (var m = 0; m < measureCaptions.length; m++) {
            var sum = 0;
            for (var r = 0; r < flatData.length; r++) {
                var v = parseFloat(flatData[r][measureCaptions[m]]);
                if (!isNaN(v)) sum += v;
            }
            grandRow[measureCaptions[m]] = sum;
        }
        rows.push(grandRow);
        drillInfo.push({ isGrandTotal: true });

        return { rows: rows, drillInfo: drillInfo };
    };

    /**
     * Build cross-tab header info and pivoted data matrix.
     * Returns { headerRows: string[][], dataRows: (string|number)[][] }
     *
     * @param {Object}   metadata — { dimensions[], measures[] }
     * @param {Object[]} flatData — raw rows from DataSource (flat objects keyed by caption)
     */
    PivotConfig.prototype.buildCrossTab = function(metadata, flatData) {
        var self = this;
        if (!this.isCrossTab()) return null;

        // Resolve captions
        function dimCaption(name) {
            var d = metadata.dimensions.find(function(x) { return x.name === name; });
            return d ? d.caption : name;
        }
        function measCaption(name) {
            var m = metadata.measures.find(function(x) { return x.name === name; });
            return m ? m.caption : name;
        }

        var rowCaptions = this.rowFields.map(dimCaption);
        var colCaptions = this.columnFields.map(dimCaption);
        var valCaptions = this.valueFields.map(measCaption);
        var numValues   = valCaptions.length || 1;

        // Extract unique combinations for column dimension values (ordered by appearance)
        var colCombos = [];
        var colComboSet = {};
        flatData.forEach(function(row) {
            var key = colCaptions.map(function(c) { return row[c] || ''; }).join('\x00');
            if (!colComboSet[key]) {
                colComboSet[key] = true;
                colCombos.push(colCaptions.map(function(c) { return row[c] || ''; }));
            }
        });

        // --- Build header rows ---
        // Row 0: row-dim labels (empty or dim name) + col-dim combo labels spanning numValues each
        // Row 1 (if >1 value): row-dim captions + measure captions repeated per combo
        var headerRow0 = rowCaptions.slice();
        var headerRow1 = rowCaptions.map(function() { return ''; }); // blanks under dim names
        var needsTwoHeaders = numValues > 1;

        colCombos.forEach(function(combo) {
            var label = combo.join(' / ');
            headerRow0.push(label);
            for (var v = 1; v < numValues; v++) headerRow0.push('');
            if (needsTwoHeaders) {
                valCaptions.forEach(function(vc) { headerRow1.push(vc); });
            }
        });

        // If only 1 value field, row 0 suffices and we put the measure name in the combo label
        if (!needsTwoHeaders && valCaptions.length === 1) {
            // Append measure name to each combo label for clarity
            var measName = valCaptions[0];
            var idx = rowCaptions.length;
            colCombos.forEach(function(combo) {
                headerRow0[idx] = combo.join(' / ') + ' - ' + measName;
                idx++;
            });
        }

        var headerRows = [headerRow0];
        if (needsTwoHeaders) headerRows.push(headerRow1);

        // --- Build data index for fast lookup ---
        // Key = rowValues joined, sub-key = colValues joined → row object
        var dataIndex = {};
        flatData.forEach(function(row) {
            var rowKey = rowCaptions.map(function(c) { return row[c] || ''; }).join('\x00');
            var colKey = colCaptions.map(function(c) { return row[c] || ''; }).join('\x00');
            if (!dataIndex[rowKey]) dataIndex[rowKey] = {};
            dataIndex[rowKey][colKey] = row;
        });

        // Unique row combos (ordered by appearance)
        var rowCombos = [];
        var rowComboSet = {};
        flatData.forEach(function(row) {
            var key = rowCaptions.map(function(c) { return row[c] || ''; }).join('\x00');
            if (!rowComboSet[key]) {
                rowComboSet[key] = true;
                rowCombos.push(rowCaptions.map(function(c) { return row[c] || ''; }));
            }
        });

        // --- Build data rows ---
        var dataRows = [];
        rowCombos.forEach(function(rowVals) {
            var rowKey = rowVals.join('\x00');
            var outRow = rowVals.slice(); // leading dim values
            colCombos.forEach(function(combo) {
                var colKey = combo.join('\x00');
                var srcRow = (dataIndex[rowKey] || {})[colKey];
                valCaptions.forEach(function(vc) {
                    outRow.push(srcRow ? (srcRow[vc] != null ? srcRow[vc] : '') : '');
                });
            });
            dataRows.push(outRow);
        });

        // --- Build columnFormats (aligned with headerRow0) ---
        var columnFormats = [];
        // Row-dim columns have no numeric format
        rowCaptions.forEach(function() { columnFormats.push(null); });
        // Each colCombo × each valueField
        colCombos.forEach(function() {
            self.valueFields.forEach(function(name) {
                var meas = metadata.measures.find(function(m) { return m.name === name; });
                if (meas && meas.unit) {
                    var sym = window.UnitFormatter ? window.UnitFormatter.displayLabel(meas.unit) : meas.unit;
                    columnFormats.push({ unit: meas.unit, decimals: meas.decimals != null ? meas.decimals : 2, symbol: sym });
                } else {
                    columnFormats.push(null);
                }
            });
        });

        return {
            headerRows: headerRows,
            dataRows: dataRows,
            totalCols: headerRow0.length,
            columnFormats: columnFormats
        };
    };

    PivotConfig.prototype.toJSON = function() {
        return {
            source:         this.source,
            sourceName:     this.sourceName,
            rowFields:      this.rowFields.slice(),
            columnFields:   this.columnFields.slice(),
            filterFields:   this.filterFields.slice(),
            valueFields:    this.valueFields.slice(),
            filters:        JSON.parse(JSON.stringify(this.filters)),
            sortField:      this.sortField,
            hierarchyState: JSON.parse(JSON.stringify(this.hierarchyState))
        };
    };

    PivotConfig.fromJSON = function(obj) {
        if (!obj) return null;
        if (typeof obj === 'string') {
            try { obj = JSON.parse(obj); } catch(e) { return null; }
        }
        return new PivotConfig(obj);
    };

    PivotConfig.prototype.equals = function(other) {
        if (!other) return false;
        return JSON.stringify(this.toJSON()) === JSON.stringify(other.toJSON());
    };

    PivotConfig.fromMetadata = function(source, sourceName, metadata) {
        var cfg = new PivotConfig({ source: source, sourceName: sourceName });
        if (metadata.dimensions && metadata.dimensions.length > 0) {
            cfg.rowFields.push(metadata.dimensions[0].name);
        }
        metadata.measures.forEach(function(m) {
            cfg.valueFields.push(m.name);
        });
        return cfg;
    };

    window.PivotConfig = PivotConfig;

})(window);
