const express = require('express');

const router = express.Router();
const passport = require('passport');
const {check, body, validationResult} = require('express-validator/check');
const pick = require('lodash/pick');
const isMongoId = require('validator/lib/isMongoId');
const ObjectId = require('mongoose/lib/types/objectid');
const Match = require('../models/match');
const responses = require('../responses');
const {sendErrorResponse, send404Response, nullEmptyValues} = require('../lib/utils');
const {Error400, Error404} = require('../lib/errors');
const Logger = require('../lib/logger');
const Events = require('../events');
const {namify} = require('../lib/utils');


/** @type {RequestHandler} */
const authenticateJwt = passport.authenticate.bind(passport, 'jwt', {session: false});


const nameExistsValidation = check('name', 'A match name is required')
  .trim()
  .exists({checkFalsy: true});
const team1ExistsValidation = check('team1', 'Select a team')
  .isMongoId();
const team2ExistsValidation = check('team2', 'Select a team')
  .isMongoId();
const minimumOverValidation = check('overs', 'Overs must be greater than 0')
  .isInt({ min: 1 });
const genUmpireValidation = (umpireNumber) => {
  return check(`umpire${umpireNumber}`)
    .custom((umpire, {req}) => {
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

      return true;
    });
};
const getMatchByName = (name, creatorId) => Match
  .findOne({
    creator: creatorId,
    name: new RegExp(name, 'i'),
  })
  .exec();

const matchCreateValidations = [
  nameExistsValidation,
  team1ExistsValidation,
  team2ExistsValidation,
  genUmpireValidation(1),
  genUmpireValidation(2),
  genUmpireValidation(3),
  minimumOverValidation,
  check('name', 'Match Name already taken')
    .custom((name, {req}) => getMatchByName(namify(name), req.user._id)
      .then((match) => !match)),
  check('team1', 'Team 1 and Team 2 should be different.')
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
  check('name', 'Match Name already taken')
    .custom((name, {req}) => getMatchByName(name, req.user._id)
      .then((match) => !(match && match._id.toString() !== req.params.id))),
  check('team1', 'Team 1 and Team 2 should be different.')
    .custom((team1, {req}) => team1 !== req.body.team2),
];

const matchBeginValidations = [
  check('team1Players')
    .isArray(),
  check('team2Players')
    .isArray(),
  check('team1Captain', 'No captain selected')
    .isMongoId(),
  check('team1Captain', 'Must have at least two players')
    .custom((_, {req}) => {
      const {team1Players} = req.body;
      return team1Players && team1Players.length > 1;
    }),
  check('team1Captain', 'Captain should be a player from same team')
    .custom((team1Captain, {req}) => req.body.team1Players && req.body.team1Players.indexOf(team1Captain) !== -1),
  check('team2Captain', 'No captain selected')
    .isMongoId(),
  check('team2Captain', 'Must have at least two players')
    .custom((_, {req}) => {
      const {team2Players} = req.body;
      return team2Players && team2Players.length > 1;
    }),
  check('team2Captain', 'Captain should be a player from same team')
    .custom((team2Captain, {req}) => req.body.team2Players && req.body.team2Players.indexOf(team2Captain) !== -1),
];

const matchTossValidations = [
  check('won')
    .custom((won, {req}) => Match
      .findById(req.params.id)
      .exec()
      .then((match) => {
        if (!(won === match.team1.toString() || won === match.team2.toString())) {
          throw new Error('Select a team');
        }
        return true;
      })),
  check('choice')
    .isIn(['Bat', 'Bawl']),
];

const uncertainOutValidations = [
  check('batsman')
    .isInt({min: 0}),
  check('batsman')
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
        const lastOver = overs[overs.length - 1].bowls;
        const lastBowl = lastOver[lastOver.length - 1];

        if (lastBowl.isWicket && lastBowl.isWicket.kind) {
          const message = `Already a ${lastBowl.isWicket.kind} in this bowl. `
            + 'To input a bowl with only a run out or obstructing the field, '
            + 'input a bowl with 0 run first.';
          throw new Error(message);
        }

        return true;
      })),
  check('kind', '`kind` should be either run out or obstructing the field')
    .isIn(['Run out', 'Obstructing the field']),
];

const RUN_OUT = 'Run out';
const OBSTRUCTING_THE_FIELD = 'Obstructing the field';
const UNCERTAIN_WICKETS = [RUN_OUT, OBSTRUCTING_THE_FIELD];

const bowlValidations = [
  body('playedBy', '`playedBy` should be an integer')
    .optional({nullable: true})
    .isInt({min: 0}),
  body('isWicket')
    .optional({nullable: true})
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
  body('singles', '`singles` should be an integer')
    .optional({nullable: true})
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
    .optional({nullable: true})
    .isInt({min: 0}),
  body('legBy', '`legBy` should be an integer')
    .optional({nullable: true})
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
    .optional({nullable: true})
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
    .isBoolean(),
  body('isNo', '`isNo` should be a string')
    .optional({nullable: true})
    .isString(),
];

router.put('/:id/begin', authenticateJwt(), matchBeginValidations, (request, response) => {
  const errors = validationResult(request);
  const promise = errors.isEmpty() ? Promise.resolve() : Promise.reject({
    status: 400,
    errors: errors.array(),
  });
  const params = nullEmptyValues(request);
  const {
    team1Players, team1Captain, team2Players, team2Captain, state = 'toss',
  } = params;
  const {id} = request.params;

  promise
    .then(() => Match
      .findOne({
        _id: id,
        creator: request.user._id,
      })
      .exec())
    .then((match) => {
      if (!match) {
        return send404Response(response, responses.matches.e404);
      }

      match.set({
        team1Captain,
        team2Captain,
        team1Players,
        team2Players,
        state,
      });

      return match.save();
    })
    .then((match) => match.populate('team1Captain')
      .populate('team2Captain')
      .populate('team1Players')
      .populate('team2Players')
      .execPopulate())
    .then((match) => {
      Logger.amplitude(Events.Match.Begin, request.user._id, {
        match_id: match._id,
        team1Captain,
        team2Captain,
        team1Players,
        team2Players,
        state,
      });

      return response.json({
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
    })
    .catch((err) => sendErrorResponse(response, err, responses.matches.begin.err, request.user));
});

router.put('/:id/toss', authenticateJwt(), matchTossValidations, (request, response) => {
  const errors = validationResult(request);
  const promise = errors.isEmpty() ? Promise.resolve() : Promise.reject({
    status: 400,
    errors: errors.array(),
  });
  const params = nullEmptyValues(request);

  const {won, choice, state = 'innings1'} = params;
  const {id} = request.params;

  promise
    .then(() => Match
      .findOne({
        _id: id,
        creator: request.user._id,
      })
      .exec())
    .then((match) => {
      if (!match) {
        throw new Error404(responses.matches.e404);
      }
      match.team1WonToss = match.team1.toString() === won;
      match.team1BatFirst = (match.team1WonToss && choice === 'Bat') || (!match.team1WonToss && choice === 'Bawl');
      match.state = state;
      match.innings1 = {overs: []};
      return match.save();
    })
    .then((match) => {
      const amplitudeEvent = pick(match.toObject(), ['team1WonToss', 'team1BatFirst', 'state']);
      Object.assign(amplitudeEvent, {won, choice, state});
      Logger.amplitude(Events.Match.Begin, request.user._id, amplitudeEvent);

      return response.json({
        success: true,
        message: responses.matches.toss.ok,
        match: {
          team1WonToss: match.team1WonToss,
          team1BatFirst: match.team1BatFirst,
          state: 'innings1',
          innings1: {overs: []},
        },
      });
    })
    .catch((err) => sendErrorResponse(response, err, responses.matches.toss.err, request.user));
});

router.put('/:id/declare', authenticateJwt(), (request, response) => {
  const {id} = request.params;
  const {state: nextState} = nullEmptyValues(request);

  let match;
  Match
    .findOne({
      _id: id,
      creator: request.user._id,
    })
    .exec()
    .then((_match) => {
      if (!_match) {
        throw new Error404(responses.matches.e404);
      }
      match = _match;
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
        updateState.innings2 = match.innings2 = {overs: []};
      } else {
        match.state = 'done';
      }
      updateState.state = match.state;
      return Promise.all([updateState, match.save()]);
    })
    .then(([updateState]) => {
      const amplitudeEvent = {match_id: match._id, ...updateState};
      Logger.amplitude(Events.Match.Begin, request.user._id, amplitudeEvent);

      return response.json(updateState);
    })
    .catch((err) => sendErrorResponse(response, err, responses.matches.get.err, request.user));
});

router.post('/:id/bowl', authenticateJwt(), bowlValidations, (request, response) => {
  const errors = validationResult(request);
  const matchId = request.params.id;
  const promise = errors.isEmpty() ? Match
    .findOne({
      _id: matchId,
      creator: request.user._id,
    }).exec() : Promise.reject({
    status: 400,
    errors: errors.array(),
  });
  const bowl = nullEmptyValues(request);

  let match;
  promise
    .then((_match) => {
      match = _match;
      let updateQuery;
      if (match.state === 'innings1') {
        updateQuery = {$push: {[`innings1.overs.${match.innings1.overs.length - 1}.bowls`]: bowl}};
      } else if (match.state === 'innings2') {
        updateQuery = {$push: {[`innings2.overs.${match.innings2.overs.length - 1}.bowls`]: bowl}};
      } else {
        const error = {status: 400, message: `Cannot add bowl in state ${match.state}`};
        throw error;
      }
      return match.update(updateQuery)
        .exec();
    })
    .then(() => {
      const innings = match[match.state];
      const amplitudeEvent = {
        match_id: match._id,
        overIndex: innings.overs.length - 1,
        bowlIndex: innings.overs[innings.overs.length - 1].bowls.length,
      };
      Object.assign(amplitudeEvent, bowl);
      Logger.amplitude(Events.Match.Bowl.Create, request.user._id, amplitudeEvent);

      return response.json({success: true});
    })
    .catch((err) => sendErrorResponse(response, err, 'Error while saving bowl', request.user));
});

router.put('/:id/bowl', authenticateJwt(), (request, response) => {
  const errors = validationResult(request);
  const matchId = request.params.id;
  const promise = errors.isEmpty() ? Match
    .findOne({
      _id: matchId,
      creator: request.user._id,
    }).lean().exec() : Promise.reject({
    status: 400,
    errors: errors.array(),
  });

  const {bowl, overNo, bowlNo} = nullEmptyValues(request);
  promise
    .then((match) => _updateBowlAndSend(match, bowl, response, overNo, bowlNo))
    .catch((err) => sendErrorResponse(response, err, 'Error while updating bowl', request.user));
});

const _updateBowlAndSend = (match, bowl, response, overNo, bowlNo) => {
  const overExists = Number.isInteger(overNo);
  const bowlExists = Number.isInteger(bowlNo);
  if ((overExists || bowlExists) && !(overExists && bowlExists)) {
    // provided either `overNo` or `bowlNo` but not both.
    return sendErrorResponse(
      response,
      {statusCode: 400},
      'Must provide either both `overNo` and `bowlNo` or none',
    );
  }
  let field;
  let prevBowl; // if `overNo` and `bowlNo` is not provided, then update the last bowl
  if (match.state === 'innings1') {
    const {overs} = match.innings1;
    overNo = overExists ? overNo : overs.length - 1;
    const {bowls} = overs[overNo];
    bowlNo = bowlExists ? bowlNo : bowls.length - 1;
    prevBowl = bowls[bowlNo];
    field = `innings1.overs.${overNo}.bowls.${bowlNo}`;
  } else if (match.state === 'innings2') {
    const {overs} = match.innings2;
    overNo = overExists ? overNo : overs.length - 1;
    const {bowls} = overs[overNo];
    bowlNo = bowlExists ? bowlNo : bowls.length - 1;
    prevBowl = bowls[bowlNo];
    field = `innings2.overs.${overNo}.bowls.${bowlNo}`;
  } else {
    return sendErrorResponse(response, {statusCode: 400}, 'State should be either innings 1 or innings 2');
  }
  const updateQuery = {$set: {[field]: {...prevBowl, ...bowl}}};

  return Match.findByIdAndUpdate(match._id, updateQuery)
    .exec()
    .then(() => {
      const innings = match[match.state];
      const amplitudeEvent = {
        match_id: match._id,
        overIndex: innings.overs.length - 1,
        bowlIndex: innings.overs[innings.overs.length - 1].bowls.length,
      };
      Object.assign(amplitudeEvent, bowl);
      Logger.amplitude(Events.Match.Bowl.Create, response.req.user._id, amplitudeEvent);

      return response.json({
        success: true,
        bowl,
      });
    });
};

router.put('/:id/by', authenticateJwt(), (request, response) => {
  const {
    run, boundary, overNo, bowlNo,
  } = nullEmptyValues(request);
  const {id} = request.params;
  Match
    .findOne({
      _id: id,
      creator: request.user._id,
    }, 'state innings1 innings2')
    .lean()
    .exec()
    .then((match) => {
      const bowl = !boundary ? {by: run} : {
        boundary: {
          run,
          kind: 'by',
        },
      };
      return _updateBowlAndSend(match, bowl, response, overNo, bowlNo);
    })
    .catch((err) => sendErrorResponse(response, err, 'Error while updating bowl', request.user));
});

router.put('/:id/uncertain-out', uncertainOutValidations, authenticateJwt(), (request, response) => {
  const {id} = request.params;
  const errors = validationResult(request);
  const promise = errors.isEmpty()
    ? Match
      .findOne({
        _id: id,
        creator: request.user._id,
      })
      .lean()
      .exec()
    : Promise.reject({
      status: 400,
      errors: errors.array(),
    });

  promise
    .then((match) => {
      const {
        batsman, kind, overNo, bowlNo,
      } = nullEmptyValues(request);
      const bowl = {
        isWicket: {
          kind,
          player: batsman,
        },
      };
      return _updateBowlAndSend(match, bowl, response, overNo, bowlNo);
    })
    .catch((err) => sendErrorResponse(response, err, 'Error while adding out', request.user));
});

router.put('/:id', authenticateJwt(), matchEditValidations, (request, response) => {
  const errors = validationResult(request);
  const promise = errors.isEmpty() ? Promise.resolve() : Promise.reject({
    status: 400,
    errors: errors.array(),
  });
  const {
    name, team1, team2, umpire1, umpire2, umpire3, overs, tags,
  } = request.body;

  promise
    .then(() => Match
      .findOneAndUpdate({
        _id: ObjectId(request.params.id),
        creator: request.user._id,
      }, {
        name,
        team1,
        team2,
        umpire1,
        umpire2,
        umpire3,
        overs,
        tags,
      }, {new: true}))
    .then((updatedMatch) => {
      if (!updatedMatch) {
        return send404Response(response, responses.matches.get.err);
      }
      return response.json({
        success: true,
        message: responses.matches.edit.ok(name),
        match: pick(updatedMatch, ['_id', 'name', 'team1', 'team2', 'umpire1', 'umpire2', 'umpire3', 'overs', 'tags']),
      });
    })
    .catch((err) => sendErrorResponse(response, err, responses.matches.edit.err, request.user));
});

router.post('/:id/over', authenticateJwt(), (request, response) => {
  const over = nullEmptyValues(request);
  over.bowls = [];
  const {id} = request.params;

  let match;
  Match
    .findOne({
      _id: id,
      creator: request.user._id,
    })
    .then((_match) => {
      match = _match;
      let updateQuery;
      if (match.state === 'innings1') {
        updateQuery = {$push: {'innings1.overs': over}};
      } else if (match.state === 'innings2') {
        updateQuery = {$push: {'innings2.overs': over}};
      } else {
        return response.status(400)
          .json({
            success: false,
            message: `Can't add over in state ${match.state}`,
          });
      }
      return match.update(updateQuery)
        .exec();
    })
    .then(() => {
      const innings = match[match.state];
      const amplitudeEvent = {
        match_id: match._id,
        overIndex: innings.overs.length,
      };
      Logger.amplitude(Events.Match.Over, response.req.user._id, amplitudeEvent);

      return response.json({success: true});
    })
    .catch((err) => sendErrorResponse(response, err, 'Error while saving over', request.user));
});

router.get('/done', authenticateJwt(), (request, response) => {
  const query = {
    creator: request.user._id,
    state: 'done',
  };
  if (request.query.search) {
    query.name = new RegExp(request.query.search, 'i');
  }
  Match
    .find(query)
    .lean()
    .then((matches) => response.json(matches))
    .catch((err) => sendErrorResponse(response, err, responses.matches.index.err, request.user));
});

/* GET tags listing. */
router.get('/tags', authenticateJwt(), (request, response) => {
  Match.aggregate()
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
    .exec()
    .then((aggregation) => {
      const tags = !(aggregation && aggregation.length) ? {tags: []} : aggregation[0];
      return response.json(tags.tags);
    })
    .catch((err) => sendErrorResponse(response, err, responses.matches.tags.err, request.user));
});

router.get('/:id', (request, response) => {
  Match
    .findOne({_id: request.params.id})
    .populate('team1')
    .populate('team2')
    .populate('team1Captain')
    .populate('team2Captain')
    .populate('team1Players')
    .populate('team2Players')
    .lean()
    .exec()
    .then((match) => {
      match.tags = match.tags || []; // put a default value if `tags` field is absent
      return match;
    })
    .then((match) => response.json(match))
    .catch((err) => sendErrorResponse(response, err, responses.matches.get.err, request.user));
});

/* GET matches listing. */
router.get('/', authenticateJwt(), (request, response) => {
  const query = {
    creator: request.user._id,
    state: {$ne: 'done'},
  };
  if (request.query.search) {
    const regExp = new RegExp(request.query.search, 'i');
    query.$or = [{name: regExp}, {tags: regExp}];
  }
  Match
    .find(query)
    .lean()
    .exec()
    .then((matches) => {
      matches.forEach((match) => {
        // eslint-disable-next-line no-param-reassign
        match.tags = match.tags || [];
      }); // put a default value if `tags` field is absent
      return matches;
    })
    .then((matches) => response.json(matches))
    .catch((err) => sendErrorResponse(response, err, responses.matches.index.err, request.user));
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

    Logger.amplitude(Events.Match.Bowl.Create, response.req.user._id, createdMatch);

    response
      .status(201)
      .json({
        success: true,
        message: responses.matches.create.ok(name),
        match: createdMatch,
      });
  } catch (err) {
    sendErrorResponse(response, err, responses.matches.create.err, request.user);
  }
});

module.exports = router;
