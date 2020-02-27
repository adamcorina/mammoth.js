var htmlWriter = require("./html-writer");
var markdownWriter = require("./markdown-writer");

exports.writer = writer;


function writer(options) {
    options = options || {};
    if (options.outputFormat === "markdown") {
        return markdownWriter.writer(options);
    } else {
        return htmlWriter.writer(options);
    }
}
