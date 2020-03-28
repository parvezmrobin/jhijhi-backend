/**
 * Parvez M Robin
 * this@parvezmrobin.com
 * Mar 28, 2020
 */

const {
  describe, before, it, after,
} = require('mocha');
const chai = require('chai');
const {startUp} = require('./_matchHelpers');
const {
  get, post, put, destroy, tearDown,
} = require('../_helpers');
const {namify} = require('../../lib/utils');

chai.should();

describe('Test Basic Match Functionality', function matchBasicTestSuit() {
  this.timeout(10000);

  let token1;
  let token2;
  let teamIds1;
  let teamIds2;
  let umpireIds1;
  let umpireIds2;
  let matchId1;

  before(async () => {
    ({
      token1, token2, umpireIds1, umpireIds2, teamIds1, teamIds2,
    } = await startUp());
  });

  it('should not create a match without authentication', async () => {
    const res = await post('/api/matches', {
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
      const res = await post('/api/matches', dumpedMatchInfo, token1);

      res.should.have.status(400);
      res.body.err.map((e) => e.param).should.contain(key);
    }
  });

  it('should not create match with duplicate team', async () => {
    const res = await post('/api/matches', {
      name: 'match 1',
      team1: teamIds1[0],
      team2: teamIds1[0],
      overs: 4,
    }, token1);

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
      const res = await post('/api/matches', dumpedMatchInfo, token1);

      res.should.have.status(400);
      res.body.err.map((e) => e.param).should.contain(`umpire${i + 1}`)
        .and.contain(`umpire${j + 1}`);
    }
  });

  async function testCreateMatch(token, matchData) {
    const res = await post('/api/matches', matchData, token);
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
    const res = await post('/api/matches', {
      name: 'match 1',
      team1: teamIds1[0],
      team2: teamIds1[1],
      overs: 4,
    }, token1);

    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.contain('name');
  });

  it('should create match with same name but different user', async () => {
    await testCreateMatch(token2, {
      name: 'match 1',
      team1: teamIds2[0],
      team2: teamIds2[1],
      overs: 4,
    });
  });

  it('should not create match with teams of other user', async () => {
    const res = await post('/api/matches', {
      name: 'match 2',
      team1: teamIds1[0],
      team2: teamIds1[1],
      overs: 4,
    }, token2);

    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.contain('team1')
      .and.contain('team2');
  });

  it('should not create match with umpires of other user', async () => {
    const res = await post('/api/matches', {
      name: 'match 2',
      team1: teamIds2[0],
      team2: teamIds2[1],
      umpire1: umpireIds1[0],
      umpire2: umpireIds1[1],
      umpire3: umpireIds1[2],
      overs: 4,
    }, token2);

    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.have.members(['umpire1', 'umpire2', 'umpire3']);
  });

  it('should not get match list without authorization', async () => {
    const res = await get('/api/matches');
    res.should.have.status(401);
  });

  it('should get matches of only authenticated user', async () => {
    const res = await get('/api/matches', token1);
    res.should.have.status(200);
    const matches = res.body;
    matches.should.be.an('array').with.length(3);
  });

  it('should not get tag list without authentication', async () => {
    const res = await get('/api/matches/tags');
    res.should.have.status(401);
  });

  it('should get tags of only authenticated user', async () => {
    let res = await get('/api/matches/tags', token1);

    res.should.have.status(200);
    let tags = res.body;
    tags.should.be.an('array').with.ordered.members(['abc', 'efg', 'hij']);

    res = await get('/api/matches/tags', token2);

    res.should.have.status(200);
    tags = res.body;
    tags.should.be.an('array').with.length(0);
  });

  it('should not update a match without authentication', async () => {
    const res = await put(`/api/matches/${matchId1}`, {name: 'match 3'});
    res.should.have.status(401);
  });

  it('should not update a match of other user', async () => {
    const res = await put(`/api/matches/${matchId1}`, {
      name: 'match 4',
      team1: teamIds2[0],
      team2: teamIds2[1],
      overs: 4,
    }, token2);
    res.should.have.status(404);
  });

  it('should not update match with teams of other user', async () => {
    const res = await put(`/api/matches/${matchId1}`, {
      name: 'match 4',
      team1: teamIds2[0],
      team2: teamIds2[1],
      overs: 4,
    }, token1);

    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.have.members(['team1', 'team2']);
  });

  it('should not update match with umpires of other user', async () => {
    const res = await put(`/api/matches/${matchId1}`, {
      name: 'match 4',
      team1: teamIds1[0],
      team2: teamIds1[1],
      umpire1: umpireIds2[0],
      umpire2: umpireIds2[2],
      umpire3: umpireIds2[1],
      overs: 4,
    }, token1);

    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.have.members(['umpire1', 'umpire2', 'umpire3']);
  });

  it('should successfully update the match', async () => {
    const res = await put(`/api/matches/${matchId1}`, {
      name: 'match 4',
      team1: teamIds1[1],
      team2: teamIds1[2],
      umpire1: umpireIds1[1],
      umpire2: umpireIds1[2],
      umpire3: umpireIds1[0],
      overs: 40,
      tags: ['hij', 'klm'],
    }, token1);

    res.should.have.status(200);
  });

  it('should get proper data for match after update', async () => {
    const res = await get(`/api/matches/${matchId1}`, token1);
    res.should.have.status(200);
    const match = res.body;
    match.name.should.be.equals('Match 4');
    match.team1.name.should.be.equals('Team1');
    match.team2.name.should.be.equals('Team2');
    match.umpire1.name.should.be.equals('Umpire1');
    match.umpire2.name.should.be.equals('Umpire2');
    match.umpire3.name.should.be.equals('Umpire0');
    match.overs.should.be.equals(40);
  });

  it('should not delete match of other user', async () => {
    const res = await destroy(`/api/matches/${matchId1}`, token2);
    res.should.have.status(404);
  });

  it('should not delete match of other user', async () => {
    const res = await destroy(`/api/matches/${matchId1}`, token1);
    res.should.have.status(200);
    res.body.message.should.match(/match 4/i);
  });

  after(tearDown);
});
