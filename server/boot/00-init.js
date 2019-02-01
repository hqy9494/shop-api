'use strict';

const _ = require('lodash');
const serveStatic = require('serve-static');
const path = require('path');

module.exports = function (app) {
  // init log levels
  // require('logs').setLevel(app.get('logLevel') || 'info');
  //
  // // add logger to model
  // _.forEach(app.models(), model => model.logger = app.logger.extend(model.modelName));
  //
  // app.logger.info('Server is running at "%s" environment', app.get('env'));

  app.use('/static', serveStatic(path.join(__dirname, '../../client/static'), {
    maxAge: 100,
    setHeaders: function (res, path) {
      res.setHeader('Cache-Control', 'public, max-age=1000')
    }
  }));
};
