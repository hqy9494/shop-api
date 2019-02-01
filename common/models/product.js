'use strict';
const g = require('strong-globalize')();

module.exports = function(Product) {

  Product.updateProduct = async function (id, data) {
    const product = await Product.findById(id);
    if (!product) {
      const err = new Error(g.f('商品不存在'));
      err.statusCode = 400;
      throw err;
    }
    return product.updateAttributes(data);
  };

  Product.getProductSingle = async function () {
    return Product.findById(Product.app.box_product.id);
  };

  Product.remoteMethod('updateProduct', {
    description: '修改产品',
    accepts: [
      {arg: 'id', type: 'string', required: true, http: {source: 'path'}},
      {arg: 'data', type: 'object', required: true, http: {source: 'body'}}
    ],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'put', path: '/:id'},
  });

  Product.remoteMethod('getProductSingle', {
    description: '获取商品',
    accepts: [],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'get', path: '/single'},
  });
};
