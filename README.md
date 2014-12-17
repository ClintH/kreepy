kreepy
======

A simple Node.js web crawler which converts downloaded files to Markdown.

# Why another crawler?

I just wanted something simple to convert my PmWiki into a set of Markdown files. I wanted to be able to transfer the special semantics I established in my wiki to a file-based system.

Kreepy allows you to do something similar, and with a concise code base is easily understandable and extendable. 

Note that it's a very minimal implementation and a lot of edge cases aren't taken care of.

# Getting started

With Kreepy, you put your crawling logic into ``app.js``, overriding the functionality provided by the ``Engine`` class in ``engine.js``. The provided ``app.js`` demonstrates how to do this, with the case of crawling my PmWiki.

# Kreepy logic

Here's a little account for how Kreepy runs.

## 1. Load url
Start Kreepy via ``engine.start()``, which adds the first URL to the queue which it continues to process. Processing can happen in parallel, if ``config.concurrency`` is above ``1``. 

* If we've reached the limit of URLs to fetch (set by ``config.maxUrlsToProcess``) stop 
* Download content, and load up as a document object model (DOM)
* Call engine's ``extractLinks`` function
* If the link has been classified for full crawling, call ``extractAndSave`` to save the content

If response is an image or PDF and ``config.saveBinaries`` is true, it will be saved by ``saveBinary``. The path for the image is established by ``urlToFile``.

## 2. Extract links

Working with the DOM, find all 'A' (anchor) tags, and process them in series. This behaviour can be changed, for example only pulling out links from a certain area of the page by setting  ``config.linkSelector`` (default: "a")

If you want to include images for example, you could use a selector such as ``a, img``.

* Normalise using ``urlPreprocess`` (ie transform the anchor href)
* Classify the url with ``urlClassify``: should the URL be processed in full, just its links traversed, or should it be skipped entirely?
* If we've already seen the URL, or it shouldn't be processed, dont do anything more with it
* Otherwise, add it to the list of seen URLs and add it to the worker queue (which is processed at step 1)


## 3. Extract and save content

* Extract metadata for YAML front-matter using ``extractMeta``
* Extract the content as string using ``extractContent``
* Generate a path for the URL using ``urlToFile``, creating directories if need be
* Save the file

## 4. Extract metadata

By default, this does nothing. In my PmWiki crawler, I pull out the title and certain blocks of content.

## 5. Extract content

* Re-write links so they point to the file system rather than the web using ``urlToFile``. This in turn calls ``processUrlForFile`` for early pre-processing.
* Process the content as a DOM with ``processDom`` (often easier to clean up or remove stuff when it is in DOM form)
* Convert the DOM to HTML with ``domToContent`` (overriding this allows you to pull just an extract from the document)
* Convert content to Markdown with ``toMd``
* Replace HTML entities
* Clean up Markdown with ``processMd``

