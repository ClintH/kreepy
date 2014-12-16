var 	moment 	= require("moment"),
		Engine 	= require("./engine");

// --- CONFIGURATION ---
var config = {}

// Base URL. Crawler will not crawl URLs that don't share this base.
config.baseUrl = "http://wiki/";

// Start suffix from baseUrl or an empty string to start at baseUrl
config.startUrl = ""; 

config.auth = {
	user: "****",
	password: "****"
}
config.outputPath = "output/";

// Set to non-zero to limit the number of URLs to process. Useful for testing.
config.maxUrlsToProcess = 1000; 

// How many URLs to process at once
config.concurrency = 5;

// --- END CONFIG ---

var engine = new Engine(config);

// This example customisation below is designed to port my own PmWiki
// wiki to a set of Markdown files. It should provide an illustration
// of how to customise Kreepy

// Normalisation of URLs to perform when gathering crawl URLs
engine.urlPreprocess = function(url) {
	url = url.replace("?action=edit", "");
	url = url.replace("?action=diff", "");
	url = url.replace("?action=browse", "");
	url = url.replace("?action=print", "");
	return url;
}

// Conversion of URLs to filesystem paths, used when transforming content
engine.urlToFile = function(url) {
	if (url.indexOf(config.baseUrl) == 0) {
		url = url.replace(config.baseUrl, '');
		url = url.replace("index.php?n=", "");
		url = url.replace(".", "/");
		if (url.length == 0) url = "index";
		url += ".md";
	}
	return url;
}

// Returns: 0: skip entirely, 2: process links but not content, 3: process fully
engine.urlClassify = function(url) {
	// Skip
	if (url.indexOf("Site.") > 0) return 0;
	if (url.indexOf("PmWiki.") > 0) return 0;
	if (url.indexOf(".RecentChanges") > 0) return 0;
	if (url.indexOf(config.baseUrl) < 0) return 0; // Ignore off-site

	// Just follow links
	if (url.indexOf("Category.") > 0) return 2;
	if (url.indexOf("Theme.") > 0) return 2;

	// Process everything else
	return 3;
}

engine.extractMeta = function($doc) {
	var meta = {};
	meta.title = $doc("#pageTitle").text().trim();
	meta.author = $doc(".author").text().trim();
	meta.appears = $doc(".appears").text().trim();
	$doc('a.categorylink').each(function(i, elem) {
		if (typeof(meta.categories) === 'undefined') meta.categories = [];
		meta.categories.push($doc(elem).text().trim());
	});
	meta.updated = $doc("#blogfoot .lastmod").text().replace("Page last modified on ", "");
	meta.updated = moment(meta.updated, "MMMM D, YYYY, at h:mm").format();
	return meta;
}

// Apply processing to HTML as a DOM
engine.processDom = function($doc) {
	// Try to keep some semantics
	engine.replaceWithBlock("p.abstract", "abstract", $doc);
	engine.replaceWithBlock("p.nutshell", "nutshell", $doc);
	engine.replaceWithBlock("p.citation", "citation", $doc);
	engine.replaceWithBlock("div.refs", "references", $doc);

	engine.replaceWithTag("div.indent", "blockquote", $doc);

	// Remove some stuff we don't want converted to MD
	$doc(".errata").remove();
	$doc("#blogfoot").remove();
	return $doc;
}

// Apply processing to HTML as a string before Markdown is generated
engine.processHtml = function(html) {
	html = engine.replaceAll('<div class="vspace"></div>', '', html);
	return html;
}

// Start crawler and listen for completion (note 'err' param will always be null)
engine.start(function(err, results) {
	console.log("All done. " + results.processed + " URL(s) processed.");

})
