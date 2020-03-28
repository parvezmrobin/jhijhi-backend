/**
 * Parvez M Robin
 * this@parvezmrobin.com
 * Mar 28, 2020
 */

const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../../app');
const User = require('../../models/user');
const Player = require('../../models/player');
const Team = require('../../models/team');
const Match = require('../../models/match');
const Umpire = require('../../models/umpire');

chai.use(chaiHttp);

function get(url, token, query) {
  const request = chai.request(app).get(url);
  if (token) {
    request.set('Authorization', `Bearer ${token}`);
  }
  return request.send(query);
}

function post(url, payload, token) {
  const request = chai.request(app).post(url);
  if (token) {
    request.set('Authorization', `Bearer ${token}`);
  }
  return request.send(payload);
}

function put(url, payload, token) {
  const request = chai.request(app).put(url);
  if (token) {
    request.set('Authorization', `Bearer ${token}`);
  }
  return request.send(payload);
}

function destroy(url, token, payload) {
  const request = chai.request(app).delete(url);
  if (token) {
    request.set('Authorization', `Bearer ${token}`);
  }
  return request.send(payload);
}

async function startUp() {
  await post('/api/auth/register', {
    username: 'username1',
    password: '1234',
    confirm: '1234',
  });
  const res = await post('/api/auth/login', {
    username: 'username1',
    password: '1234',
  });
  const token1 = res.body.token;

  await post('/api/auth/register', {
    username: 'username2',
    password: '1234',
    confirm: '1234',
  });
  const loginRes = await post('/api/auth/login', {
    username: 'username2',
    password: '1234',
  });
  const token2 = loginRes.body.token;

  async function createPlayers(token) {
    const playerCreatePromises = [];
    for (let i = 0; i < 6; i++) {
      const playerCreatePromise = post('/api/players', {
        name: `player${i}`,
        jerseyNo: i,
      }, token);
      playerCreatePromises.push(playerCreatePromise);
    }

    const playerCreateResponses = await Promise.all(playerCreatePromises); // creating players concurrently
    const playerIds = playerCreateResponses.map((r) => r.body.player._id);
    return playerIds;
  }

  const playerIds1 = await createPlayers(token1);
  const playerIds2 = await createPlayers(token2);

  async function createUmpires(token) {
    const umpireCreatePromises = [];
    for (let i = 0; i < 3; i++) {
      const playerCreatePromise = post('/api/umpires', {name: `umpire${i}`}, token);
      umpireCreatePromises.push(playerCreatePromise);
    }

    const umpireCreateResponses = await Promise.all(umpireCreatePromises); // creating players concurrently
    return umpireCreateResponses.map((r) => r.body.umpire._id);
  }

  const umpireIds1 = await createUmpires(token1);
  const umpireIds2 = await createUmpires(token2);

  async function createTeams(token) {
    const teamCreatePromises1 = [];
    for (let i = 0; i < 3; i++) {
      const teamCreatePromise = post('/api/teams', {
        name: `team${i}`,
        shortName: `t${i}`,
      }, token);
      teamCreatePromises1.push(teamCreatePromise);
    }

    const teamCreateResponses1 = await Promise.all(teamCreatePromises1); // creating teams concurrently
    return teamCreateResponses1.map((r) => r.body.team._id);
  }

  const teamIds1 = await createTeams(token1);
  const teamIds2 = await createTeams(token2);

  return {
    token1, token2, playerIds1, playerIds2, umpireIds1, umpireIds2, teamIds1, teamIds2,
  };
}

async function tearDown() {
  await Match.deleteMany({});
  await Team.deleteMany({});
  await Player.deleteMany({});
  await Umpire.deleteMany({});
  await User.deleteMany({});
}

module.exports.startUp = startUp;
module.exports.tearDown = tearDown;
module.exports.get = get;
module.exports.post = post;
module.exports.put = put;
module.exports.destroy = destroy;
