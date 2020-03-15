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
  let umpireIds;

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
    for (let i = 0; i < 6; i++) {
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

    umpireIds = await createUmpires(token1);

    async function createTeams(token) {
      const teamCreatePromises1 = [];
      for (let i = 0; i < 3; i++) {
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
      umpire1: umpireIds[0],
      umpire2: umpireIds[1],
      umpire3: umpireIds[2],
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
      umpire1: umpireIds[0],
      umpire2: umpireIds[1],
      umpire3: umpireIds[2],
      overs: 4,
    });
  });

  it('should create a match with umpire, tags', async () => {
    await testCreateMatch(token1, {
      name: 'match 3',
      team1: teamIds1[0],
      team2: teamIds1[1],
      umpire1: umpireIds[0],
      umpire2: umpireIds[1],
      umpire3: umpireIds[2],
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
    matchId2 = await testCreateMatch(token2, {
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
        umpire1: umpireIds[0],
        umpire2: umpireIds[1],
        umpire3: umpireIds[2],
        overs: 4,
      });

    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.have.members(['umpire1', 'umpire2', 'umpire3']);
  });

  it('should not get match list without authorization', async () => {
    const res = await chai.request(app)
      .get('/api/matches');
    res.should.have.status(401);
  });

  it('should get matches of only authenticated user', async () => {
    const res = await chai.request(app)
      .get('/api/matches')
      .set('Authorization', `Bearer ${token1}`);

    res.should.have.status(200);
    const matches = res.body;
    matches.should.be.an('array').with.length(3);
  });

  it('should not get tag list without authentication', async () => {
    const res = await chai.request(app)
      .get('/api/matches/tags');
    res.should.have.status(401);
  });

  it('should get tags of only authenticated user', async () => {
    let res = await chai.request(app)
      .get('/api/matches/tags')
      .set('Authorization', `Bearer ${token1}`);

    res.should.have.status(200);
    let tags = res.body;
    tags.should.be.an('array').with.ordered.members(['abc', 'efg', 'hij']);

    res = await chai.request(app)
      .get('/api/matches/tags')
      .set('Authorization', `Bearer ${token2}`);

    res.should.have.status(200);
    tags = res.body;
    tags.should.be.an('array').with.length(0);
  });

  it('should not begin match without any required value', async () => {
    const matchBeginPayload = {
      team1Captain: playerIds[0],
      team2Captain: playerIds[2],
      team1Players: playerIds.slice(0, 2),
      team2Players: playerIds.slice(2),
    };

    for (const key in matchBeginPayload) {
      const payload = {...matchBeginPayload, [key]: null};
      const res = await chai.request(app)
        .put(`/api/matches/${matchId1}/begin`)
        .set('Authorization', `Bearer ${token1}`)
        .send(payload);

      res.should.have.status(400);
      res.body.err.map((e) => e.param).should.contain(key);
    }
  });

  async function shouldHaveTeam1CaptainError(matchBeginPayload) {
    const res = await chai.request(app)
      .put(`/api/matches/${matchId1}/begin`)
      .set('Authorization', `Bearer ${token1}`)
      .send(matchBeginPayload);

    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.contain('team1Captain');
  }

  async function shouldHaveTeam2CaptainError(matchBeginPayload) {
    const res = await chai.request(app)
      .put(`/api/matches/${matchId1}/begin`)
      .set('Authorization', `Bearer ${token1}`)
      .send(matchBeginPayload);

    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.contain('team2Captain');
  }

  it('should not start match without sufficient player', async () => {
    const matchBeginPayload = {
      team1Captain: playerIds[0],
      team2Captain: playerIds[4],
      team1Players: playerIds.slice(0, 1),
      team2Players: playerIds.slice(2),
    };

    // for front-end implementation, the error is passed for param `team1Captain` instead of `team1Players`
    await shouldHaveTeam1CaptainError(matchBeginPayload);

    matchBeginPayload.team1Players = playerIds.slice(0, 2);
    matchBeginPayload.team2Players = playerIds.slice(5);
    // for front-end implementation, the error is passed for param `team2Captain` instead of `team2Players`
    await shouldHaveTeam2CaptainError(matchBeginPayload);
  });

  it('should not begin match with captain outside of team', async () => {
    const matchBeginPayload = {
      team1Captain: playerIds[0],
      team2Captain: playerIds[4],
      team1Players: playerIds.slice(1, 3),
      team2Players: playerIds.slice(4, 6),
    };
    await shouldHaveTeam1CaptainError(matchBeginPayload);

    matchBeginPayload.team2Captain = playerIds[3];
    await shouldHaveTeam2CaptainError(matchBeginPayload);
  });

  it("should not start other user's match", async () => {
    const matchBeginPayload = {
      team1Captain: playerIds[0],
      team2Captain: playerIds[3],
      team1Players: playerIds.slice(0, 2),
      team2Players: playerIds.slice(3),
    };

    const res = await chai.request(app)
      .put(`/api/matches/${matchId2}/begin`)
      .set('Authorization', `Bearer ${token1}`)
      .send(matchBeginPayload);

    res.should.have.status(404);
  });

  it('should not begin match with players of other user', async () => {
    const matchBeginPayload = {
      team1Captain: playerIds[0],
      team2Captain: playerIds[3],
      team1Players: playerIds.slice(0, 2),
      team2Players: playerIds.slice(3),
    };

    const res = await chai.request(app)
      .put(`/api/matches/${matchId1}/begin`)
      .set('Authorization', `Bearer ${token2}`)
      .send(matchBeginPayload);

    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.have.members(['team1Players', 'team2Players']);
  });

  it('should begin match', async () => {
    const matchBeginPayload = {
      team1Captain: playerIds[0],
      team2Captain: playerIds[3],
      team1Players: playerIds.slice(0, 2),
      team2Players: playerIds.slice(3),
    };

    const res = await chai.request(app)
      .put(`/api/matches/${matchId1}/begin`)
      .set('Authorization', `Bearer ${token1}`)
      .send(matchBeginPayload);

    res.should.have.status(200);
    res.body.match.state.should.be.equal('toss');
  });

  it('should not toss a match of other user', async () => {
    const tossPayload = {
      won: teamIds1[0],
      choice: 'Bat',
    };

    const res = await chai.request(app)
      .put(`/api/matches/${matchId1}/toss`)
      .set('Authorization', `Bearer ${token2}`)
      .send(tossPayload);

    res.should.have.status(404);
  });

  it('should not toss a match with invalid value', async () => {
    const tossPayload = {
      won: teamIds1[0],
      choice: 'Bat',
    };

    for (const key in tossPayload) {
      const dumpedPayload = {...tossPayload, [key]: null};

      const res = await chai.request(app)
        .put(`/api/matches/${matchId1}/toss`)
        .set('Authorization', `Bearer ${token2}`)
        .send(dumpedPayload);

      res.should.have.status(400);
      res.body.err.map((e) => e.param).should.have.members([key]);
    }

    let res = await chai.request(app)
      .put(`/api/matches/${matchId1}/toss`)
      .set('Authorization', `Bearer ${token1}`)
      .send({...tossPayload, won: teamIds1[2]});

    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.have.members(['won']);

    res = await chai.request(app)
      .put(`/api/matches/${matchId1}/toss`)
      .set('Authorization', `Bearer ${token1}`)
      .send({...tossPayload, choice: 'None'});

    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.have.members(['choice']);
  });

  it('should toss a match', async () => {
    const tossPayload = {
      won: teamIds1[0],
      choice: 'Bowl',
    };

    const res = await chai.request(app)
      .put(`/api/matches/${matchId1}/toss`)
      .set('Authorization', `Bearer ${token1}`)
      .send(tossPayload);

    res.should.have.status(200);
    const {match} = res.body;
    match.team1WonToss.should.be.true;
    match.team1BatFirst.should.be.false;
    match.state.should.be.equals('innings1');
    match.innings1.should.have.property('overs').that.is.an('array').with.length(0);
  });

  it('should not toss an already tossed match', async () => {
    const tossPayload = {
      won: teamIds1[0],
      choice: 'Bowl',
    };

    const res = await chai.request(app)
      .put(`/api/matches/${matchId1}/toss`)
      .set('Authorization', `Bearer ${token1}`)
      .send(tossPayload);

    res.should.have.status(404);
  });

  after(async () => {
    await Match.deleteMany({});
    await Team.deleteMany({});
    await Player.deleteMany({});
    await Umpire.deleteMany({});
    await User.deleteMany({});
  });
});
