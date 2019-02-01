'use strict';
const hydra = require('hydra');
const HydraRPC = require('hydra-plugin-rpc');
hydra.use(new HydraRPC());

module.exports = async function (app) {
  const config = app.get('hydra');
  await hydra.init(config);
  // hydra.methods({
  //   "sexybox.api.order.finishiOrder": async (data) => {
  //     return app.models.Order.finish(data.deviceId, data.data && data.data.num);
  //   }
  // });
  app.hydra = hydra;
};
