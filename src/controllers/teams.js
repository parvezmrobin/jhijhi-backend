const express = require('express');

const router = express.Router();
const passport = require('passport');
const ObjectId = require('mongoose/lib/types/objectid');
const { check, validationResult } = require('express-validator/check');
const responses = require('../responses');
const Team = require('../models/team');
const { namify, sendErrorResponse, send404Response } = require('../lib/utils');
const { Error400, Error404 } = require('../lib/errors');

/** @type {RequestHandler} */
const authenticateJwt = passport.authenticate.bind(passport, 'jwt', { session: false });

// region Validations
function _formatShortName(shortName) {
  return shortName.split(' ')
    .filter((s) => s)
    .join('')
    .toUpperCase();
}

const nameExistsValidation = check('name', 'Team name is required')
  .trim()
  .exists({ checkFalsy: true });
const shortNameLengthValidation = check('shortName', 'Short name should be at least 2 characters')
  .trim()
  .isLength({ min: 2 });

const teamCreateValidations = [
  nameExistsValidation,
  shortNameLengthValidation,
  check('name', 'Team Name already taken')
    .custom((name, { req }) => Team
      .findOne({
        name: namify(name),
        creator: req.user._id,
      })
      .exec()
      .then((team) => !team)),
  check('shortName', 'This short name is already taken')
    .custom((shortName, { req }) => Team
      .findOne({
        shortName: _formatShortName(shortName),
        creator: req.user._id,
      })
      .exec()
      .then((team) => !team)),
];

const teamUpdateValidations = [
  nameExistsValidation,
  shortNameLengthValidation,
  check('name', 'Team Name already taken')
    .custom((name, { req }) => Team
      .findOne({
        name: namify(name),
        creator: req.user._id,
      })
      .exec()
      .then((team) => !(team && team._id.toString() !== req.params.id))),
  check('shortName', 'This short name is already taken')
    .custom((shortName, { req }) => Team
      .findOne({
        shortName: _formatShortName(shortName),
        creator: req.user._id,
      })
      .exec()
      .then((team) => !(team && team._id.toString() !== req.params.id))),
];

const presetNameExistsValidation = check('name', 'Preset name is required')
  .trim()
  .exists({ checkFalsy: true });
const presetLengthValidation = check('players', 'Preset must contain at least 2 players')
  .isArray()
  .custom((players) => players.length > 1);

const presetCreateValidations = [
  presetNameExistsValidation,
  presetLengthValidation,
  check('name', 'Preset name already taken')
    .custom(async (name, { req }) => {
      const team = await Team
        .findOne({
          'presets.name': namify(name),
          creator: req.user._id,
        })
        .lean()
        .exec();

      return !team;
    }),
];

const presetDeleteValidations = [
  check('presetId', responses.presets.get.err)
    .custom(async (presetId, { req }) => {
      const teamExists = await Team
        .exists({
          'presets._id': presetId,
          creator: req.user._id,
        })
        .exec();

      return teamExists;
    }),
];
// endregion

// region Controllers
/* Get team by id */
router.get('/:id', authenticateJwt(), (request, response) => {
  Team
    .findOne({
      _id: request.params.id,
      creator: request.user._id,
    })
    .lean()
    .populate('players')
    .then((teams) => response.json(teams))
    .catch((err) => sendErrorResponse(response, err, responses.teams.index.err));
});

/* GET teams listing. */
router.get('/', authenticateJwt(), (request, response) => {
  let query = { creator: request.user._id };
  if (request.query.search) {
    const regex = new RegExp(request.query.search, 'i');
    query = {
      $and: [
        query,
        {
          $or: [
            { name: regex },
            { shortName: regex },
          ],
        },
      ],
    };
  }

  Team
    .find(query)
    .lean()
    .then((teams) => response.json(teams))
    .catch((err) => sendErrorResponse(response, err, responses.teams.index.err));
});

/* Create a new team */
router.post('/', authenticateJwt(), teamCreateValidations, (request, response) => {
  const errors = validationResult(request);
  const promise = errors.isEmpty() ? Promise.resolve() : Promise.reject({
    status: 400,
    errors: errors.array(),
  });
  const { name, shortName } = request.body;

  promise
    .then(() => Team.create({
      name: namify(name),
      shortName: _formatShortName(shortName),
      creator: request.user._id,
    }))
    .then((createdTeam) => response.status(201).json({
      success: true,
      message: responses.teams.create.ok(createdTeam.name),
      team: createdTeam,
    }))
    .catch((err) => sendErrorResponse(response, err, responses.teams.create.err, request.user));
});

/* Edit an existing team */
router.put('/:id', authenticateJwt(), teamUpdateValidations, (request, response) => {
  const errors = validationResult(request);
  const promise = errors.isEmpty() ? Promise.resolve() : Promise.reject({
    status: 400,
    errors: errors.array(),
  });
  const { name, shortName } = request.body;

  promise
    .then(() => Team
      .findOneAndUpdate({
        _id: ObjectId(request.params.id),
        creator: request.user._id,
      }, {
        name: namify(name),
        shortName: _formatShortName(shortName),
        creator: request.user._id,
      }, { new: true }))
    .then((updatedTeam) => {
      if (!updatedTeam) {
        return send404Response(response, responses.teams.get.err);
      }
      return response.json({
        success: true,
        message: responses.teams.edit.ok(name),
        team: {
          _id: updatedTeam._id,
          name: updatedTeam.name,
          shortName: updatedTeam.shortName,
        },
      });
    })
    .catch((err) => sendErrorResponse(response, err, responses.teams.edit.err, request.user));
});

router.get('/:id/presets', authenticateJwt(), async (req, res) => {
  try {
    const team = Team
      .findOne({
        _id: req.params.id,
        creator: req.user._id,
      })
      .select('presets')
      .lean();

    res.json({
      success: true,
      presets: team.presets,
    });
  } catch (err) {
    sendErrorResponse(res, err, responses.presets.index.err, req.user);
  }
});

router.post('/:id/presets', [authenticateJwt(), presetCreateValidations], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new Error400(errors.array(), responses.presets.create.err);
    }

    const { name, players } = req.body;
    const updatedTeam = await Team
      .findOneAndUpdate({
        _id: req.params.id,
        creator: req.user._id,
      }, {
        $push: {
          presets: { name: namify(name), players },
        },
      }, { new: true })
      .select('presets')
      .lean();
    console.log(updatedTeam);
    if (!updatedTeam) {
      throw new Error404(responses.teams.get.err);
    }
    res.status(201).json({
      success: true,
      message: responses.presets.create.ok(name),
      preset: updatedTeam.presets[updatedTeam.presets.length - 1],
    });
  } catch (err) {
    sendErrorResponse(res, err, responses.presets.create.err, req.user);
  }
});

router.delete('/:id/presets/:presetId', [authenticateJwt(), presetDeleteValidations], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new Error400(errors.array(), responses.presets.delete.err);
    }

    await Team
      .updateOne({
        _id: req.params.id,
        creator: req.user._id,
      }, {
        $pull: {
          presets: { _id: req.params.presetId },
        },
      });

    res.json({
      success: true,
      message: responses.presets.delete.ok,
    });
  } catch (err) {
    sendErrorResponse(res, err, responses.presets.create.err, req.user);
  }
});
// endregion

module.exports = router;
