const {
  describe, before, it, after,
} = require('mocha');
const chai = require('chai');
const chaiHttp = require('chai-http');

chai.should();

process.env.IS_TEST = true;
const app = require('../app');
const User = require('../models/user');
const Player = require('../models/player');
const Team = require('../models/team');
const Match = require('../models/match');
const Umpire = require('../models/umpire');
const {namify} = require('../lib/utils');

chai.use(chaiHttp);

describe('Test Match Functionality', function matchTestSuit() {
  this.timeout(10000);
  let token1;
  let token2;
  let playerIds;
  let teamIds1;
  let teamIds2;
  let matchId1;
  let matchId2;
  let umpireIds1;
  let umpireIds2;

  before(async () => {
    await chai.request(app)
      .post('/api/auth/register')
      .send({
        username: 'username1',
        password: '1234',
        confirm: '1234',
      });
    const res = await chai.request(app)
      .post('/api/auth/login')
      .send({
        username: 'username1',
        password: '1234',
      });
    token1 = res.body.token;

    await chai.request(app)
      .post('/api/auth/register')
      .send({
        username: 'username2',
        password: '1234',
        confirm: '1234',
      });
    const loginRes = await chai.request(app)
      .post('/api/auth/login')
      .send({
        username: 'username2',
        password: '1234',
      });
    token2 = loginRes.body.token;

    const playerCreatePromises = [];
    for (let i = 0; i < 5; i++) {
      const playerCreatePromise = chai.request(app)
        .post('/api/players')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          name: `player${i}`,
          jerseyNo: i,
        });
      playerCreatePromises.push(playerCreatePromise);
    }

    const playerCreateResponses = await Promise.all(playerCreatePromises); // creating players concurrently
    playerIds = playerCreateResponses.map((r) => r.body.player._id);

    async function createUmpires(token) {
      const umpireCreatePromises = [];
      for (let i = 0; i < 3; i++) {
        const playerCreatePromise = chai.request(app)
          .post('/api/umpires')
          .set('Authorization', `Bearer ${token}`)
          .send({name: `umpire ${i}`});
        umpireCreatePromises.push(playerCreatePromise);
      }

      const umpireCreateResponses = await Promise.all(umpireCreatePromises); // creating players concurrently
      return umpireCreateResponses.map((r) => r.body.umpire._id);
    }
    umpireIds1 = await createUmpires(token1);
    umpireIds2 = await createUmpires(token2);

    async function createTeams(token) {
      const teamCreatePromises1 = [];
      for (let i = 0; i < 2; i++) {
        const teamCreatePromise = chai.request(app)
          .post('/api/teams')
          .set('Authorization', `Bearer ${token}`)
          .send({
            name: `team${i}`,
            shortName: `n${i}`,
          });
        teamCreatePromises1.push(teamCreatePromise);
      }

      const teamCreateResponses1 = await Promise.all(teamCreatePromises1); // creating teams concurrently
      return teamCreateResponses1.map((r) => r.body.team._id);
    }

    teamIds1 = await createTeams(token1);
    teamIds2 = await createTeams(token2);
  });

  it('should not create a match without authentication', async () => {
    const res = await chai.request(app)
      .post('/api/matches')
      .send({
        name: 'match 1',
        team1: teamIds1[0],
        team2: teamIds1[1],
        overs: 4,
        tags: [],
      });

    res.should.have.status(401);
  });

  it('should not create match without sufficient info', async () => {
    const matchInfo = {
      name: 'match 1',
      team1: teamIds1[0],
      team2: teamIds1[1],
      overs: 4,
    };

    for (const key in matchInfo) {
      const dumpedMatchInfo = {...matchInfo, [key]: undefined};
      const res = await chai.request(app)
        .post('/api/matches')
        .set('Authorization', `Bearer ${token1}`)
        .send(dumpedMatchInfo);

      res.should.have.status(400);
      res.body.err.map((e) => e.param).should.contain(key);
    }
  });

  it('should not create match with duplicate team', async () => {
    const res = await chai.request(app)
      .post('/api/matches')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        name: 'match 1',
        team1: teamIds1[0],
        team2: teamIds1[0],
        overs: 4,
      });

    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.contain('team1');
  });

  it('should not create match with duplicate umpire', async () => {
    const matchInfo = {
      name: 'match 1',
      team1: teamIds1[0],
      team2: teamIds1[1],
      umpire1: umpireIds1[0],
      umpire2: umpireIds1[1],
      umpire3: umpireIds1[2],
      overs: 4,
    };
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      const dumpedMatchInfo = {...matchInfo, [`umpire${j + 1}`]: matchInfo[`umpire${i + 1}`]};
      const res = await chai.request(app)
        .post('/api/matches')
        .set('Authorization', `Bearer ${token1}`)
        .send(dumpedMatchInfo);

      res.should.have.status(400);
      res.body.err.map((e) => e.param).should.contain(`umpire${i + 1}`)
        .and.contain(`umpire${j + 1}`);
    }
  });

  async function testCreateMatch(token, matchData) {
    const res = await chai.request(app)
      .post('/api/matches')
      .set('Authorization', `Bearer ${token}`)
      .send(matchData);
    res.should.have.status(201);
    const {match} = res.body;
    for (const key in matchData) {
      if (key === 'name') {
        match.name.should.be.equals(namify(matchData.name));
      } else if (key === 'tags') {
        match.tags.should.have.ordered.members(matchData.tags);
      } else {
        match[key].should.be.equals(matchData[key]);
      }
    }
    if (!('tags' in matchData)) {
      match.tags.should.be.an('array').that.have.length(0);
    }
    match.should.have.property('_id');
    return match._id;
  }

  it('should create a match without umpire, tags', async () => {
    matchId1 = await testCreateMatch(token1, {
      name: 'match 1',
      team1: teamIds1[0],
      team2: teamIds1[1],
      overs: 4,
    });
  });

  it('should create a match with umpire', async () => {
    await testCreateMatch(token1, {
      name: 'match 2',
      team1: teamIds1[0],
      team2: teamIds1[1],
      umpire1: umpireIds1[0],
      umpire2: umpireIds1[1],
      umpire3: umpireIds1[2],
      overs: 4,
    });
  });

  it('should create a match with umpire, tags', async () => {
    await testCreateMatch(token1, {
      name: 'match 3',
      team1: teamIds1[0],
      team2: teamIds1[1],
      umpire1: umpireIds1[0],
      umpire2: umpireIds1[1],
      umpire3: umpireIds1[2],
      overs: 4,
      tags: ['abc', 'efg', 'hij'],
    });
  });

  it('should not create match with same name', async () => {
    const res = await chai.request(app)
      .post('/api/matches')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        name: 'match 1',
        team1: teamIds1[0],
        team2: teamIds1[1],
        overs: 4,
      });

    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.contain('name');
  });

  it('should create match with same name but different user', async () => {
    matchId1 = await testCreateMatch(token2, {
      name: 'match 1',
      team1: teamIds2[0],
      team2: teamIds2[1],
      overs: 4,
    });
  });

  it('should not create match with teams of other user', async () => {
    const res = await chai.request(app)
      .post('/api/matches')
      .set('Authorization', `Bearer ${token2}`)
      .send({
        name: 'match 2',
        team1: teamIds1[0],
        team2: teamIds1[1],
        overs: 4,
      });

    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.contain('team1')
      .and.contain('team2');
  });

  it('should not create match with umpires of other user', async () => {
    const res = await chai.request(app)
      .post('/api/matches')
      .set('Authorization', `Bearer ${token2}`)
      .send({
        name: 'match 2',
        team1: teamIds2[0],
        team2: teamIds2[1],
        umpire1: umpireIds1[0],
        umpire2: umpireIds1[1],
        umpire3: umpireIds1[2],
        overs: 4,
      });

    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.have.members(['umpire1', 'umpire2', 'umpire3']);
  });

  after(async () => {
    await Match.deleteMany({});
    await Team.deleteMany({});
    await Player.deleteMany({});
    await Umpire.deleteMany({});
    await User.deleteMany({});
  });
});
