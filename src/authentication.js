/**
 * Parvez M Robin
 * parvezmrobin@gmail.com
 * Date: Apr 03, 2019
 */


/**
 * @var {Object} ExtractJwt
 * @property {Function} fromAuthHeaderAsBearerToken
 */
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const User = require('./models/user');
const passport = require('passport');


module.exports = function () {
  const options = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.DB_CONN,
  };

  passport.use('jwt', new JwtStrategy(options, function (jwtPayload, done) {
    /* eslint-disable promise/no-callback-in-promise */
    User
      .findById(jwtPayload)
      .select('username')
      .lean()
      .then(user => {
        if (user) {
          return done(null, user);
        }
        return done(null, false);
      })
      .catch(done);
  }));

  const passportMiddleware = passport.initialize({});
  return passportMiddleware;
};
