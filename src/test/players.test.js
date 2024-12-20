const { describe, before, it, after } = require('mocha');
const chai = require('chai');
const { put, destroy, post, tearDown } = require('./_helpers');

const { namify } = require('../lib/utils');

chai.should();

describe('Test Player Functionality', function playerTestSuit() {
  this.timeout(10000);
  let token1;
  let token2;
  let playerId;

  before(async () => {
    await post('/api/auth/register', {
      username: 'username',
      password: '1234',
      confirm: '1234',
    });
    const res = await post('/api/auth/login', {
      username: 'username',
      password: '1234',
    });
    token1 = res.body.token;
  });

  it('should not create a player without authentication', async () => {
    const res = await post('/api/players', {
      name: 'player',
      jerseyNo: 1,
    });
    res.should.have.status(401);
  });

  it('should not create a player without values', async () => {
    const playerInfo = {
      name: 'player',
      jerseyNo: 1,
    };

    for (const key in playerInfo) {
      const dumpedPlayerInfo = { ...playerInfo, [key]: undefined };
      const res = await post('/api/players', dumpedPlayerInfo, token1);

      res.should.have.status(400);
      res.body.err.map((e) => e.param).should.contain(key);
    }

    for (const jerseyNo of [-1, 1000]) {
      const res = await post('/api/players', { jerseyNo }, token1);
      res.should.have.status(400);
      res.body.err
        .map((e) => e.param)
        .should.contain('jerseyNo')
        .and.contain('name');
    }
  });
  async function testCreatePlayer(token) {
    const res = await post(
      '/api/players',
      {
        name: 'player',
        jerseyNo: 1,
      },
      token
    );
    res.should.have.status(201);
    const { player } = res.body;
    player.name.should.be.equals('Player'); // name is auto-capitalized
    player.jerseyNo.should.be.equals(1);
    player.should.have.property('_id');
    return player._id;
  }

  it('should successfully create a player', async () => {
    playerId = await testCreatePlayer(token1);
  });

  it('should not create a duplicate player', async () => {
    let res = await post(
      '/api/players',
      {
        name: 'player',
        jerseyNo: 2,
      },
      token1
    );
    res.should.have.status(400);
    res.body.err
      .map((e) => e.param)
      .should.contain('name')
      .and.not.contain('jerseyNo');

    res = await post(
      '/api/players',
      {
        name: 'player2',
        jerseyNo: 1,
      },
      token1
    );
    res.should.have.status(400);
    res.body.err
      .map((e) => e.param)
      .should.contain('jerseyNo')
      .and.not.contain('name');
  });
  it('should create a player by different user', async () => {
    await post('/api/auth/register', {
      username: 'username2',
      password: '1234',
      confirm: '1234',
    });
    const loginRes = await post('/api/auth/login', {
      username: 'username2',
      password: '1234',
    });
    token2 = loginRes.body.token;

    await testCreatePlayer(token2);
  });

  it('should not edit a player of another user', async () => {
    const res = await put(
      `/api/players/${playerId}`,
      {
        name: 'player3',
        jerseyNo: 3,
      },
      token2
    );
    res.should.have.status(404);
  });

  async function testEditPlayer(playerObject) {
    const res = await put(`/api/players/${playerId}`, playerObject, token1);
    res.should.have.status(200);
    const { player } = res.body;
    player.name.should.be.equals(namify(playerObject.name)); // name is auto-capitalized
    player.jerseyNo.should.be.equals(playerObject.jerseyNo);
    player.should.have.property('_id');
  }

  it('should edit a player without a change', async () => {
    await testEditPlayer({
      name: 'player',
      jerseyNo: 1,
    });
  });

  it('should edit a player', async () => {
    await testEditPlayer({
      name: 'player3',
      jerseyNo: 3,
    });
  });

  it('should not delete player of another user', async () => {
    const res = await destroy(`/api/players/${playerId}`, token2);
    res.should.have.status(404);
  });

  it('should not delete with invalid mongo id', async () => {
    const res = await destroy('/api/players/abc', token2);
    res.should.have.status(400);
  });

  it('should delete a player', async () => {
    const res = await destroy(`/api/players/${playerId}`, token1);
    res.should.have.status(200);
  });

  after(tearDown);
});
