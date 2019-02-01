'use strict';
const debug = require('debug')('common:models');
const g = require('strong-globalize')();
const PromiseA = require('bluebird');
const errs = require('errs');

module.exports = function (Account) {

  Account.validatesUniquenessOf('mobile', {message: 'mobile exist already'});
  Account.validatesUniquenessOf('username', {message: 'username exist already'});

  Account.getUsers = async function (fullname, openid, order, skip, limit) {
    let where = {type: 'user'};
    if (fullname) {
      where.fullname = {like: `%${fullname}%`};
    }
    if (openid) {
      where.openid = {like: `%${openid}%`}
    }
    let skipAndLimit = Account.skipAndLimit(skip, limit);
    let users = await Account.find({where, order, limit: skipAndLimit.limit, skip: skipAndLimit.skip});
    for (let i = 0; i < users.length; i++) {
      users[i].crystal = await Account.app.models.Crystal.findOne({where: {
        userId: users[i].id
      }
      })
    }
    return users || [];
  };

  Account.getUserCount = async function (fullname, openid) {
    let where = {and: [{type: 'user'}]};
    if (fullname) {
      where.and.push({fullname: {like: `%${fullname}%`}});
    }
    if (openid) {
      where.and.push({nickname: {like: `%${openid}%`}})
    }
    return await Account.count(where);
  };

  Account.getStaffs = async function (order, skip, limit) {
    let where = {type: 'staff'};
    let skipAndLimit = Account.skipAndLimit(skip, limit);
    let accounts = await Account.find({
      where,
      order,
      limit: skipAndLimit.limit,
      skip: skipAndLimit.skip
    });

    const RoleMapping = Account.app.models.RoleMapping;
    await PromiseA.all(accounts.map(async account => {
      let _roles = await RoleMapping.find({
        where: {
          principalType: RoleMapping.USER,
          principalId: account.id,
        },
        include: 'role'
      });
      let roles = _roles.map(r => {
        return r.__data.role;
      });
      account.roles = roles;
      return;
    }));
    return accounts;
  };

  Account.getUser = async function (id) {
    let where = {type: 'user', id};
    let user = await Account.findOne({where});

    return user || {};
  };

  Account.getStaff = async function (id) {
    let where = {type: 'staff', id};
    let user = await Account.findOne({where});

    const RoleMapping = Account.app.models.RoleMapping;
    let _roles = await RoleMapping.find({
      where: {
        principalType: RoleMapping.USER,
        principalId: user.id,
      },
      include: 'role'
    });
    let roles = _roles.map(r => {
      return r.__data.role;
    });

    user.roles = roles;

    return user
  };

  Account.getRoles = async function () {
    return Account.app.models.Role.find({where: {name: {neq: 'admin'}}});
  };

  Account.createRole = async function (data) {
    const { name, description } = data;

    if (!name || !description) {
      throw errs.create({
        code: 'INVALID_PARAMETERS',
        status: 400,
        statusCode: 400,
        message: '名称，描述不能为空'
      });
    }

    let role = await Account.app.models.Role.find({where: {name}});
    if (role.length > 0) {
      throw errs.create({
        code: 'INVALID_PARAMETERS',
        status: 400,
        statusCode: 400,
        message: '该角色已存在'
      });
    }

    return Account.app.models.Role.create({name, description})
  };

  Account.createStaff = async function (data) {
    let {username, password, nickname, fullname} = data;
    if (!username || !password || !nickname) {
      throw errs.create({
        code: 'INVALID_PARAMETERS',
        status: 400,
        statusCode: 400,
        message: '用户名, 密码, 昵称不能为空'
      });
    }

    const tx = await Account.beginTransaction({isolationLevel: 'READ COMMITTED', timeout: 15000});
    try {
      let account = await Account.create({username, password, nickname, fullname, type: 'staff'}, {transaction: tx});
      // 默认运营人员角色
      // let role = await Account.app.models.Role.findById(Account.app.roleOperator.id);
      // await role.principals.create({
      //   principalType: Account.app.models.RoleMapping.USER,
      //   principalId: account.id
      // }, {transaction: tx.tx});
      await tx.commit();
      return account;
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  };

  Account.updateStaff = async function (id, data) {
    let {username, password, nickname, roleId, fullname} = data;
    let account = await Account.findById(id);

    const tx = await Account.beginTransaction({isolationLevel: 'READ COMMITTED', timeout: 15000});
    try {
      await account.updateAttributes({username, password, nickname, fullname}, {transaction: tx});
      if (roleId) {
        let role = await Account.app.models.Role.findById(roleId);
        if (role) {
          let roleMapping = await Account.app.models.RoleMapping.findOne({where: {principalId: account.id}});
          roleMapping.updateAttributes({roleId: roleId}, {transaction: tx});
        }
      }
      await tx.commit();
      return account;
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  };

  Account.login = function (credentials, include) {
    return this._doLogin(credentials, include, {enabled: {neq: false}});
  };

  Account._doLogin = function (credentials, include, where) {
    include = (include || '');
    if (Array.isArray(include)) {
      include = include.map((val) => {
        return val.toLowerCase();
      });
    } else {
      include = include.toLowerCase();
    }
    let realmDelimiter;
    // Check if realm is required
    const realmRequired = Boolean(this.settings.realmRequired || this.settings.realmDelimiter);
    if (realmRequired) {
      realmDelimiter = this.settings.realmDelimiter;
    }

    let query = this.normalizeCredentials(credentials, realmRequired, realmDelimiter);

    if (realmRequired && !query.realm) {
      const err1 = new Error(g.f('{{realm}} is required'));
      err1.statusCode = 400;
      err1.code = 'REALM_REQUIRED';
      throw err1;
    }
    if (!query.or && !query.mobile && !query.email && !query.username) {
      const err2 = new Error(g.f('{{username}} or {{email}} is required'));
      err2.statusCode = 400;
      err2.code = 'USERNAME_EMAIL_REQUIRED';
      throw err2;
    }

    if (where) {
      query = {and: [query, where]};
    }

    function tokenHandler(token) {
      if (Array.isArray(include) ? include.indexOf('user') !== -1 : include === 'user') {
        token.__data.user = user;
      }
      return token;
    }

    return this.findOne({where: query}).then(user => {
      const defaultError = new Error(g.f('login failed'));
      defaultError.statusCode = 401;
      defaultError.code = 'LOGIN_FAILED';

      if (user) {
        return user.hasPassword(credentials.password).then(isMatch => {
          if (isMatch) {
            if (user.createAccessToken.length === 2) {
              return user.createAccessToken(credentials.ttl).then(token => tokenHandler(token, user, include));
            } else {
              return user.createAccessToken(credentials.ttl, credentials).then(token => tokenHandler(token, user, include));
            }
          } else {
            debug('The password is invalid for user %s', query.email || query.username);
            throw defaultError;
          }
        });
      } else {
        debug('No matching record is found for user %s', query.email || query.username);
        throw defaultError;
      }
    });
  };

  Account.me = function (options) {
    return PromiseA.fromCallback(cb => Account.findOne({
      where: {id: options.accessToken.userId}
    }, cb)).then(user => {
      if (!user) {
        throw errs.create({
          code: 'ACCOUNT_NOT_FOUND',
          status: 404,
          statusCode: 404,
          message: '账号不存在'
        });
      }
      return user;
    });
  };

  Account.prototype.enable = function () {
    return this.updateAttribute('enabled', true);
  };

  Account.prototype.disable = function () {
    return this.updateAttribute('enabled', false);

  };

  Account.enable = function (identity) {
    return Account.findOne({where: {or: [{id: identity}, {username: identity}, {email: identity}]}}).then(account => {
      if (!account) throw errs.create({
        code: 'ACCOUNT_NOT_FOUND',
        status: 404,
        statusCode: 404,
        message: `账号不存在`
      });
      return account.enable();
    });
  };

  Account.disable = function (identity) {
    return Account.findOne({where: {or: [{id: identity}, {username: identity}, {email: identity}]}}).then(account => {
      if (!account) throw errs.create({
        code: 'ACCOUNT_NOT_FOUND',
        status: 404,
        statusCode: 404,
        message: `账号不存在`
      });
      return account.disable();
    });
  };

  Account.destroy = async function (id) {
    let account = await Account.findById(id);
    if (account.username == 'admin') {
      throw errs.create({
        code: 'AMIND_DELETING',
        status: 401,
        statusCode: 401,
        message: '无法删除系统管理员'
      });
    }
    return Account.destroyById(id);
  };

  Account.loginOrCreateByOpenId = async function (openId) {
    let user = await Account.findOne({where: {openid: openId}});
    if (!user) {
      let unionid = await Account.app.luckydraw.getUnionid({openids: [openId]});
      let data = unionid.data && unionid.data.user_info_list || [];
      unionid = data[0] && data[0].unionid;

      // 有该unionid的用户，打通该用户
      user = unionid && await Account.findOne({where: {unionid}});

      let preUser = await Account.app.luckydraw.getCommonUser({openid: openId});
      let pu = preUser && preUser.data || {};

      if (user) {
        await user.updateAttributes({
          openid: openId,
          username: openId,
          nickname: pu.nickname,
          avatar: pu.avatar,
        })
      } else {
        user = await Account.create({
          openid: openId,
          username: openId,
          password: openId,
          type: "user",
          nickname: pu.nickname,
          avatar: pu.avatar,
          unionid
        });
      }
    } else if (!user.nickname) {
      let preUser = await Account.app.luckydraw.getCommonUser({openid: openId});
      let pu = preUser && preUser.data || {};
      user = await user.updateAttributes({nickname: pu.nickname, avatar: pu.avatar});
      await Account.getUnionid([user]);
    } else if (!user.unionid) {
      await Account.getUnionid([user]);
    }

    return await user.createAccessToken(14 * 24 * 60 * 60);
  };

  Account.loginOrCreateByUnionid = async function (unionid) {
    let user = unionid && await Account.findOne({where: {unionid: unionid}});
    if (!user) {
      user = await Account.create({
        unionid,
        password: unionid,
      });
      return await user.createAccessToken(14 * 24 * 60 * 60)
    } else {
      return await user.createAccessToken(14 * 24 * 60 * 60);
    }
  };

  Account.findOrCreateByUnionid = async function (unionid) {
    let user = unionid && await Account.findOne({where: {unionid: unionid}});
    if (!user) {
      user = await Account.create({
        unionid,
        password: unionid
      });
    }
    return user
  };

  Account.updateWechatPaymentOpenid = async function (openid, wechat_payment_openid) {
    let user = await Account.findOne({where: {openid}});
    if (!user) {
      user = await Account.create({
        openid: openid,
        username: openid,
        password: openid,
        type: "user",
        wechatPaymentOpenid: wechat_payment_openid
      })
    } else {
      if (user.wechatPaymentOpenid) {
        return
      }
      await user.updateAttributes({
        wechatPaymentOpenid: wechat_payment_openid
      })
    }
  };

  Account.getDrawToken = async function (options) {
    let user = await Account.findById(options.accessToken.userId);
    let result = user && user.openid && await Account.app.luckydraw.getDrawToken(user.openid);
    return result && result.data;
  };

  Account.getWechatInfo = async function (openId) {
    let result = await Account.app.luckydraw.getUserInfo({openid: openId});
    if (result && result.data) {
      let user = await Account.findOne({where: {openid: openId}});
      await user.updateAttributes({
        nickname: result.data.nickname,
        avatar: result.data.headimgurl
      });
    }
    return result.data
  };

  // 更新用户unionid；
  Account.getUnionid = async function (users) {
    let openids = users.map(v => {return v.openid});
    let result = await Account.app.luckydraw.getUnionid({openids: openids});
    let data = result.data && result.data.user_info_list || [];
    for (let i = 0; i < data.length; i++) {
      console.log("unionids:", data[i].unionid);
      data[i].unionid && await users[i].updateAttributes({
        unionid: data[i].unionid
      })
    }
    return result.data
  };

  Account.updateRole = async function (id, data) {
    let { roleIds } = data;
    let account = await Account.findById(id);
    roleIds = roleIds || [];

    const RoleMapping = Account.app.models.RoleMapping;
    let roles = await RoleMapping.find({
      where: {
        principalType: RoleMapping.USER,
        principalId: id,
      }
    });

    const tx = await Account.beginTransaction({isolationLevel: 'READ COMMITTED', timeout: 15000});

    try {
      for (let i=0; i < roles.length; i++) {
        await roles[i].destroy({transaction: tx});
      }

      for (let i = 0; i < roleIds.length; i++) {
        let role = await Account.app.models.Role.findById(roleIds[i]);
        await role.principals.create({
          principalType: Account.app.models.RoleMapping.USER,
          principalId: account.id
        }, {transaction: tx});
      }

      await tx.commit();
      return account;
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  };

  Account.remoteMethod('enable', {
    description: '启用一个用户',
    accessType: 'WRITE',
    accepts: [{
      arg: 'identity', type: 'string', required: true, http: {source: 'path'},
      description: 'The id, username or email of the account'
    }],
    returns: {arg: 'data', type: 'array', root: true},
    http: {verb: 'put', path: '/:identity/enable'},
  });

  Account.remoteMethod('disable', {
    description: '关闭一个用户',
    accessType: 'WRITE',
    accepts: [{
      arg: 'identity', type: 'string', required: true, http: {source: 'path'},
      description: 'The id, username or email of the account'
    }],
    returns: {arg: 'data', type: 'array', root: true},
    http: {verb: 'put', path: '/:identity/disable'},
  });

  Account.remoteMethod('me', {
    description: '获取自己的信息',
    accessType: 'READ',
    accepts: [{arg: 'options', type: 'object', http: 'optionsFromRequest'}],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/me'},
  });


  Account.remoteMethod('destroy', {
    description: '删除用户',
    accessType: 'WRITE',
    accepts: [{arg: 'id', type: 'string', required: true, http: {source: 'path'}}
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'del', path: '/:id'},
  });


  Account.remoteMethod(
    'login',
    {
      description: '用户登录',
      accepts: [
        {arg: 'credentials', type: 'object', required: true, http: {source: 'body'}},
        {
          arg: 'include', type: ['string'], http: {source: 'query'},
          description: 'Related objects to include in the response. ' +
          'See the description of return value for more details.'
        },
      ],
      returns: {
        arg: 'accessToken', type: 'object', root: true,
        description: g.f('The response body contains properties of the {{AccessToken}} created on login.\n' +
          'Depending on the value of `include` parameter, the body may contain ' +
          'additional properties:\n\n' +
          '  - `user` - `U+007BUserU+007D` - Data of the currently logged in user. ' +
          '{{(`include=user`)}}\n\n'),
      },
      http: {verb: 'post', path: '/login'},
    }
  );

  Account.remoteMethod('getUsers', {
    description: '查询用户',
    accessType: 'READ',
    accepts: [{
      arg: 'fullname', type: 'string'
    },{
      arg: 'openid', type: 'string'
    },{
      arg: 'order', type: 'string'
    }, {
      arg: 'skip', type: 'number'
    }, {
      arg: 'limit', type: 'number'
    }],
    returns: {arg: 'data', type: 'array', root: true},
    http: {verb: 'get', path: '/users'},
  });

  Account.remoteMethod('getUserCount', {
    description: '查询用户数量',
    accessType: 'READ',
    accepts: [{
      arg: 'fullname', type: 'string'
    },{
      arg: 'openid', type: 'string'
    }],
    returns: {arg: 'data', type: 'number', root: true},
    http: {verb: 'get', path: '/users/count'},
  });

  Account.remoteMethod('getUser', {
    description: '获取用户',
    accessType: 'READ',
    accepts: [{arg: 'id', type: 'string', required: true, http: {source: 'path'}}],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'get', path: '/users/:id'},
  });

  Account.remoteMethod('getStaffs', {
    description: '查询员工',
    accessType: 'READ',
    accepts: [{
      arg: 'order', type: 'string'
    }, {
      arg: 'skip', type: 'number'
    }, {
      arg: 'limit', type: 'number'
    }],
    returns: {arg: 'data', type: 'array', root: true},
    http: {verb: 'get', path: '/staffs'},
  });

  Account.remoteMethod('getStaff', {
    description: '获取员工',
    accessType: 'READ',
    accepts: [{arg: 'id', type: 'string', required: true, http: {source: 'path'}}],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'get', path: '/staffs/:id'},
  });

  Account.remoteMethod('getRoles', {
    description: '获取角色',
    accessType: 'READ',
    accepts: [],
    returns: {arg: 'data', type: 'array', root: true},
    http: {verb: 'get', path: '/roles'},
  });

  Account.remoteMethod('createRole', {
    description: '创建角色',
    accessType: 'WRITE',
    accepts: [{arg: 'data', type: 'object', required: true, http: {source: 'body'}, description: "name, description"}],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'post', path: '/roles'},
  });

  Account.remoteMethod('createStaff', {
    description: '创建员工',
    accessType: 'WRITE',
    accepts: [{arg: 'data', type: 'object', required: true, http: {source: 'body'}}],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'post', path: '/staffs'},
  });

  Account.remoteMethod('updateStaff', {
    description: '修改员工',
    accessType: 'WRITE',
    accepts: [
      {arg: 'id', type: 'string', required: true, http: {source: 'path'}},
      {arg: 'data', type: 'object', required: true, http: {source: 'body'}}
      ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'put', path: '/staffs/:id'},
  });

  Account.remoteMethod('loginOrCreateByOpenId', {
    description: '根据openid获取token',
    accessType: 'WRITE',
    accepts: [{arg: 'openId', type: 'string', required: true}],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'post', path: '/loginOrCreateByOpenId'},
  });

  Account.remoteMethod('getWechatInfo', {
    description: '获取微信基本信息',
    accessType: 'READ',
    accepts: [{arg: 'openId', type: 'string', required: true}],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'get', path: '/getWechatInfo'},
  });

  Account.remoteMethod('getUnionid', {
    description: '获取微信unionid',
    accessType: 'READ',
    accepts: [{arg: 'openids', type: 'array', required: true}],
    returns: {arg: 'data', type: 'object', root: true},
    http: {verb: 'get', path: '/getUnionid'},
  });

  Account.remoteMethod('getDrawToken', {
    description: '换取draw的token',
    accessType: 'READ',
    accepts: [{arg: 'options', type: 'object', http: 'optionsFromRequest'}],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/getDrawToken'},
  });

  Account.remoteMethod('updateRole', {
    description: '修改员工角色',
    accessType: 'WRITE',
    accepts: [
      {arg: 'id', type: 'string', required: true, http: {source: 'path'}},
      {arg: 'data', type: 'object', required: true, http: {source: 'body'}}
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'put', path: '/staffRoles/:id'},
  });
};


