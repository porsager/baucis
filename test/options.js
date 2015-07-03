var expect = require('expect.js');
var request = require('request').defaults({ json: true });

var fixtures = require('./fixtures');

describe.skip('OPTIONS instance/collection', function () {
  before(fixtures.vegetable.init);
  beforeEach(fixtures.vegetable.create);
  after(fixtures.vegetable.deinit);

  it('provides options for the collection', function (done) {
    var url = 'http://localhost:8012/api/vegetables/';

    request({ method: 'OPTIONS', url: url }, function (error, response, body) {
      if (error) return done(error);

      expect(response.statusCode).to.be(200);
      expect(body).to.be('HEAD,GET,POST,PUT,DELETE');

      expect(response.headers).to.have.property('vary', 'API-Version');
      expect(response.headers).to.have.property('api-version', '0.0.1');
      expect(response.headers).to.have.property('allow', 'HEAD,GET,POST,PUT,DELETE');
      expect(response.headers).to.have.property('date');
      expect(response.headers).to.have.property('connection', 'keep-alive');

      done();
    });
  });

  it('provides options for the instance', function (done) {
    var shitake = vegetables[3];
    var url = 'http://localhost:8012/api/vegetables/' + shitake._id;

    request({ method: 'OPTIONS', url: url }, function (error, response, body) {
      if (error) return done(error);

      expect(response.statusCode).to.be(200);
      expect(body).to.be('HEAD,GET,POST,PUT,DELETE');

      expect(response.headers).to.have.property('vary', 'API-Version');
      expect(response.headers).to.have.property('api-version', '0.0.1');
      expect(response.headers).to.have.property('allow', 'HEAD,GET,POST,PUT,DELETE');
      expect(response.headers).to.have.property('date');
      expect(response.headers).to.have.property('connection', 'keep-alive');


      done();
    });
  });

});
