// __Dependencies__
var es = require('event-stream');
var crypto = require('crypto');
var RestError = require('rest-error');

// __Module Definition__
var decorator = module.exports = function (options, protect) {
  var baucis = require('..');
  var controller = this;
  var lastModifiedPath = controller.model().lastModified();
  var trailers = {};

  // __Private Module Members__
  // Format the Trailer header.
  function addTrailer (response, header) {
    var current = response.get('Trailer');
    if (!current) response.set('Trailer', header);
    else response.set('Trailer', current + ', ' + header);
  }
  // A map that is used to create empty response body.
  function empty (context, callback) { callback(null, '') }
  // Map contexts back into documents.
  function redoc (context, callback) { callback(null, context.doc) }
  // Generate a respone Etag from a context.
  function etag (response, useTrailer) {
    if (useTrailer) {
      addTrailer(response, 'Etag');
      response.set('Transfer-Encoding', 'chunked');
    }

    var hash = crypto.createHash('md5');

    return es.through(function (chunk) {
      hash.update(chunk);
      this.emit('data', chunk);
    },
    function () {
      if (useTrailer) {
        trailers.Etag = '"' + hash.digest('hex') + '"';
      }
      else {
        response.set('Etag', '"' + hash.digest('hex') + '"');
      }

      this.emit('end');
    });
  }

  function etagImmediate (response) {
    var hash = crypto.createHash('md5');

    return es.through(function (chunk) {
      hash.update(JSON.stringify(chunk));
      response.set('Etag', '"' + hash.digest('hex') + '"');
      this.emit('data', chunk);
    },
    function () {
      this.emit('end');
    });
  }
  // Generate a Last-Modified header/trailer
  function lastModified (response, useTrailer) {
    if (useTrailer) {
      addTrailer(response, 'Last-Modified');
      response.set('Transfer-Encoding', 'chunked');
    }

    var latest = null;

    return es.through(function (context) {
      if (!context) return;
      if (!context.doc) return this.emit('data', context);
      if (!context.doc.get) return this.emit('data', context);

      var current = context.doc.get(lastModifiedPath);
      if (latest === null) latest = current;
      else latest = new Date(Math.max(latest, current));
      if (!useTrailer) {
        response.set('Last-Modified', latest.toUTCString());
      }
      this.emit('data', context);
    },
    function () {
      if (useTrailer) {
        if (latest) trailers['Last-Modified'] = latest.toUTCString();
      }

      this.emit('end');
    });
  }

  // Build a reduce stream.
  function reduce (accumulated, f) {
    return es.through(
      function (context) {
        accumulated = f(accumulated, context);
      },
      function () {
        this.emit('data', accumulated);
        this.emit('end');
      }
    );
  }
  // Count emissions.
  function count () {
    return reduce(0, function (a, b) { return a + 1 });
  }

  // If counting get the count and send it back directly.
  protect.finalize(function (request, response, next) {
    if (!request.baucis.count) return next();

    request.baucis.query.count(function (error, n) {
      if (error) return next(error);
      response.removeHeader('Transfer-Encoding');
      return response.json(n); // TODO support other content types
    });
  });

  // If not counting, create the basic stream pipeline.
  protect.finalize('collection', 'all',function (request, response, next) {
    var count = 0;
    var documents = request.baucis.documents;
    var pipeline = request.baucis.send = protect.pipeline(next);
    // If documents were set in the baucis hash, use them.
    if (documents) pipeline(es.readArray([].concat(documents)));
    // Otherwise, stream the relevant documents from Mongo, based on constructed query.
    else pipeline(request.baucis.query.stream());
    // Map documents to contexts.
    pipeline(function (doc, callback) {
      callback(null, { doc: doc, incoming: null });
    });
    // Check for not found.
    pipeline(es.through(
      function (context) {
        count += 1;
        this.emit('data', context);
      },
      function () {
        if (count > 0) return this.emit('end');

        var status = controller.emptyCollection();
        response.status(status);

        if (status === 204) return this.emit('end');
        if (status === 200) {
          response.removeHeader('Transfer-Encoding');
          response.json([]); // TODO other content types
          this.emit('end');
          return;
        }

        this.emit('error', RestError.NotFound());
      }
    ));
    // Apply user streams.
    pipeline(request.baucis.outgoing());

    // Set the document formatter based on the Accept header of the request.
    baucis.formatters(response, function (error, formatter) {
      if (error) return next(error);
      request.baucis.formatter = formatter;
      next();
    });
  });

  protect.finalize('instance', 'all', function (request, response, next) {
    var count = 0;
    var documents = request.baucis.documents;
    var pipeline = request.baucis.send = protect.pipeline(next);
    // If documents were set in the baucis hash, use them.
    if (documents) pipeline(es.readArray([].concat(documents)));
    // Otherwise, stream the relevant documents from Mongo, based on constructed query.
    else pipeline(request.baucis.query.stream());
    // Map documents to contexts.
    pipeline(function (doc, callback) {
      callback(null, { doc: doc, incoming: null });
    });
    // Check for not found.
    pipeline(es.through(
      function (context) {
        count += 1;
        this.emit('data', context);
      },
      function () {
        if (count > 0) return this.emit('end');
        this.emit('error', RestError.NotFound());
      }
    ));
    // Apply user streams.
    pipeline(request.baucis.outgoing());

    // Set the document formatter based on the Accept header of the request.
    baucis.formatters(response, function (error, formatter) {
      if (error) return next(error);
      request.baucis.formatter = formatter;
      next();
    });
  });

  // OPTIONS // TODO Express' extra handling for OPTIONS conflicts with baucis
  // TODO maybe send method names in body
  // controller.options(function (request, response, next) {
  //   console.log('here')
  //   request.baucis.send(empty);
  //   next();
  // });

  // HEAD
  protect.finalize('instance', 'head', function (request, response, next) {
    if (lastModifiedPath) {
      request.baucis.send(lastModified(response, false));
    }

    request.baucis.send(redoc);
    request.baucis.send(etagImmediate(response));
    request.baucis.send(request.baucis.formatter());
    request.baucis.send(empty);
    next();
  });

  protect.finalize('collection', 'head', function (request, response, next) {
    if (lastModifiedPath) {
      request.baucis.send(lastModified(response, false));
    }

    request.baucis.send(redoc);
    request.baucis.send(request.baucis.formatter(true));
    request.baucis.send(etag(response, false));
    request.baucis.send(empty);
    next();
  });

  // GET
  protect.finalize('instance', 'get', function (request, response, next) {
    if (lastModifiedPath) {
      request.baucis.send(lastModified(response, false));
    }

    request.baucis.send(redoc);
    request.baucis.send(etagImmediate(response));
    request.baucis.send(request.baucis.formatter());
    next();
  });

  protect.finalize('collection', 'get', function (request, response, next) {
    if (lastModifiedPath) {
      request.baucis.send(lastModified(response, true));
    }

    if (request.baucis.count) {
      request.baucis.send(count());
      request.baucis.send(es.stringify());
    }
    else {
      request.baucis.send(redoc);
      request.baucis.send(request.baucis.formatter(true));
    }

    request.baucis.send(etag(response, true));
    next();
  });

  // POST
  protect.finalize('collection', 'post', function (request, response, next) {
    request.baucis.send(redoc);
    request.baucis.send(request.baucis.formatter());
    next();
  });

  // PUT
  protect.finalize('put', function (request, response, next) {
    request.baucis.send(redoc);
    request.baucis.send(request.baucis.formatter());
    next();
  });

  // DELETE
  protect.finalize('delete', function (request, response, next) {
    // Remove each document from the database.
    request.baucis.send(function (context, callback) { context.doc.remove(callback) });
    // Respond with the count of deleted documents.
    request.baucis.send(count());
    request.baucis.send(es.stringify());
    next();
  });

  protect.finalize(function (request, response, next) {
    request.baucis.send().pipe(es.through(function (chunk) {
      response.write(chunk);
    }, function () {
      response.addTrailers(trailers);
      response.end();
      this.emit('end');
    }));
  });
};
