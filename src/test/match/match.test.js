const {
  describe, before, it, after,
} = require('mocha');
const chai = require('chai');
const chaiHttp = require('chai-http');

chai.should();

process.env.IS_TEST = true;
const app = require('../../app');
const {
  startUp, tearDown,
} = require('./_helpers');

chai.use(chaiHttp);

describe('Test Match Functionality', function matchTestSuit() {
  this.timeout(10000);
  let token1;
  let token2;
  let playerIds;
  let teamIds1;
  let matchId1;
  let matchId2;

  before(async () => {
    ({
      token1, token2, playerIds1: playerIds, teamIds1,
    } = await startUp());
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
      team1Players: playerIds.slice(0, 3),
      team2Players: playerIds.slice(3),
    };

    const res = await chai.request(app)
      .put(`/api/matches/${matchId1}/begin`)
      .set('Authorization', `Bearer ${token1}`)
      .send(matchBeginPayload);

    res.should.have.status(200);
    res.body.match.state.should.be.equal('toss');
  });

  async function testMatch1DataIntegrity(afterToss = false, state = 'toss') {
    const res = await chai.request(app)
      .get(`/api/matches/${matchId1}`)
      .set('Authorization', `Bearer ${token1}`)
      .send();

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

  it('should have proper data for toss state', async () => {
    await testMatch1DataIntegrity();
  });

  it('should not add bowl in toss state', async () => {
    const bowlPayload = {
      playedBy: 0,
      singles: 1,
    };

    const res = await chai.request(app)
      .post(`/api/matches/${matchId1}/bowl`)
      .set('Authorization', `Bearer ${token1}`)
      .send(bowlPayload);

    res.should.have.status(400);
    res.body.err[0].msg.should.match(/Cannot add bowl in state toss/i);
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

  /**
   * playerIds[3:6] are batting team
   * playerIds[0:3] are bowling team
   */

  it('should not add bowl before adding an over', async () => {
    const bowlPayload = {
      playedBy: 0,
      singles: 1,
    };

    const res = await chai.request(app)
      .post(`/api/matches/${matchId1}/bowl`)
      .set('Authorization', `Bearer ${token1}`)
      .send(bowlPayload);

    res.should.have.status(400);
    res.body.err[0].msg.should.match(/Cannot add bowl before adding over/i);
  });

  it('should not add an over without `bowledBy`', async () => {
    for (const bowledBy of [null, -1, 'spd']) {
      const res = await chai.request(app)
        .post(`/api/matches/${matchId1}/over`)
        .set('Authorization', `Bearer ${token1}`)
        .send({bowledBy});

      res.should.have.status(400);
      res.body.err[0].param.should.be.equals('bowledBy');
    }
  });

  it('should not add an over to match of other user', async () => {
    const res = await chai.request(app)
      .post(`/api/matches/${matchId1}/over`)
      .set('Authorization', `Bearer ${token2}`)
      .send({bowledBy: 0});

    res.should.have.status(404);
  });

  async function testAddNewOver() {
    const res = await chai.request(app)
      .post(`/api/matches/${matchId1}/over`)
      .set('Authorization', `Bearer ${token1}`)
      .send({bowledBy: 0});

    res.should.have.status(201);
  }

  it('should add an over to match', async () => {
    await testAddNewOver();
  });

  it('should not add bowl to match of other user', async () => {
    const bowlPayload = {
      playedBy: 0,
      singles: 1,
    };

    const res = await chai.request(app)
      .post(`/api/matches/${matchId1}/bowl`)
      .set('Authorization', `Bearer ${token2}`)
      .send(bowlPayload);

    res.should.have.status(404);
  });

  it('should not add a bowl without `playedBy` value', async () => {
    const bowlPayload = {
      singles: 1,
    };

    let res = null;

    async function makeRequest() {
      res = await chai.request(app)
        .post(`/api/matches/${matchId1}/bowl`)
        .set('Authorization', `Bearer ${token1}`)
        .send(bowlPayload);
    }

    await makeRequest();
    res.should.have.status(400);
    res.body.err[0].param.should.be.equals('playedBy');

    bowlPayload.playedBy = null;
    await makeRequest();
    res.should.have.status(400);
    res.body.err[0].param.should.be.equals('playedBy');
  });

  async function testMutateBowl(payload, addBowl) {
    /* eslint-disable no-param-reassign */
    let errorParams;
    for (const singles of ['spd', -1]) {
      payload.singles = singles;
      errorParams = await addBowl();
      errorParams.should.have.members(['singles']);
    }

    payload.singles = 1;
    payload.legBy = 1;
    errorParams = await addBowl();
    errorParams.should.have.members(['singles']);

    delete payload.legBy;
    payload.boundary = {
      run: 4,
    };
    for (const boundaryKind of ['regular', 'legBy']) {
      payload.boundary.kind = boundaryKind;
      errorParams = await addBowl();
      errorParams.should.have.members(['singles']);
    }

    /* payload = {
      playedBy: 0,
      singles: 1,
      isWide: true,
    }; */
    delete payload.boundary;
    payload.isWide = true;
    errorParams = await addBowl();
    errorParams.should.have.members(['singles']);

    /* payload = {playedBy: 0}; */
    delete payload.singles;
    delete payload.isWide;
    for (const by of ['spd', -1]) {
      payload.by = by;
      errorParams = await addBowl();
      errorParams.should.have.members(['by']);
    }

    /* payload = {playedBy: 0}; */
    delete payload.by;
    for (const legBy of ['spd', -1]) {
      payload.legBy = legBy;
      errorParams = await addBowl();
      errorParams.should.have.members(['legBy']);
    }

    payload.legBy = 1;
    payload.isWide = true;
    errorParams = await addBowl();
    errorParams.should.have.members(['legBy']);

    /* payload = {
      playedBy: 0,
      legBy: 1,
      boundary: {
        run: 4,
      },
    }; */
    delete payload.isWide;
    payload.boundary = {
      run: 4,
    };
    for (const boundaryKind of ['regular', 'legBy']) {
      payload.boundary.kind = boundaryKind;
      errorParams = await addBowl();
      errorParams.should.have.members(['legBy']);
    }

    /* payload = {
      playedBy: 0,
      isWide: true,
      boundary: {
        run: 4,
      },
    }; */
    delete payload.legBy;
    payload.isWide = true;
    for (const boundaryKind of ['regular', 'legBy']) {
      payload.boundary.kind = boundaryKind;
      errorParams = await addBowl();
      errorParams.should.have.members(['boundary']);
    }

    /* payload = {
      playedBy: 0,
      isNo: true,
    }; */
    delete payload.boundary;
    delete payload.isWide;
    payload.isNo = true;
    errorParams = await addBowl();
    errorParams.should.have.members(['isNo']);
  }

  it('should not add bowl with invalid combination of values', async () => {
    const payload = {
      playedBy: 0,
      singles: 'spd',
    };
    const addBowl = async () => {
      const res = await chai.request(app)
        .post(`/api/matches/${matchId1}/bowl`)
        .set('Authorization', `Bearer ${token1}`)
        .send(payload);
      res.should.have.status(400);
      return res.body.err.map((e) => e.param);
    };

    await testMutateBowl(payload, addBowl);
  });

  async function testWicketValidation(makeRequest, payload) {
    let res = await makeRequest();
    res.should.have.status(400);
    res.body.err[0].param.should.contain('isWicket');
    res.body.err[0].msg.should.match(/Wicket kind/i);

    for (const uncertainWicket of ['Run out', 'Obstructing the field']) {
      payload.isWicket.kind = uncertainWicket;
      res = await makeRequest();
      res.should.have.status(400);
      res.body.err[0].param.should.contain('isWicket');
      res.body.err[0].msg.should.match(new RegExp(uncertainWicket, 'i'));
      res.body.err[0].msg.should.match(/out player/i);
    }

    payload.isWicket.kind = 'Bold';
    payload.isWide = true;
    res = await makeRequest();
    res.should.have.status(400);
    res.body.err[0].param.should.contain('isWicket');
    res.body.err[0].msg.should.match(/bold/i);
    res.body.err[0].msg.should.match(/wide bowl/i);

    delete payload.isWide;
    payload.isNo = 'Overstepping';
    res = await makeRequest();
    res.should.have.status(400);
    res.body.err[0].param.should.contain('isWicket');
    res.body.err[0].msg.should.match(/bold/i);
    res.body.err[0].msg.should.match(/no bowl/i);

    /* payload = {
      playedBy: 0,
      isWicket: {
        kind: 'Bold',
      },
    }; */
    delete payload.isNo;

    let lastScoreType = null;
    for (const scoreType of ['singles', 'by', 'legBy']) {
      payload[scoreType] = 1;
      delete payload[lastScoreType];
      lastScoreType = scoreType;
      res = await makeRequest();
      res.should.have.status(400);
      res.body.err[0].param.should.contain('isWicket');
      res.body.err[0].msg.should.match(/bold/i);
      res.body.err[0].msg.should.match(/cannot take.*run/i);
    }

    /* payload = {
      playedBy: 0,
      isWicket: {
        kind: 'Bold',
      },
      boundary: {
        kind: 'regular',
        run: 4,
      },
    }; */
    delete payload.legBy;
    payload.boundary = {
      kind: 'regular',
      run: 4,
    };
    res = await makeRequest();
    res.should.have.status(400);
    res.body.err[0].param.should.contain('isWicket');
    res.body.err[0].msg.should.match(/wicket/i);
    res.body.err[0].msg.should.match(/boundary/i);
  }

  it('should not add bowl with invalid wicket', async () => {
    const payload = {
      playedBy: 0,
      isWicket: {
        kind: 1,
      },
    };

    const makeRequest = () => chai.request(app)
      .post(`/api/matches/${matchId1}/bowl`)
      .set('Authorization', `Bearer ${token1}`)
      .send(payload);

    await testWicketValidation(makeRequest, payload);
  });

  const over1Bowls = [{
    playedBy: 0,
    singles: 1,
  }, {
    playedBy: 0,
    singles: 1,
    by: 2,
  }, {
    playedBy: 0,
    by: 1,
    legBy: 2,
  }, {
    playedBy: 0,
    boundary: {
      kind: 'regular',
      run: 4,
    },
  }, {
    playedBy: 0,
    singles: 2,
    boundary: {
      kind: 'by',
      run: 4,
    },
  }, {
    playedBy: 0,
    isWicket: {
      kind: 'Bold',
    },
  }, {
    playedBy: 2,
    isWicket: {
      kind: 'Run out',
      player: 1,
    },
  }];
  const over2Bowls = [{
    playedBy: 2,
    singles: 1,
  }];
  it('should add several bowls to match', async () => {
    let payload;

    const makeRequest = async () => {
      const res = await chai.request(app)
        .post(`/api/matches/${matchId1}/bowl`)
        .set('Authorization', `Bearer ${token1}`)
        .send(payload);
      res.should.have.status(201);
      return res.body;
    };


    for (payload of over1Bowls) {
      await makeRequest();
    }

    await testAddNewOver();

    payload = over2Bowls[0];
    await makeRequest();
  });

  async function testMatch1DataIntegrityWithBowls(currentOver2Bowls, currentOver3Bowls = []) {
    const match1 = await testMatch1DataIntegrity(true, 'innings1');
    match1.innings1.overs[0].bowledBy.should.be.equals(0);
    match1.innings1.overs[1].bowledBy.should.be.equals(0);
    for (let i = 0; i < over1Bowls.length; i++) {
      const over1Bowl = over1Bowls[i];
      match1.innings1.overs[0].bowls[i].should.deep.include(over1Bowl);
    }
    for (let i = 0; i < currentOver2Bowls.length; i++) {
      const over2Bowl = currentOver2Bowls[i];
      match1.innings1.overs[1].bowls[i].should.deep.include(over2Bowl);
    }
    for (let i = 0; i < currentOver3Bowls.length; i++) {
      const over3Bowl = currentOver3Bowls[i];
      match1.innings1.overs[2].bowls[i].should.deep.include(over3Bowl);
    }
  }

  it('should have proper data in innings1 state', async () => {
    await testMatch1DataIntegrityWithBowls(over2Bowls);
  });

  it('should not update bowl with invalid combination of values', async () => {
    const payload = {
      playedBy: 0,
      singles: 'spd',
    };
    const addBowl = async () => {
      const res = await chai.request(app)
        .put(`/api/matches/${matchId1}/bowl`)
        .set('Authorization', `Bearer ${token1}`)
        .send(payload);
      res.should.have.status(400);
      return res.body.err.map((e) => e.param);
    };

    await testMutateBowl(payload, addBowl);
  });

  it('should not update bowl of other user', async () => {
    const bowlPayload = {
      playedBy: 0,
      singles: 1,
    };

    const res = await chai.request(app)
      .put(`/api/matches/${matchId1}/bowl`)
      .set('Authorization', `Bearer ${token2}`)
      .send(bowlPayload);

    res.should.have.status(404);
  });

  it('should update a bowl without `playedBy` value', async () => {
    const bowlPayload = {
      singles: 1,
    };

    let res = null;

    async function makeRequest() {
      res = await chai.request(app)
        .put(`/api/matches/${matchId1}/bowl`)
        .set('Authorization', `Bearer ${token1}`)
        .send(bowlPayload);
    }

    await makeRequest();
    res.should.have.status(200);

    bowlPayload.playedBy = null;
    await makeRequest();
    res.should.have.status(400);
    res.body.err[0].param.should.be.equals('playedBy');
  });

  it('should have proper data in innings1 state', async () => {
    await testMatch1DataIntegrityWithBowls([{
      playedBy: over2Bowls[0].playedBy,
      singles: 1,
    }]);
  });

  it('should not update bowl with invalid wicket', async () => {
    const payload = {
      playedBy: 0,
      isWicket: {
        kind: 1,
      },
    };

    const makeRequest = () => chai.request(app)
      .put(`/api/matches/${matchId1}/bowl`)
      .set('Authorization', `Bearer ${token1}`)
      .send(payload);

    await testWicketValidation(makeRequest, payload);
  });

  const bowlUpdatePayloads = [{
    singles: 1,
  }, {
    singles: 1,
    by: 2,
  }, {
    by: 1,
    legBy: 2,
  }, {
    boundary: {
      kind: 'regular',
      run: 4,
    },
  }, {
    singles: 2,
    boundary: {
      kind: 'by',
      run: 4,
    },
  }, {
    isWicket: {
      kind: 'Bold',
    },
  }, {
    isWicket: {
      kind: 'Run out',
      player: 1,
    },
  }];
  it('should update bowl without `overNo` and `bowlNo`', async () => {
    let payload;

    const makeRequest = async () => {
      const res = await chai.request(app)
        .put(`/api/matches/${matchId1}/bowl`)
        .set('Authorization', `Bearer ${token1}`)
        .send(payload);
      res.should.have.status(200);
      return res.body;
    };

    for (payload of bowlUpdatePayloads) {
      await makeRequest();
    }
  });

  it('should not update bowl with invalid `overNo` and `bowlNo`', async () => {
    let payload;

    const makeRequest = async (overNo, bowlNo) => {
      const res = await chai.request(app)
        .put(`/api/matches/${matchId1}/bowl`)
        .set('Authorization', `Bearer ${token1}`)
        .send(payload);
      res.should.have.status(400);
      const errorParams = res.body.err.map((e) => e.param);
      if (overNo < 0) {
        errorParams.should.contain('overNo');
        res.body.err.find((e) => e.param === 'overNo').msg.should.match(/non.?negative/i);
      }
      if (bowlNo < 0) {
        errorParams.should.contain('bowlNo');
        res.body.err.find((e) => e.param === 'bowlNo').msg.should.match(/non.?negative/i);
      }
      if (overNo < 0 || bowlNo < 0) {
        return;
      }
      res.body.err[0].should.contain({param: 'bowlNo', value: bowlNo, overNo});
      res.body.err[0].msg.should.match(new RegExp(`over.*${overNo}.*bowl.*${bowlNo}`, 'i'));
    };

    for (const [overNo, bowlNo] of [[1, 1], [0, 7], [-1, 0], [0, -1]]) {
      payload = {
        singles: 1,
        overNo,
        bowlNo,
      };
      await makeRequest(overNo, bowlNo);
    }
  });

  it('should update bowl with `overNo` and `bowlNo`', async () => {
    let payload;

    const makeRequest = async () => {
      const res = await chai.request(app)
        .put(`/api/matches/${matchId1}/bowl`)
        .set('Authorization', `Bearer ${token1}`)
        .send(payload);
      res.should.have.status(200);
      return res.body;
    };

    for (payload of bowlUpdatePayloads) {
      payload = {
        ...payload,
        overNo: 1,
        bowlNo: 0,
      };
      await makeRequest();
    }
  });

  it('should not update bowl when last over is empty', async () => {
    await testAddNewOver();

    const payload = {
      singles: 1,
    };
    const res = await chai.request(app)
      .put(`/api/matches/${matchId1}/bowl`)
      .set('Authorization', `Bearer ${token1}`)
      .send(payload);
    res.should.have.status(400);
    res.body.err[0].should.contain({param: 'bowlNo', value: -1});
  });

  it('should add by runs', async () => {
    // new bowl will be added on over: 2, bowl: 0
    let payload = {
      playedBy: 2,
      singles: 1,
    };
    const addBowl = () => chai.request(app)
      .post(`/api/matches/${matchId1}/bowl`)
      .set('Authorization', `Bearer ${token1}`)
      .send(payload);

    for (let i = 0; i < 4; i++) {
      await addBowl();
    }

    payload = {run: 2};
    const addByRun = async () => {
      const _res = await chai.request(app)
        .put(`/api/matches/${matchId1}/by`)
        .set('Authorization', `Bearer ${token1}`)
        .send(payload);
      _res.should.have.status(200);
      return _res.body;
    };

    const byRunResponse = await addByRun();
    byRunResponse.should.deep.contain({innings: 'innings1', overIndex: 2, bowlIndex: 3});
    byRunResponse.bowl.should.contain({playedBy: 2, singles: 1, by: 2});

    payload = {run: 4, boundary: true};
    const byBoundaryResponse = await addByRun();
    byBoundaryResponse.should.deep.contain({innings: 'innings1', overIndex: 2, bowlIndex: 3});
    byBoundaryResponse.bowl.should.deep.contain({
      playedBy: 2,
      singles: 1,
      by: 2,
      boundary: {
        kind: 'by',
        run: 4,
      },
    });

    payload = {run: 4, overNo: 2, bowlNo: 0};
    const byBoundaryResponseWithIndices = await addByRun();
    byBoundaryResponseWithIndices.should.deep.contain({innings: 'innings1', overIndex: 2, bowlIndex: 0});
    byBoundaryResponseWithIndices.bowl.should.deep.contain({
      playedBy: 2,
      singles: 1,
      by: 4,
    });
  });

  it('should not add uncertain wickets without necessary values', async () => {
    const payload = {
      batsman: 2,
      kind: 'Run out',
    };
    for (const payloadKey in payload) {
      const res = await chai.request(app)
        .put(`/api/matches/${matchId1}/uncertain-out`)
        .set('Authorization', `Bearer ${token1}`)
        .send({...payload, [payloadKey]: undefined});
      res.should.have.status(400);
      res.body.err[0].param.should.be.equals(payloadKey);
    }
    const res = await chai.request(app)
      .put(`/api/matches/${matchId1}/uncertain-out`)
      .set('Authorization', `Bearer ${token1}`)
      .send({...payload, kind: 'Bold'});
    res.should.have.status(400);
    res.body.err[0].param.should.be.equals('kind');
  });

  it('should add uncertain wickets', async () => {
    let payload;
    const addUncertainWicket = async () => {
      const _res = await chai.request(app)
        .put(`/api/matches/${matchId1}/uncertain-out`)
        .set('Authorization', `Bearer ${token1}`)
        .send(payload);
      _res.should.have.status(200);
      return _res.body;
    };

    payload = {
      batsman: 2,
      kind: 'Run out',
    };
    let responseBody = await addUncertainWicket();
    responseBody.should.deep.contain({innings: 'innings1', overIndex: 2, bowlIndex: 3});
    responseBody.bowl.should.deep.contain({
      isWicket: {player: 2, kind: 'Run out'},
      playedBy: 2,
      singles: 1,
      by: 2,
      boundary: {kind: 'by', run: 4},
    });

    payload = {
      batsman: 1,
      kind: 'Run out',
      overNo: 2,
      bowlNo: 1,
    };
    responseBody = await addUncertainWicket();
    responseBody.should.deep.contain({innings: 'innings1', overIndex: 2, bowlIndex: 1});
    responseBody.bowl.should.deep.contain({
      isWicket: {player: 1, kind: 'Run out'},
      playedBy: 2,
      singles: 1,
    });
  });

  it('should have proper data after updating bowls', async () => {
    const currentOver2Bowls = [{
      playedBy: over2Bowls[0].playedBy,
      singles: 0, // caused by last iteration of test - should update bowl with `overNo` and `bowlNo`
      by: 0,
      legBy: 0,
    }];
    const currentOver3Bowls = [{
      playedBy: 2,
      singles: 1,
      by: 4,
      legBy: 0,
    }, {
      isWicket: {player: 1, kind: 'Run out'},
      playedBy: 2,
      singles: 1,
      by: 0,
      legBy: 0,
    }, {
      playedBy: 2,
      singles: 1,
      by: 0,
      legBy: 0,
    }, {
      playedBy: 2,
      singles: 1,
      by: 2,
      boundary: {
        kind: 'by',
        run: 4,
      },
    }];
    await testMatch1DataIntegrityWithBowls(currentOver2Bowls, currentOver3Bowls);
  });

  after(tearDown);
});
