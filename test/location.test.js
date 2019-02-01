const s = require('./support');
const assert = require('chai').assert;
const should = require('chai').should();

const accounts = require('./mocks').accounts;
const tenants = require('./mocks').tenants;

describe('Location', () => {
  before(s.abSetupRecord('Tenant', tenants));
  before(s.abSetupRecord('Account', accounts));
  after(s.abRemoveRecord('Tenant'));
  after(s.abRemoveRecord('Account'));
  after(s.abRemoveRecord('Location'));

  it('测试tenant', async () => {
    const account = accounts[0];
    let tenantId = tenants[0].id;

    let result = await s.app.models.Location.createLocation({name: "yyyy", address: "杭州", contactMobile: "beijing"});
    assert.equal(result.name, "yyyy");

    await s.app.models.Location.observe('before save', function (ctx, next) {
      ctx.instance["tenantId"] = tenantId;
      next();
    });

    await s.app.models.Location.observe('access', function (ctx, next) {
      ctx.query.where.tenantId = tenantId;
      next();
    });

    result = await s.app.models.Location.createLocation({name: "xxxx", address: "广州", contactMobile: "beijing"});
    result.should.be.a('object');
    assert.equal(result.name, "xxxx");
    assert.equal(result.tenantId, tenantId);

    let locations = await s.app.models.Location.getLocations();
    assert.equal(locations.length, 1);
    assert.equal(locations[0].tenantId, tenantId);
  });
});
