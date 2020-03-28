/**
 * Parvez M Robin
 * this@parvezmrobin.com
 * Mar 29, 2020
 */

const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../app');
const User = require('../models/user');
const Player = require('../models/player');
const Team = require('../models/team');
const Match = require('../models/match');
const Umpire = require('../models/umpire');

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

async function createPlayers(token, count = 6) {
  const playerCreatePromises = [];
  for (let i = 0; i < count; i++) {
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

async function createUmpires(token, count = 3) {
  const umpireCreatePromises = [];
  for (let i = 0; i < count; i++) {
    const playerCreatePromise = post('/api/umpires', {name: `umpire${i}`}, token);
    umpireCreatePromises.push(playerCreatePromise);
  }

  const umpireCreateResponses = await Promise.all(umpireCreatePromises); // creating players concurrently
  return umpireCreateResponses.map((r) => r.body.umpire._id);
}

async function createTeams(token, count = 3) {
  const teamCreatePromises1 = [];
  for (let i = 0; i < count; i++) {
    const teamCreatePromise = post('/api/teams', {
      name: `team${i}`,
      shortName: `t${i}`,
    }, token);
    teamCreatePromises1.push(teamCreatePromise);
  }

  const teamCreateResponses1 = await Promise.all(teamCreatePromises1); // creating teams concurrently
  return teamCreateResponses1.map((r) => r.body.team._id);
}

async function tearDown() {
  await Match.deleteMany({});
  await Team.deleteMany({});
  await Player.deleteMany({});
  await Umpire.deleteMany({});
  await User.deleteMany({});
}

module.exports.get = get;
module.exports.post = post;
module.exports.put = put;
module.exports.destroy = destroy;
module.exports.createPlayers = createPlayers;
module.exports.createUmpires = createUmpires;
module.exports.createTeams = createTeams;
module.exports.tearDown = tearDown;
