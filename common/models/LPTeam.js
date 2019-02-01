'use strict';

const farmhash = require('farmhash');
const g = require('strong-globalize')();
const moment = require('moment');

module.exports = function (LPTeam) {

  LPTeam.makeTeam = async function (hostId, options) {
    if (!hostId) {
      const err = new Error(g.f('队伍不存在'));
      err.statusCode = 400;
      throw err;
    }
    let memberId = options.accessToken.userId;
    let preMemberTeamAccount = await LPTeam.app.models.LPTeamAccount.find({where: {accountId: memberId, role: 1}});
    if (preMemberTeamAccount.length > 0) {
      const err = new Error(g.f('您已作为队员参与过此次活动'));
      err.statusCode = 400;
      throw err;
    }

    let memberTeamAccount = await LPTeam.app.models.LPTeamAccount.findOne({where: {accountId: memberId, createdAt: {between: [moment().startOf('day').utc().format(), moment().endOf('day').utc().format()]}}});
    if (memberTeamAccount) {
      const err = new Error(g.f('您已在别的队伍中'));
      err.statusCode = 400;
      throw err;
    }
    let lpTeamAccount = await LPTeam.app.models.LPTeamAccount.findOne({where: {accountId: hostId, createdAt: {between: [moment().startOf('day').utc().format(), moment().endOf('day').utc().format()]}}});

    if (lpTeamAccount) {
      // 有组队
      let team = await LPTeam.findById(lpTeamAccount.LPTeamId);
      if (team.memberList && team.memberList.length >= 3) {
        const err = new Error(g.f('队伍已满员'));
        err.statusCode = 400;
        throw err;
      }
      const tx = await LPTeam.beginTransaction({isolationLevel: 'READ COMMITTED', timeout: 15000});
      try {
        // 队伍满员，生成对抗队伍
        if (team.memberList && team.memberList.length === 2) {
          let againstTeam = await LPTeam.findOne({where: {enable: true}, order: "createdAt DESC"});
          await team.updateAttributes({
            againstTeamId: againstTeam.id,
            enable: true
          })
        }
        // 创建队员对应关系
        await LPTeam.app.models.LPTeamAccount.create({
          accountId: memberId,
          LPTeamId: team.id
        }, {transaction: tx});
        // 加入队员
        await team.updateAttributes({
          memberList: [...team.memberList, memberId]
        }, {transaction: tx});
        await tx.commit();
        return team
      } catch (e) {
        await tx.rollback();
        throw e;
      }
    } else {
      // 无组队
      const tx = await LPTeam.beginTransaction({isolationLevel: 'READ COMMITTED', timeout: 15000});
      try {
        // 创建组队
        let team = await LPTeam.create({
          leaderId: hostId,
          memberList: [memberId]
        }, {transaction: tx});

        // 创建对应关系
        await LPTeam.app.models.LPTeamAccount.create({
          accountId: hostId,
          LPTeamId: team.id,
          role: 2
        }, {transaction: tx});
        await LPTeam.app.models.LPTeamAccount.create({
          accountId: memberId,
          LPTeamId: team.id
        }, {transaction: tx});
        await tx.commit();
        return team
      } catch (e) {
        await tx.rollback();
        throw e;
      }
    }
  };

  // 队伍详情
  LPTeam.getDetail = async function (id) {
    let team = await LPTeam.findById(id);
    team.leader = await LPTeam.app.models.Account.findById(team.leaderId);
    let members = [];
    if (team.memberList) {
      for (let i = 0; i < team.memberList.length; i++) {
        members.push(await LPTeam.app.models.Account.findById(team.memberList[i]))
      }
    }
    team.members = members;
    return team
  };

  LPTeam.getMyTeam = async function (options) {
    let userId = options.accessToken.userId;
    let lpTeamAccount = await LPTeam.app.models.LPTeamAccount.findOne({where: {accountId: userId, createdAt: {between: [moment().startOf('day').utc().format(), moment().endOf('day').utc().format()]}}});
    if (lpTeamAccount) {
      // 有组队
      return LPTeam.getDetail(lpTeamAccount.LPTeamId);
    } else {
      return {}
    }
   };

  // 昨日队伍（包括奖励水晶）
  LPTeam.getYdayReward = async function (options) {
    let userId = options.accessToken.userId;
    let lpTeamAccount = await LPTeam.app.models.LPTeamAccount.findOne({where: {accountId: userId, createdAt: {between: [moment().subtract(1,'day').startOf('day').utc().format(), moment().subtract(1,'day').endOf('day').utc().format()]}}});
    if (lpTeamAccount) {
      return LPTeam.getDetail(lpTeamAccount.LPTeamId);
    } else {
      return {}
    }
  };

  // 点赞
  LPTeam.support = async function (teamId, hostId, options) {
    let userId = options.accessToken.userId;
    const tx = await LPTeam.beginTransaction({isolationLevel: 'READ COMMITTED', timeout: 15000});
    try {
      let lpsupport = await LPTeam.app.models.LPSupport.support(teamId, userId, tx);
      let team = await LPTeam.findById(teamId);
      // 队员贡献点赞数
      let supportDetail = team.supportDetail || {};
      supportDetail[hostId] = supportDetail[hostId] ? supportDetail[hostId] + 1 : 1;
      await team.updateAttributes({
        support: team.support + 1,
        supportDetail: supportDetail
      }, {transaction: tx});
      await tx.commit();
      return {support: lpsupport, team}
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  };

  // 查看用户状态（是否能加入队伍）
  LPTeam.checkUser = async function (options) {
    let hasTeam = false;
    let joinAble = false;
    let userId = options.accessToken.userId;
    let memberTeamAccount = await LPTeam.app.models.LPTeamAccount.findOne({where: {accountId: userId, createdAt: {between: [moment().startOf('day').utc().format(), moment().endOf('day').utc().format()]}}});
    if (memberTeamAccount) {
      hasTeam = true
    }

    let preMemberTeamAccount = await LPTeam.app.models.LPTeamAccount.find({where: {accountId: userId, role: 1}});
    if (preMemberTeamAccount.length === 0) {
      joinAble = true
    }
    return {hasTeam, joinAble}
  };

  // 手动结算
  LPTeam.settle = async function () {
    await LPTeam.app.settleTeam();
  };

  LPTeam.remoteMethod('makeTeam', {
    description: '加入队伍',
    accessType: 'WRITE',
    accepts: [
      {arg: 'hostId', type: 'string', required: true, description: "邀请人id"},
      {arg: 'options', type: 'object', http: 'optionsFromRequest'}
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'post', path: '/makeTeam'},
  });

  LPTeam.remoteMethod('getMyTeam', {
    description: '获取我的队伍',
    accessType: 'READ',
    accepts: [{arg: 'options', type: 'object', http: 'optionsFromRequest'}],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/getMyTeam'},
  });

  LPTeam.remoteMethod('getYdayReward', {
    description: '获取我的队伍(昨日，包含水晶奖励情况)',
    accessType: 'READ',
    accepts: [{arg: 'options', type: 'object', http: 'optionsFromRequest'}],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/getYdayReward'},
  });

  LPTeam.remoteMethod('support', {
    description: '点赞',
    accessType: 'WRITE',
    accepts: [
      {arg: 'teamId', type: 'string', required: true, description: "队伍id"},
      {arg: 'hostId', type: 'string', required: true, description: "分享人id"},
      {arg: 'options', type: 'object', http: 'optionsFromRequest'}
    ],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'post', path: '/support'},
  });

  LPTeam.remoteMethod('getDetail', {
    description: '获取某个队伍详情',
    accessType: 'READ',
    accepts: [{arg: 'id', type: 'string', required: true, description: "队伍id"}],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/getDetail'},
  });

  LPTeam.remoteMethod('checkUser', {
    description: '获取我的状态，是否能加入队伍等',
    accessType: 'READ',
    accepts: [{arg: 'options', type: 'object', http: 'optionsFromRequest'}],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/checkUser'},
  });

  LPTeam.remoteMethod('settle', {
    description: '手动结算',
    accessType: 'READ',
    accepts: [{arg: 'options', type: 'object', http: 'optionsFromRequest'}],
    returns: {arg: 'result', type: 'object', root: true},
    http: {verb: 'get', path: '/settle'},
  });
};
