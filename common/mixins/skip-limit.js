module.exports = function (Model, options) {
  Model.skipAndLimit = function (skip, limit) {
    skip = skip || 0;
    limit = limit || Model.app.get('limit');
    return {skip, limit};
  }
};
