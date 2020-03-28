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

describe('Test Match Over & Bowl Functionality', function matchBowlTestSuit() {
  this.timeout(10000);

  let token1;
  let token2;
  let playerIds;
  let umpireIds;
  let teamIds;
  let matchId;

  before(async () => {
    ({
      token1, token2, playerIds1: playerIds, teamIds1: teamIds, umpireIds1: umpireIds,
    } = await startUp());

    // create match1
    const res = await post('/api/matches/', {
      name: 'match 1',
      team1: teamIds[0],
      team2: teamIds[1],
      umpire1: umpireIds[0],
      umpire2: umpireIds[1],
      umpire3: umpireIds[2],
      overs: 4,
    }, token1);
    matchId = res.body.match._id;

    // start match
    await put(`/api/matches/${matchId}/begin`, {
      team1Captain: playerIds[0],
      team2Captain: playerIds[3],
      team1Players: playerIds.slice(0, 3),
      team2Players: playerIds.slice(3),
    }, token1);

    // toss match
    await put(`/api/matches/${matchId}/toss`, {
      won: teamIds[0],
      choice: 'Bowl',
    }, token1);

    // match is not state innings1
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

    const res = await post(`/api/matches/${matchId}/bowl`, bowlPayload, token1);

    res.should.have.status(400);
    res.body.err[0].msg.should.match(/Cannot add bowl before adding over/i);
  });

  it('should not add an over without `bowledBy`', async () => {
    for (const bowledBy of [null, -1, 'spd']) {
      const res = await post(`/api/matches/${matchId}/over`, {bowledBy}, token1);
      res.should.have.status(400);
      res.body.err[0].param.should.be.equals('bowledBy');
    }
  });

  it('should not add an over to match of other user', async () => {
    const res = await post(`/api/matches/${matchId}/over`, {bowledBy: 0}, token2);

    res.should.have.status(404);
  });

  async function testAddNewOver() {
    const res = await post(`/api/matches/${matchId}/over`, {bowledBy: 0}, token1);

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

    const res = await post(`/api/matches/${matchId}/bowl`, bowlPayload, token2);

    res.should.have.status(404);
  });

  it('should not add a bowl without `playedBy` value', async () => {
    const bowlPayload = {
      singles: 1,
    };

    let res = null;

    async function makeRequest() {
      res = await post(`/api/matches/${matchId}/bowl`, bowlPayload, token1);
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
      const res = await post(`/api/matches/${matchId}/bowl`, payload, token1);
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

    const makeRequest = () => post(`/api/matches/${matchId}/bowl`, payload, token1);

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
      const res = await post(`/api/matches/${matchId}/bowl`, payload, token1);
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

  async function testMatch1DataIntegrityWithBowls(...overs) {
    const match1 = await testBasicDataIntegrity(matchId, token1, true, 'innings1');
    match1.innings1.overs[0].bowledBy.should.be.equals(0);
    match1.innings1.overs[1].bowledBy.should.be.equals(0);
    for (let o = 0; o < overs.length; o++) {
      const over = overs[o];
      for (let b = 0; b < over.length; b++) {
        const over1Bowl = over[b];
        match1.innings1.overs[o].bowls[b].should.deep.include(over1Bowl);
      }
    }
  }

  it('should have proper data in innings1 state', async () => {
    await testMatch1DataIntegrityWithBowls(over1Bowls, over2Bowls);
  });

  it('should not update bowl with invalid combination of values', async () => {
    const payload = {
      playedBy: 0,
      singles: 'spd',
    };
    const addBowl = async () => {
      const res = await put(`/api/matches/${matchId}/bowl`, payload, token1);
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

    const res = await put(`/api/matches/${matchId}/bowl`, bowlPayload, token2);

    res.should.have.status(404);
  });

  it('should update a bowl without `playedBy` value', async () => {
    const bowlPayload = {
      singles: 1,
    };

    let res = null;

    async function makeRequest() {
      res = await put(`/api/matches/${matchId}/bowl`, bowlPayload, token1);
    }

    await makeRequest();
    res.should.have.status(200);

    bowlPayload.playedBy = null;
    await makeRequest();
    res.should.have.status(400);
    res.body.err[0].param.should.be.equals('playedBy');
  });

  it('should have proper data in innings1 state', async () => {
    await testMatch1DataIntegrityWithBowls(over1Bowls, [{
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

    const makeRequest = () => put(`/api/matches/${matchId}/bowl`, payload, token1);

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
      const res = await put(`/api/matches/${matchId}/bowl`, payload, token1);
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
      const res = await put(`/api/matches/${matchId}/bowl`, payload, token1);
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
      const res = await put(`/api/matches/${matchId}/bowl`, payload, token1);
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
    const res = await put(`/api/matches/${matchId}/bowl`, payload, token1);
    res.should.have.status(400);
    res.body.err[0].should.contain({param: 'bowlNo', value: -1});
  });

  it('should add by runs', async () => {
    // new bowl will be added on over: 2, bowl: 0
    let payload = {
      playedBy: 2,
      singles: 1,
    };
    const addBowl = () => post(`/api/matches/${matchId}/bowl`, payload, token1);

    for (let i = 0; i < 4; i++) {
      await addBowl();
    }

    payload = {run: 2};
    const addByRun = async () => {
      const _res = await put(`/api/matches/${matchId}/by`, payload, token1);
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
      const res = await put(`/api/matches/${matchId}/uncertain-out`, {...payload, [payloadKey]: undefined}, token1);
      res.should.have.status(400);
      res.body.err[0].param.should.be.equals(payloadKey);
    }
    const res = await put(`/api/matches/${matchId}/uncertain-out`, {...payload, kind: 'Bold'}, token1);
    res.should.have.status(400);
    res.body.err[0].param.should.be.equals('kind');
  });

  it('should add uncertain wickets', async () => {
    let payload;
    const addUncertainWicket = async () => {
      const _res = await put(`/api/matches/${matchId}/uncertain-out`, payload, token1);
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
    await testMatch1DataIntegrityWithBowls(over1Bowls, currentOver2Bowls, currentOver3Bowls);
  });

  after(tearDown);
});
