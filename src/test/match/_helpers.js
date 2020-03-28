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

async function testBasicDataIntegrity(matchId, token, afterToss = false, state = 'toss') {
  const res = await get(`/api/matches/${matchId}`, token);

  res.should.have.status(200);
  const match = res.body;
  match.name.should.be.equals('Match 1');
  match.overs.should.be.equal(4);
  match.team1.should.include({name: 'Team0', shortName: 'T0'});
  match.team2.should.include({name: 'Team1', shortName: 'T1'});
  match.team1Captain.should.include({name: 'Player0', jerseyNo: 0});
  match.team2Captain.should.include({name: 'Player3', jerseyNo: 3});
  for (let i = 0; i < match.team1Players.length; i++) {
    const team1Player = match.team1Players[i];
    team1Player.should.include({name: `Player${i}`, jerseyNo: i});
  }
  for (let i = 0; i < match.team2Players.length; i++) {
    const team2Player = match.team2Players[i];
    team2Player.should.include({name: `Player${i + 3}`, jerseyNo: i + 3});
  }
  if (afterToss) {
    match.team1WonToss.should.be.true;
    match.team1BatFirst.should.be.false;
  } else {
    match.should.not.have.property('team1WonToss');
    match.should.not.have.property('team1BatFirst');
  }
  match.state.should.be.equals(state);
  match.tags.should.be.an('array').with.length(0);
  return match;
}

module.exports.startUp = startUp;
module.exports.tearDown = tearDown;
module.exports.get = get;
module.exports.post = post;
module.exports.put = put;
module.exports.destroy = destroy;
module.exports.testBasicDataIntegrity = testBasicDataIntegrity;
