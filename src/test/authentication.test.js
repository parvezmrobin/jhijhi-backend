const { describe } = require('mocha');
const chai = require('chai');
const chaiHttp = require('chai-http');
chai.should();
const app = require('../app');
const User = require('../models/user');


chai.use(chaiHttp);

describe('Test JWT authentication', function () {
  let backup;
  let token;

  before(function () {
    return User.find({})
      .then(users => {
        backup = users;
        return User.deleteMany({});
      });
  });

  it('should make a new user', function () {
    return chai.request(app)
      .post('/api/auth/register')
      .send({
        username: 'username',
        password: '1234',
        confirm: '1234',
      })
      .then((res) => {
        res.should.have.status(200);
        res.body.should.be.an('object');
        res.body.user.should.be.an('object');
        res.body.user._id.should.be.a('string');
      });
  });

  it('should login with the new user', function () {
    return chai.request(app)
      .post('/api/auth/login')
      .send({
        username: 'username',
        password: '1234',
      })
      .then((res) => {
        res.should.have.status(200);
        res.body.success.should.be.equals(true);
        res.body.token.should.be.a('string');
        token = res.body.token;
      });
  });

  it('should authenticate using token', function () {
    return chai.request(app)
      .get('/api/auth/user')
      .set('Authorization', `Bearer ${token}`)
      .then((res) => {
        res.should.have.status(200);
      });
  });

  after(function () {
    return User.deleteMany({})
      .then(() => User.insertMany(backup))
      .then(users => console.log(`${users.length} users restored`));
  });
});
