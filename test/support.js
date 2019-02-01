"use strict";
const app = require('../');
// const hydra = require('../server/boot/11-hydra');

process.env.NODE_ENV = 'test';

// hydra(app);
exports.app = app;

exports.abSetupRecord = function (name, data) {
  return function (done) {
    const Model = app.models[name];
    Model.create(data, function (err, result) {
      if (err) return done(err);
      done();
    });
  };
};

exports.abRemoveRecord = function (name) {
  return function (done) {
    const Model = app.models[name];
    Model.remove({}, function (err, result) {
      if (err) return done(err);
      done();
    });
  };
};

