/**
 * Parvez M Robin
 * this@parvezmrobin.com
 * Mar 28, 2020
 */


const express = require('express');
const passport = require('passport');
const { check, validationResult } = require('express-validator/check');
const ObjectId = require('mongoose/lib/types/objectid');
const responses = require('../responses');
const Umpire = require('../models/umpire');
const {Error404, Error400} = require('../lib/errors');
const { namify, sendErrorResponse } = require('../lib/utils');

const router = express.Router();

/** @type {RequestHandler} */
const authenticateJwt = passport.authenticate.bind(passport, 'jwt', {session: false});

const nameExistsValidation = check('name')
  .trim()
  .exists();
const umpireCreateValidations = [
  nameExistsValidation,
  check('name', 'Name already taken')
    .custom(async (name, {req}) => {
      const umpire = await Umpire
        .findOne({
          name: namify(name),
          creator: req.user._id,
        })
        .exec();
      return !umpire;
    }),
];

const umpireEditValidations = [
  nameExistsValidation,
  check('name', 'Name already taken')
    .custom(async (name, {req}) => {
      const player = await Umpire
        .findOne({
          _id: {
            $ne: req.params.id,
          },
          name: namify(name),
          creator: req.user._id,
        })
        .lean()
        .exec();
      return !player;
    }),
];


/* GET umpires listing. */
router.get('/', authenticateJwt(), async (request, response) => {
  try {
    const query = {creator: request.user._id};
    if (request.query.search) {
      query.name = new RegExp(request.query.search, 'i');
    }

    const umpires = Umpire
      .find(query)
      .lean()
      .exec();
    response.json(umpires);
  } catch (e) {
    sendErrorResponse(response, e, responses.teams.index.err, request.user);
  }
});

/* Create a new umpire */
router.post('/', authenticateJwt(), umpireCreateValidations, async (request, response) => {
  try {
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      throw new Error400(errors.array());
    }
    const {name} = request.body;

    const createdUmpire = await Umpire.create({
      name: namify(name),
      creator: request.user._id,
    });

    response.status(201).json({
      success: true,
      message: responses.umpires.create.ok(name),
      umpire: {
        _id: createdUmpire._id,
        name: createdUmpire.name,
      },
    });
  } catch (e) {
    sendErrorResponse(response, e, responses.umpires.create.err, request.user);
  }
});

/* Edit an existing umpire */
router.put('/:id', authenticateJwt(), umpireEditValidations, async (request, response) => {
  try {
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      throw new Error400(errors.array());
    }
    const {name} = request.body;

    const updatedUmpire = await Umpire
      .findOneAndUpdate({
        _id: ObjectId(request.params.id),
        creator: request.user._id,
      }, {
        name: namify(name),
        creator: request.user._id,
      }, {new: true});
    if (!updatedUmpire) {
      throw new Error404(responses.umpires.e404);
    }

    response.json({
      success: true,
      message: responses.umpires.edit.ok(name),
      umpire: {
        _id: updatedUmpire._id,
        name: updatedUmpire.name,
      },
    });
  } catch (e) {
    sendErrorResponse(response, e, responses.umpires.edit.err, request.user);
  }
});

router.delete('/:id', authenticateJwt(), async (req, res) => {
  try {
    const deletedUmpire = await Umpire
      .findOneAndDelete({
        _id: req.params.id,
        creator: req.user._id,
      })
      .select({name: 1})
      .lean()
      .exec();
    if (!deletedUmpire) {
      throw new Error404(responses.umpires.e404);
    }
    res.json({
      success: true,
      message: responses.umpires.edit.ok(deletedUmpire.name),
    });
  } catch (e) {
    sendErrorResponse(res, e, responses.umpires.delete.err, req.user);
  }
});

module.exports = router;
