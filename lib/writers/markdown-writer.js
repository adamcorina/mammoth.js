var _ = require("underscore");

var tableState = {
    isTable: false,
    trCount: 0,
    tdCount: 0
};

var listState = {
    list: null,
    listItem: {}
};

var preserveHTMLNestingLevel = 0;

function computeStart(htmlTagName, htmlAttributes, markdownStartIfTable, markdownStartIfNotTable) {
    if (preserveHTMLNestingLevel > 0) {
        var formattedHtmlAttributes = "";
        for (var attribute in htmlAttributes) {
            formattedHtmlAttributes += attribute + "=" + "\"" + htmlAttributes[attribute] + "\" ";
        }
        return "<" + htmlTagName + " " + formattedHtmlAttributes + ">";
    }
    return tableState.isTable ? markdownStartIfTable : markdownStartIfNotTable;
}

function computeEnd(htmlTagName, markdownEndIfTable, markdownEndIfNotTable) {
    if (preserveHTMLNestingLevel > 0) {
        return "</" + htmlTagName + ">";
    }
    return tableState.isTable ? markdownEndIfTable : markdownEndIfNotTable;
}

function computeSelfClosing(htmlTagName, htmlAttributes, markdownStartIfTable, markdownStartIfNotTable) {
    if (preserveHTMLNestingLevel > 0) {
        var formattedHtmlAttributes = "";
        for (var attribute in htmlAttributes) {
            formattedHtmlAttributes += attribute + "=" + "\"" + htmlAttributes[attribute] + "\" ";
        }
        return "<" + htmlTagName + " " + formattedHtmlAttributes + "/>";
    }
    return tableState.isTable ? markdownStartIfTable : markdownStartIfNotTable;
}

function symmetricMarkdownElement(end) {
    return function(tagName, attributes) {
        return {
            start: computeStart(tagName, attributes, end, end),
            end: computeEnd(tagName, end, end)
        };
    };
}

function markdownParagraph(tagName, attributes){
    return {
        start: computeStart(tagName, attributes, "", ""),
        end: computeEnd(tagName, " ", "\n\n")
    };
}

function markdownBr(tagName, attributes){
    return {
        start: computeSelfClosing(tagName, attributes, " ", "  \n")
    };
}

function markdownLink(tagName, attributes) {
    var href = attributes.href || "";
    if (href) {
        var end = "](" + href + ")";
        return {
            start: computeStart(tagName, attributes, "[", "["),
            end: computeEnd(tagName, end, end),
            anchorPosition: "before"
        };
    } else {
        return {};
    }
}

function markdownImage(tagName, attributes) {
    var src = attributes.src || "";
    var altText = attributes.alt || "";
    if (src || altText) {
        var start = "![" + altText + "](" + src + ")";
        return {
            start: computeSelfClosing(tagName, attributes, start, start)
        };
    } else {
        return {};
    }
}

function markdownHeader(index) {
    return function(tagName, attributes) {
        return {
            start: computeStart(tagName, attributes, "", repeatString("#", index) + " "),
            end: computeEnd(tagName, " ", "\n\n")
        };
    };
}

function markdownList(options) {
    return function(tagName, attributes) {
        return {
            start: function() {
                var hasParentList = !!listState.list;

                var start = computeStart(tagName, attributes, "", hasParentList ? "\n" : "");
                listState.list = {
                    isOrdered: options.isOrdered,
                    indent: listState.list ? listState.list.indent + 1 : 0,
                    count: 0
                };
                return start;
            },
            end: function() {
                var hasParentList = !!listState.list;

                return computeEnd(tagName, "", hasParentList ? "" : "\n");
            }
        };
    };
}

function markdownListItem(tagName, attributes) {
    var list = listState.list || {indent: 0, isOrdered: false, count: 0};

    list.count++;
    listState.listItem.hasClosed = false;
    
    var bullet = list.isOrdered ? list.count + "." : "-";
    var start = computeStart(tagName, attributes, "", repeatString("\t", list.indent) + bullet + " ");
        
    return {
        start: start,
        end: function() {
            if (!listState.listItem.hasClosed) {
                listState.listItem.hasClosed = true;
                return computeEnd(tagName, ";", "\n");
            }
        }
    };
}

function markdownTable(tagName, attributes) {
    tableState.isTable = true;
    tableState.tdCount = 0;
    tableState.trCount = 0;
    return {
        start: computeStart(tagName, attributes, "", ""),
        end: function() {
            tableState.isTable = false;
            return computeEnd(tagName, "\n", "\n");
        }
    };
}

function markdownTr(tagName, attributes) {
    return {
        start: computeStart(tagName, attributes, "", ""),
        end: function() {
            var end = "|\n";
            if (tableState.trCount === 0) {
                end += "|" + _.times(tableState.tdCount, _.constant("-|")).join("") + "\n";
            }
            tableState.trCount++;
            tableState.tdCount = 0;
            return computeEnd(tagName, end, end);
        }
    };
}

function markdownTd(tagName, attributes) {
    tableState.tdCount++;
    return {
        start: computeStart(tagName, attributes, "|", "|"),
        end: computeEnd(tagName, "", "")
    };
}

var htmlToMarkdown = {
    "p": markdownParagraph,
    "br": markdownBr,
    "ul": markdownList({isOrdered: false}),
    "ol": markdownList({isOrdered: true}),
    "li": markdownListItem,
    "strong": symmetricMarkdownElement("__"),
    "em": symmetricMarkdownElement("*"),
    "a": markdownLink,
    "img": markdownImage,
    "table": markdownTable,
    "tr": markdownTr,
    "td": markdownTd,
    "b": symmetricMarkdownElement("**"),
    "i": symmetricMarkdownElement("*"),
    "pre": symmetricMarkdownElement("```")
};

(function() {
    for (var i = 1; i <= 6; i++) {
        htmlToMarkdown["h" + i] = markdownHeader(i);
    }
})();

function repeatString(value, count) {
    return new Array(count + 1).join(value);
}

function markdownWriter(options) {
    options = options || {};

    var fragments = [];
    var elementStack = [];

    var preserveAsHTML = options.preserveAsHTML || [];
    
    function open(tagName, attributes) {
        attributes = attributes || {};

        if (preserveAsHTML.includes(tagName)) {
            preserveHTMLNestingLevel++;
        }
        
        var createElement = htmlToMarkdown[tagName] || function() {
            return {};
        };
        var element = createElement(tagName, attributes);
        elementStack.push({tagName: tagName, end: element.end, list: listState.list});
        
        var anchorBeforeStart = element.anchorPosition === "before";
        if (anchorBeforeStart) {
            writeAnchor(attributes);
        }

        var start = _.isFunction(element.start) ? element.start() : element.start;
        fragments.push(start || "");
        if (!anchorBeforeStart) {
            writeAnchor(attributes);
        }
    }
    
    function writeAnchor(attributes) {
        if (attributes.id) {
            fragments.push('<a id="' + attributes.id + '"></a>');
        }
    }
    
    function close() {
        var element = elementStack.pop();

        listState.list = element.list;
        var end = _.isFunction(element.end) ? element.end() : element.end;
        fragments.push(end || "");

        if (preserveAsHTML.includes(element.tagName)) {
            preserveHTMLNestingLevel--;
            if (preserveHTMLNestingLevel === 0) {
                fragments.push("\n\n");
            }
        }
    }
    
    function selfClosing(tagName, attributes) {
        open(tagName, attributes);
        close(tagName);
    }
    
    function text(value) {
        if (preserveHTMLNestingLevel> 0) {
            fragments.push(value);
        } else {
            fragments.push(escapeMarkdown(value));
        }
    }
    
    function asString() {
        return fragments.join("");
    }

    return {
        asString: asString,
        open: open,
        close: close,
        text: text,
        selfClosing: selfClosing
    };
}

exports.writer = markdownWriter;

function escapeMarkdown(value) {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/([\`\*_\{\}\[\]\(\)\#\+\-\.\!])/g, '\\$1');
}

