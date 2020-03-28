/**
 * Parvez M Robin
 * this@parvezmrobin.com
 * Mar 29, 2020
 */

const {
  describe, before, it, after,
} = require('mocha');
const chai = require('chai');
const {startUp, testBasicDataIntegrity} = require('./_matchHelpers');
const {post, put, tearDown} = require('../_helpers');

chai.should();

describe('Test Match Begin & Test Functionality', function matchBeginTestSuit() {
  this.timeout(10000);

  let token1;
  let token2;
  let playerIds1;
  let umpireIds1;
  let umpireIds2;
  let teamIds1;
  let teamIds2;
  let matchId1;
  let matchId2;

  before(async () => {
    ({
      token1, token2, playerIds1, teamIds1, teamIds2, umpireIds1, umpireIds2,
    } = await startUp());
    let res = await post('/api/matches/', {
      name: 'match 1',
      team1: teamIds1[0],
      team2: teamIds1[1],
      umpire1: umpireIds1[0],
      umpire2: umpireIds1[1],
      umpire3: umpireIds1[2],
      overs: 4,
    }, token1);
    matchId1 = res.body.match._id;
    res = await post('/api/matches/', {
      name: 'match 1',
      team1: teamIds2[0],
      team2: teamIds2[1],
      umpire1: umpireIds2[0],
      umpire2: umpireIds2[1],
      umpire3: umpireIds2[2],
      overs: 4,
    }, token2);
    matchId2 = res.body.match._id;
  });

  it('should not begin match without any required value', async () => {
    const matchBeginPayload = {
      team1Captain: playerIds1[0],
      team2Captain: playerIds1[2],
      team1Players: playerIds1.slice(0, 2),
      team2Players: playerIds1.slice(2),
    };

    for (const key in matchBeginPayload) {
      const payload = {...matchBeginPayload, [key]: null};
      const res = await put(`/api/matches/${matchId1}/begin`, payload, token1);

      res.should.have.status(400);
      res.body.err.map((e) => e.param).should.contain(key);
    }
  });

  async function shouldHaveTeam1CaptainError(matchBeginPayload) {
    const res = await put(`/api/matches/${matchId1}/begin`, matchBeginPayload, token1);

    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.contain('team1Captain');
  }

  async function shouldHaveTeam2CaptainError(matchBeginPayload) {
    const res = await put(`/api/matches/${matchId1}/begin`, matchBeginPayload, token1);

    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.contain('team2Captain');
  }

  it('should not start match without sufficient player', async () => {
    const matchBeginPayload = {
      team1Captain: playerIds1[0],
      team2Captain: playerIds1[4],
      team1Players: playerIds1.slice(0, 1),
      team2Players: playerIds1.slice(2),
    };

    // for front-end implementation, the error is passed for param `team1Captain` instead of `team1Players`
    await shouldHaveTeam1CaptainError(matchBeginPayload);

    matchBeginPayload.team1Players = playerIds1.slice(0, 2);
    matchBeginPayload.team2Players = playerIds1.slice(5);
    // for front-end implementation, the error is passed for param `team2Captain` instead of `team2Players`
    await shouldHaveTeam2CaptainError(matchBeginPayload);
  });

  it('should not begin match with captain outside of team', async () => {
    const matchBeginPayload = {
      team1Captain: playerIds1[0],
      team2Captain: playerIds1[4],
      team1Players: playerIds1.slice(1, 3),
      team2Players: playerIds1.slice(4, 6),
    };
    await shouldHaveTeam1CaptainError(matchBeginPayload);

    matchBeginPayload.team2Captain = playerIds1[3];
    await shouldHaveTeam2CaptainError(matchBeginPayload);
  });

  it("should not start other user's match", async () => {
    const matchBeginPayload = {
      team1Captain: playerIds1[0],
      team2Captain: playerIds1[3],
      team1Players: playerIds1.slice(0, 2),
      team2Players: playerIds1.slice(3),
    };

    const res = await put(`/api/matches/${matchId2}/begin`, matchBeginPayload, token1);

    res.should.have.status(404);
  });

  it('should not begin match with players of other user', async () => {
    const matchBeginPayload = {
      team1Captain: playerIds1[0],
      team2Captain: playerIds1[3],
      team1Players: playerIds1.slice(0, 2),
      team2Players: playerIds1.slice(3),
    };

    const res = await put(`/api/matches/${matchId1}/begin`, matchBeginPayload, token2);

    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.have.members(['team1Players', 'team2Players']);
  });

  it('should begin match', async () => {
    const matchBeginPayload = {
      team1Captain: playerIds1[0],
      team2Captain: playerIds1[3],
      team1Players: playerIds1.slice(0, 3),
      team2Players: playerIds1.slice(3),
    };

    const res = await put(`/api/matches/${matchId1}/begin`, matchBeginPayload, token1);

    res.should.have.status(200);
    res.body.match.state.should.be.equal('toss');
  });

  it('should have proper data for toss state', async () => {
    await testBasicDataIntegrity(matchId1, token1);
  });

  it('should not add bowl in toss state', async () => {
    const bowlPayload = {
      playedBy: 0,
      singles: 1,
    };

    const res = await post(`/api/matches/${matchId1}/bowl`, bowlPayload, token1);
    res.should.have.status(400);
    res.body.err[0].msg.should.match(/Cannot add bowl in state toss/i);
  });

  it('should not toss a match of other user', async () => {
    const tossPayload = {
      won: teamIds1[0],
      choice: 'Bat',
    };

    const res = await put(`/api/matches/${matchId1}/toss`, tossPayload, token2);
    res.should.have.status(404);
  });

  it('should not toss a match with invalid value', async () => {
    const tossPayload = {
      won: teamIds1[0],
      choice: 'Bat',
    };

    for (const key in tossPayload) {
      const dumpedPayload = {...tossPayload, [key]: null};

      const res = await put(`/api/matches/${matchId1}/toss`, dumpedPayload, token1);

      res.should.have.status(400);
      res.body.err.map((e) => e.param).should.have.members([key]);
    }

    let res = await put(`/api/matches/${matchId1}/toss`, {...tossPayload, won: teamIds1[2]}, token1);
    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.have.members(['won']);

    res = await put(`/api/matches/${matchId1}/toss`, {...tossPayload, choice: 'None'}, token1);

    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.have.members(['choice']);
  });

  it('should toss a match', async () => {
    const tossPayload = {
      won: teamIds1[0],
      choice: 'Bowl',
    };

    const res = await put(`/api/matches/${matchId1}/toss`, tossPayload, token1);

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

    const res = await put(`/api/matches/${matchId1}/toss`, tossPayload, token1);
    res.should.have.status(404);
  });

  it('should have proper data for innings1 state', async () => {
    await testBasicDataIntegrity(matchId1, token1, true, 'innings1');
  });

  after(tearDown);
});
