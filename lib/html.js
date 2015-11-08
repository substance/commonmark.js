"use strict";

var escapeXml = require('./common').escapeXml;

var reHtmlTag = /\<[^>]*\>/;
var reUnsafeProtocol = /^javascript:|vbscript:|file:|data:/i;
var reSafeDataProtocol = /^data:image\/(?:png|gif|jpeg|webp)/i;

var potentiallyUnsafe = function(url) {
    return reUnsafeProtocol.test(url) &&
        !reSafeDataProtocol.test(url);
};

function HtmlRenderer(options) {
    // default options:
    this.SOFTBREAK = '\n'; // by default, soft breaks are rendered as newlines in HTML
    // set to "<br />" to make them hard breaks
    // set to " " if you want to ignore line wrapping in source
    this.escape = escapeXml;
    this.options = options || {};
}

HtmlRenderer.prototype.render = function(block) {

    var walker = block.walker();
    var event, node;

    this.buffer = "";
    this.lastOut = "\n";
    this.disableTags = 0;
    this.entering = false;

    if (this.options.time) { console.time("rendering"); }

    while ((event = walker.next())) {
        this.entering = event.entering;
        node = event.node;

        var attrs = [];
        if (this.options.sourcepos) {
            var pos = node.sourcepos;
            if (pos) {
                attrs.push(['data-sourcepos', String(pos[0][0]) + ':' +
                            String(pos[0][1]) + '-' + String(pos[1][0]) + ':' +
                            String(pos[1][1])]);
            }
        }

        // dispatch to handler
        var method = node.type.toLowerCase();
        if (this[method]) {
            this[method](node, attrs);
        } else {
            throw "Unknown node type " + node.type;
        }
    }
    if (this.options.time) { console.timeEnd("rendering"); }
    return this.buffer;
};

HtmlRenderer.prototype.out = function(s) {
    if (this.disableTags > 0) {
        this.buffer += s.replace(reHtmlTag, '');
    } else {
        this.buffer += s;
    }
    this.lastOut = s;
};

HtmlRenderer.prototype.cr = function() {
    if (this.lastOut !== '\n') {
        this.buffer += '\n';
        this.lastOut = '\n';
    }
};

// Helper function to produce an HTML tag.
HtmlRenderer.prototype.tag = function(name, attrs, selfclosing) {
    var result = '<' + name;
    if (attrs && attrs.length > 0) {
        var i = 0;
        var attrib;
        while ((attrib = attrs[i]) !== undefined) {
            result += ' ' + attrib[0] + '="' + attrib[1] + '"';
            i++;
        }
    }
    if (selfclosing) {
        result += ' /';
    }

    result += '>';
    return result;
};

HtmlRenderer.prototype.document = function() {
};

HtmlRenderer.prototype.text = function(node) {
    this.out(this.escape(node.literal, false));
};

HtmlRenderer.prototype.softbreak = function() {
    this.out(this.SOFTBREAK);
};

HtmlRenderer.prototype.hardbreak = function() {
    this.out(this.tag('br', [], true));
    this.cr();
};

HtmlRenderer.prototype.emph = function() {
    this.out(this.tag(this.entering ? 'em' : '/em'));
};

HtmlRenderer.prototype.strong = function() {
    this.out(this.tag(this.entering ? 'strong' : '/strong'));
};

HtmlRenderer.prototype.html = function(node) {
    if (this.options.safe) {
        this.out('<!-- raw HTML omitted -->');
    } else {
        this.out(node.literal);
    }
};

HtmlRenderer.prototype.link = function(node, attrs) {
    if (this.entering) {
        if (!(this.options.safe && potentiallyUnsafe(node.destination))) {
            attrs.push(['href', this.escape(node.destination, true)]);
        }
        if (node.title) {
            attrs.push(['title', this.escape(node.title, true)]);
        }
        this.out(this.tag('a', attrs));
    } else {
        this.out(this.tag('/a'));
    }
};

HtmlRenderer.prototype.image = function(node) {
    if (this.entering) {
        if (this.disableTags === 0) {
            if (this.options.safe &&
                 potentiallyUnsafe(node.destination)) {
                this.out('<img src="" alt="');
            } else {
                this.out('<img src="' + this.escape(node.destination, true) +
                    '" alt="');
            }
        }
        this.disableTags += 1;
    } else {
        this.disableTags -= 1;
        if (this.disableTags === 0) {
            if (node.title) {
                this.out('" title="' + this.escape(node.title, true));
            }
            this.out('" />');
        }
    }
};

HtmlRenderer.prototype.code = function(node) {
    this.out(this.tag('code') + this.escape(node.literal, false) + this.tag('/code'));
};

HtmlRenderer.prototype.codeblock = function(node, attrs) {
    var info_words = node.info ? node.info.split(/\s+/) : [];
    if (info_words.length > 0 && info_words[0].length > 0) {
        attrs.push(['class', 'language-' + this.escape(info_words[0], true)]);
    }
    this.cr();
    this.out(this.tag('pre') + this.tag('code', attrs));
    this.out(this.escape(node.literal, false));
    this.out(this.tag('/code') + this.tag('/pre'));
    this.cr();
};

HtmlRenderer.prototype.paragraph = function(node, attrs) {
    var grandparent = node.parent.parent;
    if (grandparent !== null &&
        grandparent.type === 'List') {
        if (grandparent.listTight) {
            return;
        }
    }
    if (this.entering) {
        this.cr();
        this.out(this.tag('p', attrs));
    } else {
        this.out(this.tag('/p'));
        this.cr();
    }
};

HtmlRenderer.prototype.blockquote = function(attrs) {
    if (this.entering) {
        this.cr();
        this.out(this.tag('blockquote', attrs));
        this.cr();
    } else {
        this.cr();
        this.out(this.tag('/blockquote'));
        this.cr();
    }
};

HtmlRenderer.prototype.item = function(attrs) {
    if (this.entering) {
        this.out(this.tag('li', attrs));
    } else {
        this.out(this.tag('/li'));
        this.cr();
    }
};

HtmlRenderer.prototype.list = function(node, attrs) {
    var tagname = node.listType === 'Bullet' ? 'ul' : 'ol';
    if (this.entering) {
        var start = node.listStart;
        if (start !== null && start !== 1) {
            attrs.push(['start', start.toString()]);
        }
        this.cr();
        this.out(this.tag(tagname, attrs));
        this.cr();
    } else {
        this.cr();
        this.out(this.tag('/' + tagname));
        this.cr();
    }
};

HtmlRenderer.prototype.header = function(node, attrs) {
    var tagname = 'h' + node.level;
    if (this.entering) {
        this.cr();
        this.out(this.tag(tagname, attrs));
    } else {
        this.out(this.tag('/' + tagname));
        this.cr();
    }
};

HtmlRenderer.prototype.htmlblock = function(node) {
    this.cr();
    if (this.options.safe) {
        this.out('<!-- raw HTML omitted -->');
    } else {
        this.out(node.literal);
    }
    this.cr();
};


HtmlRenderer.prototype.horizontalrule = function(node, attrs) {
    this.cr();
    this.out(this.tag('hr', attrs, true));
    this.cr();
};

module.exports = HtmlRenderer;

