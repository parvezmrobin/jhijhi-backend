const express = require('express');
const router = express.Router();
const Umpire = require("../models/umpire");
const responses = require("../responses");
const passport = require('passport');
const { check, validationResult } = require('express-validator/check');
const ObjectId = require('mongoose/lib/types/objectid');
const { namify, sendErrorResponse, send404Response } = require('../lib/utils');

/** @type {RequestHandler} */
const authenticateJwt = passport.authenticate.bind(passport, 'jwt', {session: false});

const nameExistsValidation = check('name')
  .trim()
  .exists({ checkFalsy: true });
const umpireCreateValidations = [
  nameExistsValidation,
  check('name', 'Name already taken')
    .custom((name, { req }) => Umpire
      .findOne({
        name: namify(name),
        creator: req.user._id,
      })
      .exec()
      .then(umpire => !umpire)),
];

const umpireEditValidations = [
  nameExistsValidation,
  check('name', 'Name already taken')
    .custom((name, { req }) => Umpire
      .findOne({
        name: namify(name),
        creator: req.user._id,
      })
      .lean()
      .exec()
      .then(player => !(player && player._id.toString() !== req.params.id))),
];


/* GET umpires listing. */
router.get('/', authenticateJwt(), (request, response) => {
  let query = { creator: request.user._id };
  if (request.query.search) {
    query.name = new RegExp(request.query.search, 'i');
  }

  Umpire
    .find(query)
    .lean()
    .then(umpires => response.json(umpires))
    .catch(err => sendErrorResponse(response, err, responses.teams.index.err, request.user));
});

/* Create a new umpire */
router.post('/', authenticateJwt(), umpireCreateValidations, (request, response) => {
  const errors = validationResult(request);
  const promise = errors.isEmpty() ? Promise.resolve() : Promise.reject({
    status: 400,
    errors: errors.array(),
  });
  const { name, jerseyNo } = request.body;

  promise
    .then(() => Umpire.create({
      name: namify(name),
      jerseyNo,
      creator: request.user._id,
    }))
    .then(createdUmpire => {
      return response.json({
        success: true,
        message: responses.umpires.create.ok(name),
        umpire: {
          _id: createdUmpire._id,
          name: createdUmpire.name,
        },
      });
    })
    .catch(err => sendErrorResponse(response, err, responses.umpires.create.err, request.user));
});

/* Edit an existing umpire */
router.put('/:id', authenticateJwt(), umpireEditValidations, (request, response) => {
  const errors = validationResult(request);
  const promise = errors.isEmpty() ? Promise.resolve() : Promise.reject({
    status: 400,
    errors: errors.array(),
  });
  const { name } = request.body;

  promise
    .then(() => {
      return Umpire
        .findOneAndUpdate({
          _id: ObjectId(request.params.id),
          creator: request.user._id,
        }, {
          name: namify(name),
          creator: request.user._id,
        }, { new: true });
    })
    .then(updatedUmpire => {
      if (!updatedUmpire) {
        return send404Response(response, responses.umpires.get.err);
      }
      return response.json({
        success: true,
        message: responses.umpires.edit.ok(name),
        umpire: {
          _id: updatedUmpire._id,
          name: updatedUmpire.name,
        },
      });
    })
    .catch(err => sendErrorResponse(response, err, responses.umpires.edit.err, request.user));
});

module.exports = router;
