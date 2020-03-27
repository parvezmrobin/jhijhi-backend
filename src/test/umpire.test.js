
const { describe } = require('mocha');
const chai = require('chai');
const chaiHttp = require('chai-http');

chai.should();
process.env.IS_TEST = true;
const app = require('../app');
const User = require('../models/user');
const Umpire = require('../models/umpire');
const {namify} = require('../lib/utils');

chai.use(chaiHttp);

describe('Test Umpire Functionality', function umpireTestSuit() {
  this.timeout(10000);
  let token1;
  let token2;
  let umpireId;

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

  it('should not create an umpire without authentication', async () => {
    const res = await chai.request(app)
      .post('/api/umpires')
      .send({
        name: 'umpire',
      });

    res.should.have.status(401);
  });
  it('should not create an umpire without values', async () => {
    const res = await chai.request(app)
      .post('/api/umpires')
      .set('Authorization', `Bearer ${token1}`)
      .send({});
    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.contain('name');
  });
  async function testCreateUmpire(token) {
    const res = await chai.request(app)
      .post('/api/umpires')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'umpire',
      });
    res.should.have.status(201);
    const {umpire} = res.body;
    umpire.name.should.be.equals('Umpire'); // name is auto-capitalized
    umpire.should.have.property('_id');
    return umpire._id;
  }

  it('should successfully create an umpire', async () => {
    umpireId = await testCreateUmpire(token1);
  });

  it('should not create a duplicate umpire', async () => {
    const res = await chai.request(app)
      .post('/api/umpires')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        name: 'umpire',
      });
    res.should.have.status(400);
    res.body.err.map((e) => e.param).should.contain('name');
  });

  it('should create an umpire by different user', async () => {
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

    await testCreateUmpire(token2);
  });

  it('should not edit an umpire of another user', async () => {
    const res = await chai.request(app)
      .put(`/api/umpires/${umpireId}`)
      .set('Authorization', `Bearer ${token2}`)
      .send({
        name: 'umpire2',
      });
    res.should.have.status(404);
  });

  async function testEditUmpire(umpireObject) {
    const res = await chai.request(app)
      .put(`/api/umpires/${umpireId}`)
      .set('Authorization', `Bearer ${token1}`)
      .send(umpireObject);
    res.should.have.status(200);
    const {umpire} = res.body;
    umpire.name.should.be.equals(namify(umpireObject.name)); // name is auto-capitalized
    umpire.should.have.property('_id');
  }

  it('should edit an umpire without a change', async () => {
    await testEditUmpire({
      name: 'umpire',
    });
  });

  it('should edit an umpire', async () => {
    await testEditUmpire({
      name: 'umpire3',
    });
  });

  it('should not delete an umpire of another user', async () => {
    const res = await chai.request(app)
      .delete(`/api/umpires/${umpireId}`)
      .set('Authorization', `Bearer ${token2}`)
      .send();
    res.should.have.status(404);
  });

  it('should delete an umpire', async () => {
    const res = await chai.request(app)
      .delete(`/api/umpires/${umpireId}`)
      .set('Authorization', `Bearer ${token1}`)
      .send();
    res.should.have.status(200);
  });

  after(async () => {
    await Umpire.deleteMany({});
    await User.deleteMany({});
  });
});
