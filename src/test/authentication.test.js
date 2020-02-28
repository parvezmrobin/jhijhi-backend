const { describe } = require('mocha');
const chai = require('chai');
const chaiHttp = require('chai-http');
chai.should();
process.env.IS_TEST = true;
const app = require('../app');
const User = require('../models/user');

chai.use(chaiHttp);

describe('Test JWT authentication', function testSuit() {
  let token;

  it('should make a new user', async () => {
    const res = await chai.request(app)
      .post('/api/auth/register')
      .send({
        username: 'username',
        password: '1234',
        confirm: '1234',
      });
    res.should.have.status(200);
    res.body.should.be.an('object');
    res.body.user.should.be.an('object');
    res.body.user._id.should.be.a('string');
  });

  it('should login with the new user', async () => {
    const res = await chai.request(app)
      .post('/api/auth/login')
      .send({
        username: 'username',
        password: '1234',
      });
    res.should.have.status(200);
    res.body.success.should.be.equals(true);
    res.body.token.should.be.a('string');
    token = res.body.token;
  });

  it('should authenticate using token', async () => {
    const res = await chai.request(app)
      .get('/api/auth/user')
      .set('Authorization', `Bearer ${token}`);
    res.should.have.status(200);
  });

  after(() => User.deleteMany({}));
});
