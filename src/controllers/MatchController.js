const express = require('express');

const router = express.Router();
const passport = require('passport');
const {body, validationResult} = require('express-validator/check');
const pick = require('lodash/pick');
const isMongoId = require('validator/lib/isMongoId');
const {ObjectId} = require('mongoose/lib/types');
const Match = require('../models/match');
const Team = require('../models/team');
const Umpire = require('../models/umpire');
const Player = require('../models/player');
const responses = require('../responses');
const {sendErrorResponse, send404Response, nullEmptyValues} = require('../lib/utils');
const {Error400, Error404} = require('../lib/errors');
const Logger = require('../lib/logger');
const Events = require('../events');
const {namify} = require('../lib/utils');


/** @type {RequestHandler} */
const authenticateJwt = passport.authenticate.bind(passport, 'jwt', {session: false});


const nameExistsValidation = body('name', 'A match name is required')
  .trim()
  .exists({checkFalsy: true});
const team1ExistsValidation = body('team1', 'Select a team')
  .isMongoId()
  .custom(async (team1, {req}) => Team.exists({
    _id: team1,
    creator: req.user._id,
  }));
const team2ExistsValidation = body('team2', 'Select a team')
  .isMongoId()
  .custom(async (team2, {req}) => Team.exists({
    _id: team2,
    creator: req.user._id,
  }));
const minimumOverValidation = body('overs', 'Overs must be greater than 0')
  .isInt({min: 1});
const genUmpireValidation = (umpireNumber) => body(`umpire${umpireNumber}`)
  .custom(async (umpire, {req}) => {
    if (!umpire) {
      return true;
    }
    if (!isMongoId(umpire)) {
      throw new Error(`Umpire ${umpireNumber} is invalid`);
    }
    for (let i = 1; i <= 3; i++) {
      if (i === umpireNumber) {
        continue;
      }
      if (umpire === req.body[`umpire${i}`]) {
        throw new Error(`Umpire ${umpireNumber} is duplicate with umpire ${i}`);
      }
    }

    const exists = await Umpire.exists({
      _id: umpire,
      creator: req.user._id,
    });

    return exists;
  });

const matchCreateValidations = [
  nameExistsValidation,
  team1ExistsValidation,
  team2ExistsValidation,
  genUmpireValidation(1),
  genUmpireValidation(2),
  genUmpireValidation(3),
  minimumOverValidation,
  body('name', 'Match Name already taken')
    .custom(async (name, {req}) => {
      const exists = await Match.exists({
        name: new RegExp(namify(name), 'i'),
        creator: req.user._id,
      });
      return !exists;
    }),
  body('team1', 'Team 1 and Team 2 should be different.')
    .custom((team1, {req}) => team1 !== req.body.team2),
];

const matchEditValidations = [
  nameExistsValidation,
  team1ExistsValidation,
  team2ExistsValidation,
  genUmpireValidation(1),
  genUmpireValidation(2),
  genUmpireValidation(3),
  minimumOverValidation,
  body('name', 'Match Name already taken')
    .custom(async (name, {req}) => {
      const exists = await Match.exists({
        _id: {$ne: req.params.id},
        name: new RegExp(namify(name), 'i'),
        creator: req.user._id,
      });
      return !exists;
    }),
  body('team1', 'Team 1 and Team 2 should be different.')
    .custom((team1, {req}) => team1 !== req.body.team2),
];

const isRequiredMessageBuilder = (_, {path}) => `\`${path}\` is required`;
const playerIdExistenceValidation = (field) => body(field)
  .custom(async (playersIds, {req}) => {
    const existencePromises = playersIds.map((playerId) => Player.exists({
      _id: playerId,
      creator: req.user._id,
    }));

    const existenceList = await Promise.all(existencePromises);
    // list ids that don't exists
    const nonExistingIds = playersIds.filter((_, i) => !existenceList[i]);
    if (!nonExistingIds.length) {
      return true;
    }
    throw new Error(`${nonExistingIds.join(', ')} don't exists`);
  });
const matchBeginValidations = [
  body('team1Players', isRequiredMessageBuilder)
    .isArray(),
  playerIdExistenceValidation('team1Players'),
  body('team2Players', isRequiredMessageBuilder)
    .isArray(),
  playerIdExistenceValidation('team2Players'),
  body('team1Captain', 'No captain selected')
    .isMongoId(),
  body('team1Captain', 'Must have at least two players')
    .custom((_, {req}) => {
      const {team1Players} = req.body;
      return team1Players && team1Players.length > 1;
    }),
  body('team1Captain', 'Captain should be a player from same team')
    .custom((team1Captain, {req}) => req.body.team1Players && req.body.team1Players.indexOf(team1Captain) !== -1),
  body('team2Captain', 'No captain selected')
    .isMongoId(),
  body('team2Captain', 'Must have at least two players')
    .custom((_, {req}) => {
      const {team2Players} = req.body;
      return team2Players && team2Players.length > 1;
    }),
  body('team2Captain', 'Captain should be a player from same team')
    .custom((team2Captain, {req}) => req.body.team2Players && req.body.team2Players.indexOf(team2Captain) !== -1),
];

const matchTossValidations = [
  body('won')
    .custom((won, {req}) => Match
      .findById(req.params.id)
      .exec()
      .then((match) => {
        if (![match.team1, match.team2].map(String).includes(won)) {
          throw new Error('Select a team');
        }
        return true;
      })),
  body('choice')
    .isIn(['Bat', 'Bowl']),
];

const overValidation = [
  body('bowledBy', '`bowledBy` is required and should be an integer')
    .isInt({min: 0}),
];

const RUN_OUT = 'Run out';
const OBSTRUCTING_THE_FIELD = 'Obstructing the field';
const UNCERTAIN_WICKETS = [RUN_OUT, OBSTRUCTING_THE_FIELD];

const bowlValidations = [
  body('singles', '`singles` should be an integer')
    .optional()
    .isInt({min: 0})
    .custom((singles, {req}) => {
      if (singles === 0) {
        return true;
      }

      const {legBy} = req.body;
      if (legBy) {
        throw new Error('Singles and leg by cannot be taken in the same bowl');
      }

      const {boundary} = req.body;
      if (boundary && ['regular', 'legBy'].includes(boundary.kind)) {
        const boundaryType = boundary.kind === 'regular' ? '' : 'leg by ';
        throw new Error(`Singles and ${boundaryType}boundary cannot be taken in the same bowl`);
      }

      if (req.body.isWide) {
        throw new Error('Singles cannot be taken in a wide bowl');
      }
      return true;
    }),
  body('by', '`by` should be an integer')
    .optional()
    .isInt({min: 0}),
  body('legBy', '`legBy` should be an integer')
    .optional()
    .isInt({min: 0})
    .custom((legBy, {req}) => {
      if (legBy === 0) {
        return true;
      }

      const {boundary} = req.body;
      if (boundary && ['regular', 'legBy'].includes(boundary.kind)) {
        const boundaryType = boundary.kind === 'regular' ? '' : 'leg by ';
        throw new Error(`Leg by singles and ${boundaryType}boundary cannot be taken in the same bowl`);
      }

      if (req.body.isWide) {
        throw new Error('Leg by singles cannot be taken in a wide bowl');
      }
      return true;
    }),
  body('boundary')
    .optional()
    .custom((boundary, {req}) => {
      if (!Object.keys(boundary).length) {
        return true;
      }

      if (req.body.isWide && ['regular', 'legBy'].includes(boundary.kind)) {
        const boundaryType = boundary.kind === 'regular' ? '' : 'leg by ';
        throw new Error(`Cannot take ${boundaryType}boundary in a wide bowl`);
      }

      return true;
    }),
  body('isWide', '`isWide` should be a boolean')
    .optional()
    .isBoolean(),
  body('isNo', '`isNo` should be a string')
    .optional()
    .isString(),
  body('isWicket')
    .optional()
    .custom((isWicket, {req}) => {
      if (!Object.keys(isWicket).length) {
        return true;
      }
      if (typeof isWicket.kind !== 'string') {
        throw new Error('`Wicket kind` should be a string');
      }
      if (UNCERTAIN_WICKETS.includes(isWicket.kind)) {
        if (!Number.isInteger(isWicket.player)) {
          throw new Error(`Out player should be provided for out type ${isWicket.kind}`);
        }
      } else { // if in CERTAIN_WICKETS
        const {isWide, isNo} = req.body;
        if (isWide || isNo) {
          throw new Error(`Wicket type ${isWicket.kind} cannot happen in a ${isNo ? 'No' : 'Wide'} bowl`);
        }

        const {singles, by, legBy} = req.body;
        // eslint-disable-next-line no-nested-ternary
        const scoreType = singles ? 'single' : by ? 'by' : legBy ? 'leg by' : null;
        if (scoreType) {
          throw new Error(`Cannot take ${scoreType} run with wicket type ${isWicket.kind}`);
        }
      }
      const {boundary} = req.body;
      if (boundary != null && boundary.run) {
        throw new Error('Wicket and boundary cannot happen in the same bowl');
      }

      return true;
    }),
];

const bowlCreateValidation = [
  ...bowlValidations,
  body('playedBy', '`playedBy` is required and should be an integer')
    .isInt({min: 0}),
];

const overNoAndBowlNoValidation = [
  body('overNo', '`overNo` must be a non-negative integer')
    .optional()
    .isInt({min: 0})
    .custom((overNo, {req}) => {
      if (overNo && !Number.isInteger(req.body.bowlNo)) {
        throw new Error('Must provide either both `overNo` and `bowlNo` or none');
      }
      return true;
    }),
  body('bowlNo', '`bowlNo` must be a non-negative integer')
    .optional()
    .isInt({min: 0})
    .custom((bowlNo, {req}) => {
      if (bowlNo && !Number.isInteger(req.body.overNo)) {
        throw new Error('Must provide either both `overNo` and `bowlNo` or none');
      }
      return true;
    }),
];
const bowlEditValidation = [
  ...bowlValidations,
  ...overNoAndBowlNoValidation,
  body('playedBy', '`playedBy` is required and should be an integer')
    .optional()
    .isInt({min: 0}),
];

const byRunValidations = [
  ...overNoAndBowlNoValidation,
  body('boundary')
    .optional()
    .isBoolean(),
  body('run')
    .custom((run, {req}) => {
      if (req.body.boundary && ![4, 6].includes(run)) {
        throw new Error('Boundary run can either be 4 or 6');
      }
      return true;
    }),
];

const uncertainOutValidations = [
  ...overNoAndBowlNoValidation,
  body('batsman')
    .isInt({min: 0}),
  body('batsman')
    .custom((batsman, {req}) => Match
      .findById(req.params.id)
      .lean()
      .exec()
      .then((match) => {
        if (!match) {
          throw new Error('Invalid match id');
        }
        if (['innings1', 'innings2'].indexOf(match.state) === -1) {
          throw new Error('No runout happens before or after match.');
        }

        const {overs} = match[match.state];
        const overNo = req.body.overNo || overs.length - 1;
        const lastOver = overs[overNo].bowls;
        const bowlNo = req.body.bowlNo || lastOver.length - 1;
        const existingBowl = lastOver[bowlNo];

        if (existingBowl.isWicket && existingBowl.isWicket.kind) {
          const message = `Already a ${existingBowl.isWicket.kind} in this bowl. `
            + 'To input a bowl with only a run out or obstructing the field, '
            + 'input a bowl with 0 run first.';
          throw new Error(message);
        }

        return true;
      })),
  body('kind', '`kind` should be either run out or obstructing the field')
    .isIn(['Run out', 'Obstructing the field']),
];

router.put('/:id/begin', authenticateJwt(), matchBeginValidations, async (request, response) => {
  try {
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      throw new Error400(errors.array());
    }
    const params = nullEmptyValues(request);
    const {
      team1Players, team1Captain, team2Players, team2Captain, state = 'toss',
    } = params;
    const {id} = request.params;

    const match = await Match
      .findOne({
        _id: id,
        creator: request.user._id,
      })
      .exec();

    if (!match) {
      send404Response(response, responses.matches.e404);
      return;
    }

    match.set({
      team1Captain,
      team2Captain,
      team1Players,
      team2Players,
      state,
    });

    await match.save();
    await match.populate('team1Captain')
      .populate('team2Captain')
      .populate('team1Players')
      .populate('team2Players')
      .execPopulate();
    response.json({
      success: true,
      message: responses.matches.begin.ok,
      match: {
        team1Captain: match.team1Captain,
        team2Captain: match.team2Captain,
        team1Players: match.team1Players,
        team2Players: match.team2Players,
        state: 'toss',
      },
    });

    await Logger.amplitude(Events.Match.Begin, request.user._id, {
      match_id: match._id,
      team1Captain,
      team2Captain,
      team1Players,
      team2Players,
      state,
    });
  } catch (err) {
    sendErrorResponse(response, err, responses.matches.begin.err, request.user);
  }
});

router.put('/:id/toss', [authenticateJwt(), matchTossValidations], async (request, response) => {
  try {
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      throw new Error400(errors.array());
    }
    const params = nullEmptyValues(request);

    const {won, choice, state = 'innings1'} = params;
    const {id} = request.params;

    const match = await Match
      .findOne({
        _id: id,
        creator: request.user._id,
        state: 'toss',
      });

    if (!match) {
      throw new Error404(responses.matches.e404);
    }

    match.team1WonToss = match.team1.toString() === won;
    match.team1BatFirst = (match.team1WonToss && choice === 'Bat') || (!match.team1WonToss && choice === 'Bowl');
    match.state = state;
    match.innings1 = {overs: []};
    await match.save();

    response.json({
      success: true,
      message: responses.matches.toss.ok,
      match: {
        team1WonToss: match.team1WonToss,
        team1BatFirst: match.team1BatFirst,
        state: 'innings1',
        innings1: {overs: []},
      },
    });

    const amplitudeEvent = pick(match.toObject(), ['team1WonToss', 'team1BatFirst', 'state']);
    Object.assign(amplitudeEvent, {won, choice, state});
    await Logger.amplitude(Events.Match.Begin, request.user._id, amplitudeEvent);
  } catch (err) {
    sendErrorResponse(response, err, responses.matches.toss.err, request.user);
  }
});

router.post('/:id/over', [authenticateJwt(), overValidation], async (request, response) => {
  try {
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      throw new Error400(errors.array());
    }
    const {bowledBy} = nullEmptyValues(request);
    const over = {
      bowledBy,
      bowls: [],
    };
    const {id: matchId} = request.params;

    const match = await Match
      .findOne({
        _id: matchId,
        creator: request.user._id,
      })
      .select({state: 1, innings1: 1, innings2: 1})
      .exec();

    if (!match) {
      throw new Error404(responses.matches.get.err);
    }

    let updateQuery;
    if (match.state === 'innings1') {
      updateQuery = {$push: {'innings1.overs': over}};
    } else if (match.state === 'innings2') {
      updateQuery = {$push: {'innings2.overs': over}};
    } else {
      response.status(400)
        .json({
          success: false,
          message: `Can't add over in state ${match.state}`,
        });
      return;
    }
    await match.update(updateQuery)
      .exec();
    response.status(201).json({success: true});

    const innings = match[match.state];
    const amplitudeEvent = {
      match_id: match._id,
      overIndex: innings.overs.length,
    };
    await Logger.amplitude(Events.Match.Over, response.req.user._id, amplitudeEvent);
  } catch (e) {
    sendErrorResponse(response, e, 'Error while saving over', request.user);
  }
});

router.post('/:id/bowl', [authenticateJwt(), bowlCreateValidation], async (request, response) => {
  try {
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      throw new Error400(errors.array());
    }
    const matchId = request.params.id;
    const match = await Match
      .findOne({
        _id: matchId,
        creator: request.user._id,
      })
      .select({state: 1, innings1: 1, innings2: 1})
      .exec();

    if (!match) {
      throw new Error404(responses.matches.get.err);
    }

    const bowl = nullEmptyValues(request);
    bowl._id = new ObjectId();
    if (!['innings1', 'innings2'].includes(match.state)) {
      throw new Error400([{
        location: 'body',
        param: null,
        value: null,
        msg: `Cannot add bowl in state ${match.state}`,
      }]);
    }
    const overIndex = match[match.state].overs.length - 1;
    if (overIndex === -1) {
      throw new Error400([{
        location: 'body',
        param: null,
        value: null,
        msg: `Cannot add bowl before adding over to ${match.state}`,
      }]);
    }
    const keyForBowlArray = `${match.state}.overs.${overIndex}.bowls`;
    const updateQuery = {
      $push: {
        [keyForBowlArray]: bowl,
      },
    };

    await match.updateOne(updateQuery)
      .exec();
    response.status(201).json({success: true, _id: bowl._id});

    const innings = match[match.state];
    const amplitudeEvent = {
      match_id: match._id,
      overIndex: innings.overs.length - 1,
      bowlIndex: innings.overs[innings.overs.length - 1].bowls.length,
    };
    Object.assign(amplitudeEvent, bowl);
    await Logger.amplitude(Events.Match.Bowl.Create, request.user._id, amplitudeEvent);
  } catch (err) {
    sendErrorResponse(response, err, 'Error while saving bowl', request.user);
  }
});

/**
 * Updates a bowl and sends the response
 * @param {Response} response
 * @param match
 * @param bowl
 * @param {number|undefined} overNo
 * @param {number|undefined} bowlNo
 * @param {boolean} merge if merge is false, then the bowl is replaced by new payload
 *              with an exception that `playedBy` can be kept if not passed in payload.
 *              If merge is true, then all values of the bowl is kept if the value is not passed in payload.
 * @returns {Promise<void>}
 * @private
 */
async function _updateBowlAndSend(response, match, bowl, overNo, bowlNo, merge = false) {
  const overExists = Number.isInteger(overNo);
  const bowlExists = Number.isInteger(bowlNo);
  if ((overExists || bowlExists) && !(overExists && bowlExists)) {
    // provided either `overNo` or `bowlNo` but not both.
    throw new Error400([], 'Must provide either both `overNo` and `bowlNo` or none');
  }
  let prevBowl; // if `overNo` and `bowlNo` is not provided, then update the last bowl
  if (match.state === 'innings1') {
    const {overs} = match.innings1;
    overNo = overExists ? overNo : overs.length - 1; // eslint-disable-line no-param-reassign
    const {bowls} = overs[overNo];
    bowlNo = bowlExists ? bowlNo : bowls.length - 1; // eslint-disable-line no-param-reassign
    prevBowl = bowls[bowlNo];
  } else if (match.state === 'innings2') {
    const {overs} = match.innings2;
    overNo = overExists ? overNo : overs.length - 1; // eslint-disable-line no-param-reassign
    const {bowls} = overs[overNo];
    bowlNo = bowlExists ? bowlNo : bowls.length - 1; // eslint-disable-line no-param-reassign
    prevBowl = bowls[bowlNo];
  } else {
    throw new Error400([], 'State should be either innings 1 or innings 2');
  }
  if (!prevBowl) {
    throw new Error400([{
      location: 'body',
      param: 'bowlNo',
      value: bowlNo,
      overNo,
      msg: `There is no bowl at over ${overNo}, bowl ${bowlNo}`,
    }]);
  }

  const field = `${match.state}.overs.${overNo}.bowls.${bowlNo}`;
  const updatedBowl = {
    ...(merge && prevBowl),
    ...(!merge && {playedBy: prevBowl.playedBy}),
    ...bowl,
  };
  const updateQuery = {$set: {[field]: updatedBowl}};

  await Match.findByIdAndUpdate(match._id, updateQuery)
    .exec();
  response.json({
    success: true,
    innings: match.state,
    overIndex: overNo,
    bowlIndex: bowlNo,
    bowl: updatedBowl,
  });

  const amplitudeEvent = {
    match_id: match._id,
    innings: match.state,
    overIndex: overNo,
    bowlIndex: bowlNo,
  };
  Object.assign(amplitudeEvent, bowl);
  await Logger.amplitude(Events.Match.Bowl.Create, response.req.user._id, amplitudeEvent);
}

/**
 * Edits a bowl.
 * May or may not pass `overNo` and `bowlNo`. If not passed, last bowl is updated.
 */
router.put('/:id/bowl', [authenticateJwt(), bowlEditValidation], async (request, response) => {
  try {
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      throw new Error400(errors.array());
    }

    const matchId = request.params.id;
    const match = await Match
      .findOne({
        _id: matchId,
        creator: request.user._id,
      }).lean().exec();

    if (!match) {
      throw new Error404(responses.matches.get.err);
    }

    const {overNo, bowlNo, ...bowl} = nullEmptyValues(request);
    await _updateBowlAndSend(response, match, bowl, overNo, bowlNo);
  } catch (err) {
    sendErrorResponse(response, err, 'Error while updating bowl', request.user);
  }
});

/**
 * Edits the last bowl such that is was a by.
 * With *convenient* scoring UI, this API is not needed.
 * With *pro* scoring UI, a bowl is created upon any action (run, boundary, wicket).
 * Thus, to append a by run with that, a new API call is needed.
 */
router.put('/:id/by', [authenticateJwt(), byRunValidations], async (request, response) => {
  try {
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      throw new Error400(errors.array());
    }

    const {
      run, boundary, overNo, bowlNo,
    } = nullEmptyValues(request);
    const {id} = request.params;
    const match = await Match
      .findOne({
        _id: id,
        creator: request.user._id,
      })
      .select('state innings1 innings2')
      .lean()
      .exec();
    const bowl = !boundary ? {by: run} : {
      boundary: {
        run,
        kind: 'by',
      },
    };
    await _updateBowlAndSend(response, match, bowl, overNo, bowlNo, true);
  } catch (err) {
    sendErrorResponse(response, err, 'Error while updating bowl', request.user);
  }
});

/**
 * Adds a uncertain-wicket (Run out, Obstructing the field) to the last bowl.
 * With *convenient* scoring UI, this API is not needed.
 * With *pro* scoring UI, a bowl is created upon any action (run, boundary).
 * Thus, to append an uncertain wicket with that, a new API call is needed.
 */
router.put('/:id/uncertain-out', [authenticateJwt(), uncertainOutValidations], async (request, response) => {
  try {
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      throw new Error400(errors.array());
    }

    const {id} = request.params;
    const match = await Match
      .findOne({
        _id: id,
        creator: request.user._id,
      })
      .lean()
      .exec();

    // TODO: rename `batsman` param to `player`
    const {
      batsman, kind, overNo, bowlNo,
    } = nullEmptyValues(request);
    const bowl = {
      isWicket: {
        kind,
        player: batsman,
      },
    };
    await _updateBowlAndSend(response, match, bowl, overNo, bowlNo, true);
  } catch (err) {
    sendErrorResponse(response, err, 'Error while adding out', request.user);
  }
});

router.put('/:id/declare', authenticateJwt(), async (request, response) => {
  try {
    const {id} = request.params;
    const {state: nextState} = nullEmptyValues(request);

    const match = await Match
      .findOne({
        _id: id,
        creator: request.user._id,
      })
      .exec();
    if (!match) {
      throw new Error404(responses.matches.e404);
    }

    if (nextState && ['done', 'innings2'].indexOf(nextState) === -1) {
      throw new Error400('Next state must be either \'done\' or \'innings1\'');
    } else if (['innings1', 'innings2'].indexOf(match.state) === -1) {
      throw new Error400('State must be either \'innings1\' or \'innings1\'');
    }
    const updateState = {};
    if (nextState === 'innings2') {
      match.state = 'innings2';
      // prevent double initialization of `match.innings2`
      updateState.innings2 = match.innings2 ? match.innings2 : (match.innings2 = {overs: []});
    } else if (nextState === 'done') {
      match.state = 'done';
    } else if (match.state.toString() === 'innings1') {
      // legacy option that deals request without state parameter
      // not recommended
      match.state = 'innings2';
      match.innings2 = {overs: []};
      updateState.innings2 = match.innings2;
    } else {
      match.state = 'done';
    }
    updateState.state = match.state;
    await match.save();
    response.json(updateState);

    const amplitudeEvent = {match_id: match._id, ...updateState};
    await Logger.amplitude(Events.Match.Begin, request.user._id, amplitudeEvent);
  } catch (err) {
    sendErrorResponse(response, err, responses.matches.get.err, request.user);
  }
});

router.get('/done', authenticateJwt(), async (request, response) => {
  try {
    const query = {
      creator: request.user._id,
      state: 'done',
    };
    if (request.query.search) {
      query.name = new RegExp(request.query.search, 'i');
    }
    const matches = await Match
      .find(query)
      .lean()
      .exec();
    response.json(matches);
  } catch (err) {
    sendErrorResponse(response, err, responses.matches.index.err, request.user);
  }
});

/**
 *  GET matches listing.
 */
router.get('/', authenticateJwt(), async (request, response) => {
  try {
    const query = {
      creator: request.user._id,
      state: {$ne: 'done'},
    };
    if (request.query.search) {
      const regExp = new RegExp(request.query.search, 'i');
      query.$or = [{name: regExp}, {tags: regExp}];
    }
    const cursor = Match
      .find(query);
    if (request.query.compact) {
      cursor.select({innings1: 0, innings2: 0});
    }
    const matches = await cursor
      .lean()
      .exec();
    matches.forEach((match) => {
      // eslint-disable-next-line no-param-reassign
      match.tags = match.tags || [];
    }); // put a default value if `tags` field is absent
    response.json(matches);
  } catch (err) {
    sendErrorResponse(response, err, responses.matches.index.err, request.user);
  }
});

/**
 * GET tags listing.
 */
router.get('/tags', authenticateJwt(), async (request, response) => {
  try {
    const aggregation = await Match.aggregate()
      .match({creator: request.user._id})
      .group({
        _id: 0,
        tags: {$push: '$tags'},
      })
      .project({
        tags: {
          $reduce: {
            input: '$tags',
            initialValue: [],
            in: {$setUnion: ['$$value', '$$this']},
          },
        },
      })
      .exec();
    const tags = !aggregation || !aggregation.length ? {tags: []} : aggregation[0];
    response.json(tags.tags);
  } catch (err) {
    sendErrorResponse(response, err, responses.matches.tags.err, request.user);
  }
});

router.get('/:id', async (request, response) => {
  try {
    const match = await Match
      .findOne({_id: request.params.id})
      .populate('team1')
      .populate('team2')
      .populate('umpire1')
      .populate('umpire2')
      .populate('umpire3')
      .populate('team1Captain')
      .populate('team2Captain')
      .populate('team1Players')
      .populate('team2Players')
      .lean()
      .exec();
    // eslint-disable-next-line no-param-reassign
    match.tags = match.tags || []; // put a default value if `tags` field is absent
    response.json(match);
  } catch (err) {
    sendErrorResponse(response, err, responses.matches.get.err, request.user);
  }
});

/**
 * Create a new match
 */
router.post('/', authenticateJwt(), matchCreateValidations, async (request, response) => {
  try {
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      throw new Error400(errors.array(), responses.matches.create.err);
    }

    const params = nullEmptyValues(request);
    const {
      name, team1, team2, umpire1, umpire2, umpire3, overs, tags,
    } = params;

    const createdMatch = await Match.create({
      name: namify(name),
      team1,
      team2,
      umpire1,
      umpire2,
      umpire3,
      overs,
      tags,
      creator: request.user._id,
    });

    response
      .status(201)
      .json({
        success: true,
        message: responses.matches.create.ok(name),
        match: createdMatch,
      });

    await Logger.amplitude(Events.Match.Bowl.Create, response.req.user._id, createdMatch);
  } catch (err) {
    sendErrorResponse(response, err, responses.matches.create.err, request.user);
  }
});

router.put('/:id', authenticateJwt(), matchEditValidations, async (request, response) => {
  try {
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      throw new Error400(errors.array());
    }

    const {
      name, team1, team2, umpire1, umpire2, umpire3, overs, tags,
    } = request.body;

    const updatedMatch = await Match
      .findOneAndUpdate({
        _id: request.params.id,
        creator: request.user._id,
      }, {
        name: namify(name),
        team1,
        team2,
        umpire1,
        umpire2,
        umpire3,
        overs,
        tags,
      }, {new: true});

    if (!updatedMatch) {
      throw new Error404(responses.matches.get.err);
    }
    response.json({
      success: true,
      message: responses.matches.edit.ok(updatedMatch.name),
      match: pick(updatedMatch, ['_id', 'name', 'team1', 'team2', 'umpire1', 'umpire2', 'umpire3', 'overs', 'tags']),
    });
  } catch (err) {
    sendErrorResponse(response, err, responses.matches.edit.err, request.user);
  }
});

router.delete('/:id', authenticateJwt(), async (req, res) => {
  try {
    const deletedMatch = await Match.findOneAndDelete({
      _id: req.params.id,
      creator: req.user._id,
    })
      .select('name');
    if (!deletedMatch) {
      throw new Error404(responses.matches.get.err);
    }
    res.json({
      success: true,
      message: responses.matches.delete.ok(deletedMatch.name),
    });
  } catch (e) {
    sendErrorResponse(res, e, responses.matches.delete.err, req.user);
  }
});

module.exports = router;
