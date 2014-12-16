var 	fs =	require("fs"),
		path 		= require("path"),
		request 	= require("request"),
		async 	= require("async"),
		moment 	= require("moment"),
		mkdirp 	= require("mkdirp"),
		yaml 		= require("js-yaml"),
		toMd 		= require("to-markdown").toMarkdown,
		Entities = require("html-entities").AllHtmlEntities,
		cheerio 	= require("cheerio");

var Engine = function(config) {
	this.config = config;
	var me = this;

	// State
	this.entities = new Entities();
	this.completed = {};
	this.urlsProcessed = 0;
	this.seenUrls = {};

	// -- Methods we expect caller to override --
	this.urlPreprocess = function(url) {
		return url;
	}

	this.urlToFile = function(url) {
		if (url.indexOf(baseUrl) == 0) {
			url = url.replace(baseUrl, '');
			url = url.replace(".", "/");
			if (url.length == 0) url = "index";
			url += ".md";
		}
		return url;
	}

	// Returns: 0: skip entirely, 2: process links but not content, 3: process fully
	this.urlClassify = function(url) {
		return 3;
	}

	this.extractMeta = function($doc) {
		return {};
	}

	this.processDom = function($doc) {
		return $doc;
	}

	this.processHtml = function(html) {
		return html;
	}



	// -- End method stubs --


	// Apply processing to generated Markdown from HTML
	var processMd = function(md) {
		// The Markdown convertor adds unnecessary new lines between bullets
		md = me.replaceAll('*   ', '* ', md);
		md = me.replaceAll('\n\n*', '\n*', md);
		md = me.replaceAll('\n\n    *', '\n    *', md);
		md = me.replaceAll('\n\n        *', '\n        *', md);

		// Add a new line at the beginning of a list
		// This is probably horribly inefficient
		var lines = md.split("\n");
		md = "";
		for (var i=0;i<lines.length;i++) {
			md += lines[i] + "\n";
			if (i < lines.length-1) {
				if (lines[i+1].trim()[0] == "*" && lines[i].trim()[0] !== "*") {
					// Next line is a bullet, so add an extra line
					md += "\n";
				}
			}
		}
		return md;
	}

	var extractLinks = function($doc, me) {
		var added = 0;
		$doc('a').each(function(i, elem) {
			var url = me.urlPreprocess(elem.attribs.href);
			var classification = me.urlClassify(url);
			if (classification == 0) {
				return;
			}
			if (me.seenUrls[url]) {
				return;
			}
			me.seenUrls[url] = true;
			q.push({url:url, classification: classification, title: $doc(elem).text()});
			added++;
		});
		if (added > 0)
			console.log("\t+" + added + " URLs\tQueued: "  + q.length() + "\tProcessed: " + me.urlsProcessed);
	}



// Process and extract text from the DOM
var extractContent = function($doc) {
	// Re-write urls
	$doc('a').each(function(i, elem) {
		$doc(elem).attr('href', me.urlToFile(elem.attribs.href));
	});

	$doc = me.processDom($doc);					// 1. DOM-level processing
	var content = $doc("#wikitext").html(); 	// 2. Dump HTML
	content = me.processHtml(content);			// 3. HTML-level processing
	content = toMd(content);						// 4. Convert to Markdown
	//console.dir(content);
	content = me.replaceAll("&#xFFFD;", "'", content);
	content = me.entities.decode(content);		// 5. Decode HTML entities
	content = processMd(content); 				// 6. Clean up Markdown
	return content;
}

// Performs extraction of metadata and content, and saves to file system
var extractAndSave = function($doc, task, callback) {
	var meta = me.extractMeta($doc);
	var content = extractContent($doc);

	// Save document
	var p = path.resolve(me.config.outputPath + me.urlToFile(task.url));
	console.log("\tOutput: " + me.config.outputPath + me.urlToFile(task.url));
	var dir = path.dirname
	mkdirp(path.dirname(p), function(err) {
		if (err) return callback(error);
		var contents = yaml.dump(meta);
		contents +="\n---\n\n";
		contents += content;
		fs.writeFile(p, contents, function(err) {
			return callback(err);
		});
	})
}

// Downloads content of queued URLs
var q = async.queue(function(task, callback) {
	if (config.maxUrlsToProcess > 0 && me.urlsProcessed >= config.maxUrlsToProcess) return callback();
	me.urlsProcessed++;

	console.log(task.url);
	request(task.url, {auth:config.auth}, function(error, response, body) {
		if (!error && response.statusCode == 200) {
			$doc = cheerio.load(body);
			extractLinks($doc, me);
			if (task.classification == 3) {
				return extractAndSave($doc, task, callback);
			} else {
				return callback();
			}
		} else {
			console.log("Error: " + error + " code: " + response.statusCode);
			callback(error);
		}
	})
}, config.concurrency);

// Notification when queue is empty
q.drain = function() {
	config.completionCallback(null, {
		processed: me.urlsProcessed
	});
}

this.start = function(callback) {
	// Start queue with base URL
	config.completionCallback = callback;
	q.push({url:config.baseUrl+config.startUrl, classification: 3});

}
// --- UTILITY ---
this.replaceAll = function(find, replace, str) {
	return str.split(find).join(replace);
}
this.replaceWithBlock = function(selector, codeBlock, $doc) {
	$doc(selector).each(function(i, elem) {
		$doc(elem).replaceWith("\n\n{% " + codeBlock + " %}\n" + $doc(elem).html().trim() + "\n{% end" + codeBlock + " %}\n");
	});
}
this.replaceWithTag = function(selector, tag, $doc) {
	$doc(selector).each(function(i, elem) {
		$doc(elem).replaceWith("\n<" + tag + ">" + $doc(elem).html().trim() + "\n</" + tag + ">\n");
	});
}
}
module.exports = Engine;