'use strict';

const _ = require('lodash');

module.exports = function (app) {

  _.forEach(app.models, Model => {
    const oldCreateOptionsFromRemotingContext = Model.createOptionsFromRemotingContext;
    if (!oldCreateOptionsFromRemotingContext) return;
    Model.createOptionsFromRemotingContext = function (ctx) {
      return Object.assign(oldCreateOptionsFromRemotingContext(ctx), _.pick(ctx.req, [
        'user'
      ]));
    };
  });
};
