const { describe } = require('mocha');
const chai = require('chai');
const chaiHttp = require('chai-http');
chai.should();
process.env.IS_TEST = true;
const app = require('../app');
const User = require('../models/user');
const Player = require('../models/player');
const {namify} = require('../lib/utils');
chai.use(chaiHttp);

describe('Test Player Functionality', function playerTestSuit() {
  this.timeout(10000);
  let token, token2;
  let playerId, player2Id;

  before(async function () {
    await chai.request(app)
      .post('/api/auth/register')
      .send({
        username: 'username',
        password: '1234',
        confirm: '1234',
      });
    const res = await chai.request(app)
      .post('/api/auth/login')
      .send({
        username: 'username',
        password: '1234',
      });
    token = res.body.token;
  });

  it('should not create a player without authentication', async function () {
    const res = await chai.request(app)
      .post('/api/players')
      .send({
        name: 'player',
        jerseyNo: 1,
      });

    res.should.have.status(401);
  });

  it('should not create a player without values', async function () {
    let res = await chai.request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    res.should.have.status(400);
    res.body.err.map(e => e.param).should.contain('name')
      .and.contain('jerseyNo');

    res = await chai.request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${token}`)
      .send({name: 'player'});
    res.should.have.status(400);
    res.body.err.map(e => e.param).should.contain('jerseyNo')
      .and.not.contain('name');

    res = await chai.request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${token}`)
      .send({jerseyNo: 0});
    res.should.have.status(400);
    res.body.err.map(e => e.param).should.contain('name')
      .and.not.contain('jerseyNo');

    for (const jerseyNo of [-1, 1000]) {
      res = await chai.request(app)
        .post('/api/players')
        .set('Authorization', `Bearer ${token}`)
        .send({jerseyNo});
      res.should.have.status(400);
      res.body.err.map(e => e.param).should.contain('jerseyNo')
        .and.contain('name');
    }
  });

  async function testCreatePlayer(token) {
    const res = await chai.request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'player',
        jerseyNo: 1,
      });
    res.should.have.status(201);
    const player = res.body.player;
    player.name.should.be.equals('Player'); // name is auto-capitalized
    player.jerseyNo.should.be.equals(1);
    player.should.have.property('_id');
    return player._id;
  }

  it('should successfully create a player', async function () {
    playerId = await testCreatePlayer(token);
  });

  it('should not create a duplicate player', async function () {
    let res = await chai.request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'player',
        jerseyNo: 2,
      });
    res.should.have.status(400);
    res.body.err.map(e => e.param).should.contain('name')
      .and.not.contain('jerseyNo');

    res = await chai.request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'player2',
        jerseyNo: 1,
      });
    res.should.have.status(400);
    res.body.err.map(e => e.param).should.contain('jerseyNo')
      .and.not.contain('name');
  });

  it('should create a player by different user', async function () {
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

    player2Id = await testCreatePlayer(token2);
  });

  it('should not edit a player of another user', async function () {
    const res = await chai.request(app)
      .put(`/api/players/${playerId}`)
      .set('Authorization', `Bearer ${token2}`)
      .send({
        name: 'player3',
        jerseyNo: 3,
      });
    res.should.have.status(404);
  });

  async function testEditPlayer(playerObject) {
    const res = await chai.request(app)
      .put(`/api/players/${playerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(playerObject);
    res.should.have.status(200);
    const player = res.body.player;
    player.name.should.be.equals(namify(playerObject.name)); // name is auto-capitalized
    player.jerseyNo.should.be.equals(playerObject.jerseyNo);
    player.should.have.property('_id');
  }

  it('should edit a player without a change', async function () {
    await testEditPlayer({
      name: 'player',
      jerseyNo: 1,
    });
  });

  it('should edit a player', async function () {
    await testEditPlayer({
      name: 'player3',
      jerseyNo: 3,
    });
  });

  it('should not delete player of another user', async function () {
    const res = await chai.request(app)
      .delete(`/api/players/${playerId}`)
      .set('Authorization', `Bearer ${token2}`)
      .send();
    res.should.have.status(404);
  });

  it('should not delete with invalid mongo id', async function () {
    const res = await chai.request(app)
      .delete(`/api/players/abc`)
      .set('Authorization', `Bearer ${token2}`)
      .send();
    res.should.have.status(400);
  });

  it('should delete a player', async function () {
    const res = await chai.request(app)
      .delete(`/api/players/${playerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    res.should.have.status(200);
  });

  after(async function () {
    await Player.deleteMany({});
    await User.deleteMany({});
  });
});
