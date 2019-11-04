const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const bcrypt = require('bcrypt');
const responses = require('../responses');
const { check, validationResult } = require('express-validator/check');
const { sendErrorResponse } = require('../lib/utils');
const Logger = require('../lib/logger');
const Events = require('../events');

/** @type {RequestHandler} */
const authenticateJwt = passport.authenticate.bind(passport, 'jwt', { session: false });

const saltRounds = 10;

function getConfirmPasswordCheck(passwordField) {
  return check(passwordField)
    .custom((password, { req }) => {
      if (password !== req.body.confirm) {
        // trow error if passwords do not match
        throw new Error('Password and confirm password don\'t match');
      }
      return password;
    });
}

const getPasswordLengthCheck = (passwordField) => check(passwordField, 'Password should be at least 4 characters long')
  .isLength({ min: 4 });

const registrationValidations = [
  check('username', 'Username should not be empty')
    .trim()
    .exists({ checkFalsy: true }),
  getPasswordLengthCheck('password'),
  check('username', 'Username already taken')
    .custom(username => {
      return User.findOne({ username: username })
        .exec()
        .then(user => !user);
    }),
  getConfirmPasswordCheck('password'),
];

const updatePasswordValidations = [
  getPasswordLengthCheck('new'),
  getConfirmPasswordCheck('new'),
];


router.get('/user', authenticateJwt(), function (request, response) {
  response.json({ username: request.user.username });
});

router.post('/register', registrationValidations, function (request, response) {
  const errors = validationResult(request);
  const promise = errors.isEmpty() ? Promise.resolve() : Promise.reject({
    status: 400,
    errors: errors.array(),
  });
  const { username, password } = request.body;

  promise
    .then(() => bcrypt.hash(password, saltRounds))
    .then(hashedPassword => {
      return User.create({
        username: username,
        password: hashedPassword,
      });
    })
    .then(user => {
      Logger.amplitude(Events.Auth.Register, user._id, {username: user.username});
      return response.json({
        success: true,
        message: responses.auth.register.ok,
        user: { _id: user._id },
      });
    })
    .catch(err => sendErrorResponse(response, err, responses.auth.register.err));
});

router.post('/login', function (request, response) {
  const { username, password } = request.body;
  let user;
  User
    .findOne({ username })
    .exec()
    .then(_user => {
      if (!_user) {
        const err = {message: responses.auth.login.user, jhijhi: true};
        throw err;
      }
      user = _user;
      return bcrypt.compare(password, _user.password);
    })
    .then(matched => {
      if (matched) {
        const token = jwt.sign(user._id.toString(), process.env.DB_CONN);
        Logger.amplitude(Events.Auth.Login, user._id, {username: user.username});
        return response.json({
          success: true,
          'token': token,
        });
      }
      const err = {message: responses.auth.login.password, jhijhi: true};
      throw err;
    })
    .catch(err => {
      const data = {err, user: request.user};
      err.jhijhi ? Logger.warn('Failed login attempt', data) : Logger.error('Error while login', data);
      response.json({ success: false });
    });
});

router.put('/password', authenticateJwt(), updatePasswordValidations, function (request, response) {
  const errors = validationResult(request);
  const promise = errors.isEmpty() ? Promise.resolve() : Promise.reject({
    status: 400,
    errors: errors.array(),
  });
  const { current: password, new: newPassword } = request.body;
  const { username } = request.user;

  let user;
  promise.then(() => User.findOne({ username }).exec())
    .then(_user => {
      user = _user;
      return bcrypt.compare(password, _user.password);
    })
    .then(matched => {
      if (!matched) {
        // simulating `express-validator` error style
        const err = { status: 400, errors: [{ param: "current", msg: responses.auth.password.mismatch }] };
        throw err;
      }
      return bcrypt.hash(newPassword, saltRounds);
    })
    .then(hashedPassword => User.updateOne({ username }, { password: hashedPassword }).exec())
    .then(() => {
      Logger.amplitude(Events.Auth.Password, user._id, {username: user.username});
      return response.json({
        success: true,
        message: responses.auth.password.ok,
      });
    })
    .catch(err => sendErrorResponse(response, err, responses.auth.password.err, request.user));
});

module.exports = router;
