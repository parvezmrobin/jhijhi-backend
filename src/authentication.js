/**
 * Parvez M Robin
 * parvezmrobin@gmail.com
 * Date: Apr 03, 2019
 */


const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const passport = require('passport');
const User = require('./models/user');


function authentication() {
  const options = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.DB_CONN,
  };

  passport.use('jwt', new JwtStrategy(options, ((jwtPayload, done) => {
    /* eslint-disable promise/no-callback-in-promise */
    User
      .findById(jwtPayload)
      .select('username')
      .lean()
      .then((user) => {
        if (user) {
          return done(null, user);
        }
        return done(null, false);
      })
      .catch(done);
  })));

  const passportMiddleware = passport.initialize();
  return passportMiddleware;
}

module.exports = authentication;
