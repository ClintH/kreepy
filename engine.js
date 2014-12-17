var 	fs =	require("fs"),
		path 		= require("path"),
		request 	= require("request"),
		async 	= require("async"),
		moment 	= require("moment"),
		mkdirp 	= require("mkdirp"),
		yaml 		= require("js-yaml"),
		colors 	= require("colors/safe"),
		toMd 		= require("to-markdown").toMarkdown,
		Entities = require("html-entities").AllHtmlEntities,
		cheerio 	= require("cheerio");

var Engine = function(config) {
	if (!config.linkSelector) config.linkSelector = "a";
	this.config = config;

	var me = this;

	// State
	this.entities = new Entities();
	this.completed = {};
	this.urlsProcessed = 0;
	this.urlsSaved = 0;
	this.seenUrls = {};
	this.errors = 0;


	// -- Methods we expect caller to override --
	this.urlPreprocess = function(url) {
		return url;
	}


	// Returns: 0: skip entirely, 2: process links but not content, 3: process fully
	this.urlClassify = function(url) {
		return 3;
	}

	this.extractMeta = function($doc) {
		return {};
	}

	this.processUrlForFile = function(url, contentType, relativeTo) {
		return url;
	}

	this.processDom = function($doc) {
		return $doc;
	}

	this.processHtml = function(html) {
		return html;
	}

	this.domToContent = function($doc) {
		return $doc.html(); 
	}


	// -- End method stubs --

	// Conversion of URLs to filesystem paths, used when transforming content
	// Note: contentType is only available when we are about to save a binary file
	this.urlToFile = function(url, contentType, relativeTo) {
		url = me.processUrlForFile(url, contentType, relativeTo);

		// Ensure binaries have correct file extension
		if (contentType && contentType.substr(0,6) == "image/") {
			var ext = ("." + contentType.substr(6)).toLowerCase();
			if (url.substr(url.length-ext.length).toLowerCase() !== ext)
				url += ext;
		}

		if (relativeTo) {
			// Find longest shared prefix and remove it
			var index = -1;
			for (var i=0;i<url.length;i++) {
				if (i>=relativeTo.length) break;
				if (url[i] == relativeTo[i]) index = i;
				else break;
			}
			if (index > 0) url = url.substr(index+1);
		}
		return url;
	}

	// Apply processing to generated Markdown from HTML
	var processMd = function(md) {
		// The Markdown convertor adds unnecessary new lines between bullets
		md = me.replaceAll('*   ', '* ', md);
		md = me.replaceAll('\n\n*', '\n*', md);
		md = me.replaceAll('\n\n    *', '\n    *', md);
		md = me.replaceAll('\n\n        *', '\n        *', md);
		md = me.replaceAll('\n\n                *', '\n           *', md);

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
		$doc(me.config.linkSelector).each(function(i, elem) {
			var url = elem.attribs.href;
			if (typeof(url) == 'undefined')
				url = elem.attribs.src; // for IMG tags
			if (typeof(url) == 'undefined' || url.length == 0) return;
			if (url[0] == "#") return;

			url = me.urlPreprocess(url);
			var classification = me.urlClassify(url);
			if (classification == 0) {
				return;
			}
			if (me.seenUrls[url]) return;
			me.seenUrls[url] = true;
			q.push({
				url:url, 
				classification: classification, 
				title: $doc(elem).text()
			}, me.urlProcessed);
			added++;
		});
		if (added > 0)
			console.log(colors.gray("\t+" + added + " URLs\tQueued: "  + q.length() + "\tProcessed: " + me.urlsProcessed));
	}



// Process and extract text from the DOM
var extractContent = function($doc, task) {
	// Re-write urls
	$doc(me.config.linkSelector).each(function(i, elem) {
		var url = elem.attribs.href;
		var attrib = "href";
		if (typeof(url) == "undefined") {
			url = elem.attribs.src;
			attrib = "src";
		}
		if (typeof(url) == "undefined" || url.length == 0) return;
		if (url[0] == "#") return;
		$doc(elem).attr(attrib, me.urlToFile(url, null, task.file));
	});
	$doc()

	$doc = me.processDom($doc);					// 1. DOM-level processing
	var content = me.domToContent($doc);	 	// 2. Dump HTML
	if (typeof(content) == 'undefined' || content == null || content.length == 0) return "";

	content = me.processHtml(content);			// 3. HTML-level processing
	content = toMd(content);						// 4. Convert to Markdown
	content = me.replaceAll("&#xFFFD;", "'", content);
	content = me.entities.decode(content);		// 5. Decode HTML entities
	content = processMd(content); 				// 6. Clean up Markdown
	return content;
}

// Performs extraction of metadata and content, and saves to file system
var extractAndSave = function($doc, task, callback) {
	task.file = me.urlToFile(task.url);
	var meta = me.extractMeta($doc);
	var content = extractContent($doc, task);

	// Save document
	var p = path.resolve(me.config.outputPath + task.file);
	console.log(colors.grey("\tOutput: " + me.config.outputPath + task.file));
	mkdirp(path.dirname(p), function(err) {
		if (err) return callback(err);
		var contents = yaml.dump(meta);
		contents +="\n---\n\n";
		contents += content;
		fs.writeFile(p, contents, function(err) {
			if (!err) me.urlsSaved++;
			return callback(err);
		});
	})
}

var saveBinary  = function(response, body, task, callback) {
	var p = path.resolve(me.config.outputPath + me.urlToFile(task.url, response.headers['content-type']));
	console.log(colors.grey("\tBinary output: " + me.config.outputPath + me.urlToFile(task.url, response.headers['content-type'])));
	mkdirp(path.dirname(p), function(err) {
		if (err) return callback(err);
		fs.writeFile(p, body, function(err) {
			if (err) me.urlsSaved++;
			return callback(err);
		})
	})
}

// Downloads content of queued URLs
var q = async.queue(function(task, callback) {
	if (config.maxUrlsToProcess > 0 && me.urlsProcessed >= config.maxUrlsToProcess) return callback();
	
	me.urlsProcessed++;

	console.log(task.url);
	var opts = {
		encoding: null, // Get content as a Buffer
	}
	if (config.auth) opts.auth = config.auth;

	request(task.url, opts, function(error, response, body) {
		if (error || response.statusCode !== 200) {
			if (error == null)
				error = {code:response.statusCode};
			return callback(error, task);
		}
		var mime = response.headers['content-type'];
		
		// Text
		if (mime.substr(0,5) == "text/") {
			body = body.toString("utf8"); // Convert buffer to string
			$doc = cheerio.load(body);
			extractLinks($doc, me);
			if (task.classification == 3) {
				return extractAndSave($doc, task, callback);
			} else {
				return callback(null, task);
			}		
		}

		// Image or PDF
		if ((mime.substr(0, 6) == "image/" || mime == "application/pdf") && config.saveBinaries) {
			saveBinary(response, body, task, callback);
			return;
		}
		callback({code:0,message:"Unknown mime type '" + mime +"'"}, task);
		
	})
}, config.concurrency);

// Notification when queue is empty
q.drain = function() {
	console.log(colors.green("All done. "));
	console.log("  " + me.urlsProcessed + " URL(s) processed");
	console.log("  " + me.urlsSaved + " saved");
	if (me.errors)
		console.log("  " + colors.red(me.errors) + " errors.");
	else
		console.log("  No errors.");

	config.completionCallback(null, {
		processed: me.urlsProcessed,
		errors: me.errors,
		saved: me.urlsSaved
	});
}

this.urlProcessed = function(err, t) {
	if (err) {
		console.log(colors.red("Error: ") + t.url);
		var msg = "";
		if (err.code == "ENOTFOUND")
			msg = "Address not found";
		else if (err.code == "401")
			msg = "Unauthorised (401)";
		else if (err.code == "404")
			msg = "Not found (404)";
		else if (err.message)
			msg = err.message;
		else
			msg = err;
		console.log(colors.red("       " + msg));
		me.errors++;
	}
}

this.start = function(callback) {
	console.log(colors.inverse(" Kreepy "));

	// Reset
	me.completed = {};
	me.urlsProcessed = 0;
	me.urlsSaved = 0;
	me.seenUrls = {};
	me.errors = 0;

	// Start queue with base URL
	config.completionCallback = callback;
	q.push({
		url: config.baseUrl+config.startUrl, 
		classification: 3
	}, me.urlProcessed);
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