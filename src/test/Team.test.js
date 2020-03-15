const { describe } = require('mocha');
const chai = require('chai');
const chaiHttp = require('chai-http');

chai.should();
process.env.IS_TEST = true;
const app = require('../app');
const User = require('../models/user');
const Team = require('../models/team');
const Player = require('../models/player');
const {namify} = require('../lib/utils');

chai.use(chaiHttp);

describe('Test Team Functionality', function teamTestSuit() {
  this.timeout(20000);
  let token1;
  let token2;
  let teamId;

  before(async () => {
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
    token1 = res.body.token;

  });

  it('should not create a team without authentication', async () => {
    const res = await chai.request(app)
      .post('/api/teams')
      .send({
        name: 'team',
        shortName: 'tea',
      });

    res.should.have.status(401);
  });

  it('should not create a team without values', async () => {
    let res = await chai.request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token1}`)
      .send({});
    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.contain('name')
      .and.contain('shortName');

    res = await chai.request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token1}`)
      .send({name: 'team'});
    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.contain('shortName')
      .and.not.contain('name');

    res = await chai.request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token1}`)
      .send({shortName: 'tea'});
    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.contain('name')
      .and.not.contain('shortName');

    res = await chai.request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        name: 'team',
        shortName: 't',
      });
    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.contain('shortName')
      .and.not.contain('name');
  });

  async function testCreateTeam(token) {
    const res = await chai.request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'team',
        shortName: 'tea',
      });
    res.should.have.status(201);
    const {team} = res.body;
    team.name.should.be.equals('Team'); // name is auto-capitalized
    team.shortName.should.be.equals('TEA'); // short name is auto-capitalized
    team.should.have.property('_id');
    return team._id;
  }

  it('should successfully create a team', async () => {
    teamId = await testCreateTeam(token1);
  });

  it('should not create a duplicate team', async () => {
    let res = await chai.request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        name: 'team',
        shortName: 'te',
      });
    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.contain('name')
      .and.not.contain('shortName');

    res = await chai.request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        name: 'team2',
        shortName: 'tea',
      });
    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.contain('shortName')
      .and.not.contain('name');
  });

  it('should create a team by different user', async () => {
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

    await testCreateTeam(token2);
  });

  it('should not edit a team of another user', async () => {
    const res = await chai.request(app)
      .put(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${token2}`)
      .send({
        name: 'team3',
        shortName: 'tea3',
      });
    res.should.have.status(404);
  });

  async function testEditTeam(teamObject) {
    const res = await chai.request(app)
      .put(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${token1}`)
      .send(teamObject);
    res.should.have.status(200);
    const {team} = res.body;
    team.name.should.be.equals(namify(teamObject.name)); // name is auto-capitalized
    team.shortName.should.be.equals(teamObject.shortName.toUpperCase());
    team.should.have.property('_id');
  }

  it('should edit a team without a change', async () => {
    await testEditTeam({
      name: 'team',
      shortName: 'tea',
    });
  });

  it('should edit a team', async () => {
    await testEditTeam({
      name: 'team3',
      shortName: 'TEA3',
    });
  });

  it('should not create a preset without name', async () => {
    const res = await chai.request(app)
      .post(`/api/teams/${teamId}/presets`)
      .set('Authorization', `Bearer ${token1}`)
      .send({});
    res.should.have.status(400);

    res.body.err.map((e) => e.param).should.contain('name')
      .and.contain('players');
  });
  async function createPlayer(token, playerName, playerJerseyNo) {
    const res = await chai.request(app)
      .post('/api/players')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: playerName,
        jerseyNo: playerJerseyNo,
      });

    const {player} = res.body;
    return player._id;
  }
  it('should not create a preset without min 2 players', async () => {
    const player1 = await createPlayer(token1, 'player 1', 1);
    const player2 = await createPlayer(token1, 'player 2', 2);
    let res = await chai.request(app)
      .post(`/api/teams/${teamId}/presets`)
      .set('Authorization', `Bearer ${token1}`)
      .send({name: 'team'});
    res.should.have.status(400);

    res.body.err.map((e) => e.param).should.contain('players')
      .and.not.contain('name');

    res = await chai.request(app)
      .post(`/api/teams/${teamId}/presets`)
      .set('Authorization', `Bearer ${token1}`)
      .send({
        name: 'team',
        players: [player1],
      });
    res.should.have.status(400);

    res.body.err.map((e) => e.param).should.contain('players')
      .and.not.contain('name');
  });

  after(async () => {
    await Team.deleteMany({});
    await Player.deleteMany({});
    await User.deleteMany({});
  });
});
