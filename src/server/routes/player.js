const express = require('express');

/**
 * User router
 * @property {Function} get
 * @property {Function} post
 * @property {Function} put
 * @property {Function} delete
 */
const router = express.Router();
const Player = require("../models/player");
const responses = require("../responses");
const passport = require('passport');
const authenticateJwt = passport.authenticate.bind(passport, 'jwt', {session: false});
const {check, validationResult} = require('express-validator/check');


const playerCreateValidations = [
  check('name').exists({checkFalsy: true})
    .custom(name => {
      return new Promise(function (resolve, reject) {
        Player.findOne({name: name}).exec().then(player => {
          if (player) {
            reject("Player Name already taken.");
          } else {
            resolve();
          }
        }).catch(reject);
      });
    }),
  check('jerseyNo').isInt({min: 1})
    .custom(jerseyNo => {
      return new Promise(function (resolve, reject) {
        Player.findOne({jerseyNo: jerseyNo}).exec().then(player => {
          if (player) {
            reject("This jersey is already taken.");
          } else {
            resolve();
          }
        }).catch(reject);
      });
    }),
];

/* GET players listing. */
router.get('/', authenticateJwt(), (request, response) => {
  Player
    .find({creator: request.user._id})
    .lean()
    .then(players => response.json(players))
    .catch(err => {
      response.status(err.statusCode || err.status || 500);
      response.json({
        success: false,
        message: responses.players.index.err,
        err: err.error || err.errors || err,
      });
    })
});

router.post('/', authenticateJwt(), playerCreateValidations, (request, response) =>{
  const errors = validationResult(request);
  const promise = errors.isEmpty() ? Promise.resolve() : Promise.reject({status: 400, errors: errors.array()});
  const {name, jerseyNo} = request.body;

  promise
    .then(() => Player.create({name, jerseyNo, creator: request.user._id}))
    .then(createdPlayer => {
      response.json({
        success: true,
        message: responses.players.create.ok,
        player: {_id: createdPlayer._id},
      });
    })
    .catch(err => {
      response.status(err.statusCode || err.status || 500);
      response.json({
        success: false,
        message: responses.players.create.err,
        err: err.error || err.errors || err,
      });
    })
});

module.exports = router;