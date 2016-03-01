// __Dependencies__
var deco = require('deco');
var mongoose = require('mongoose');
var Api = require('./Api');
var Controller = require('./Controller');
var Model = require('./Model');
var RestError = require('rest-error');
var plugins = {
  json: require('baucis-json'),
  links: require('baucis-links')
};

var instance;
var parsers = {};
var formatters = {};
var errorFormatters = {};

// __Module Definition__
var baucis = module.exports = function (options) {
  return baucis.empty();
};

// __Public Members__
baucis.rest = function (model) {
  if (!instance) instance = Api();
  return instance.rest(model);
};

baucis.empty = function () {
  var previous = instance;
  instance = Api();
  return previous;
};

baucis.formatters = function (response, callback) {

  var handlers = {
    default: function () {
      callback(RestError.NotAcceptable());
    },
    nop: function () {
      callback();
    }
  };
  Object.keys(formatters).map(function (mime) {
    if (response._headerSent) return handlers[mime] = formatters.nop(callback);
    handlers[mime] = formatters[mime](callback);
  });
  response.format(handlers);
};

// Adds a formatter for the given mime type.  Needs a function that returns a stream.
baucis.setFormatter = function (mime, f) {
  formatters[mime] = function (callback) { return function () { callback(null, f) } };
  return baucis;
};

baucis.parser = function (mime, handler) {
  // Default to JSON when no MIME type is provided.
  mime = mime || 'application/json';
  // Not interested in any additional parameters at this point.
  mime = mime.split(';')[0].trim();
  var handler = parsers[mime];
  return handler ? handler() : undefined;
};

// Adds a parser for the given mime type.  Needs a function that returns a stream.
baucis.setParser = function (mime, f) {
  parsers[mime] = f;
  return baucis;
};

// __Expose Modules__
baucis.Api = Api;
baucis.Controller = Controller;
baucis.Error = RestError;
baucis.Model = Model;

Api.container(baucis);
Controller.container(baucis);
RestError.container(baucis);
Model.container(baucis);

// __Plugins__
plugins.json.apply(baucis);
plugins.links.apply(baucis);
