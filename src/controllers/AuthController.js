/**
 * Parvez M Robin
 * this@parvezmrobin.com
 * Mar 29, 2020
 */

const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const {check, validationResult} = require('express-validator/check');
const User = require('../models/user');
const responses = require('../responses');
const {sendErrorResponse} = require('../lib/utils');
const Logger = require('../lib/logger');
const Events = require('../events');
const {Error400} = require("../lib/errors");

const router = express.Router();


/** @type {RequestHandler} */
const authenticateJwt = passport.authenticate.bind(passport, 'jwt', {session: false});

const saltRounds = 10;

function getConfirmPasswordCheck(passwordField) {
  return check(passwordField)
    .custom((password, {req}) => {
      if (password !== req.body.confirm) {
        // trow error if passwords do not match
        throw new Error('Password and confirm password don\'t match');
      }
      return password;
    });
}

const getPasswordLengthCheck = (passwordField) => check(passwordField, 'Password should be at least 4 characters long')
  .isLength({min: 4});

const registrationValidations = [
  check('username', 'Username should not be empty')
    .trim()
    .exists({checkFalsy: true}),
  getPasswordLengthCheck('password'),
  check('username', 'Username already taken')
    .custom((username) => User.findOne({username})
      .exec()
      .then((user) => !user)),
  getConfirmPasswordCheck('password'),
];

const updatePasswordValidations = [
  getPasswordLengthCheck('new'),
  getConfirmPasswordCheck('new'),
];


router.get('/user', authenticateJwt(), (request, response) => {
  response.json({username: request.user.username});
});

router.post('/register', registrationValidations, async (request, response) => {
  try {
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      throw new Error400(errors.array());
    }

    const {username, password} = request.body;
    const hashedPassword = await bcrypt.hash(password, saltRounds)
    const user = await User.create({
      username,
      password: hashedPassword,
    });
    response.json({
      success: true,
      message: responses.auth.register.ok,
      user: {_id: user._id},
    });
    await Logger.amplitude(Events.Auth.Register, user._id, {username: user.username});
  } catch (e) {
    sendErrorResponse(response, e, responses.auth.register.err);
  }
});

router.post('/login', (request, response) => {
  const {username, password} = request.body;
  let user;
  User
    .findOne({username})
    .exec()
    .then((_user) => {
      if (!_user) {
        const err = {message: responses.auth.login.user, jhijhi: true};
        throw err;
      }
      user = _user;
      return bcrypt.compare(password, _user.password);
    })
    .then((matched) => {
      if (matched) {
        const token = jwt.sign(user._id.toString(), process.env.DB_CONN);
        Logger.amplitude(Events.Auth.Login, user._id, {username: user.username});
        return response.json({
          success: true,
          token,
        });
      }
      const err = {message: responses.auth.login.password, jhijhi: true};
      throw err;
    })
    .catch((err) => {
      const data = {err, user: request.user};
      err.jhijhi ? Logger.warn('Failed login attempt', data) : Logger.error('Error while login', data);
      response.json({success: false});
    });
});

router.put('/password', authenticateJwt(), updatePasswordValidations, async (request, response) => {
  try {
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      throw new Error400(errors.array());
    }
    const {current: password, new: newPassword} = request.body;
    const {username} = request.user;
    const user = await User.findOne({username}).exec();
    const matched = await bcrypt.compare(password, user.password);
    if (!matched) {
      // simulating `express-validator` error style
      const err = {status: 400, errors: [{param: 'current', msg: responses.auth.password.mismatch}]};
      throw err;
    }
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    await User.updateOne({username}, {password: hashedPassword}).exec();
    response.json({
      success: true,
      message: responses.auth.password.ok,
    });
    await Logger.amplitude(Events.Auth.Password, user._id, {username: user.username});
  } catch (e) {
    sendErrorResponse(response, e, responses.auth.password.err, request.user);
  }
});

module.exports = router;
