const express = require('express');
const router = express.Router();
const Player = require('../models/player');
const Match = require('../models/match');
const responses = require('../responses');
const passport = require('passport');
const { check, validationResult } = require('express-validator/check');
const ObjectId = require('mongoose/lib/types/objectid');
const { send404Response } = require('../lib/utils');
const { namify, sendErrorResponse } = require('../lib/utils');

/** @type {RequestHandler} */
const authenticateJwt = passport.authenticate.bind(passport, 'jwt', { session: false });

const nameExistsValidation = check('name', 'Name should not be empty')
  .trim()
  .exists({ checkFalsy: true });
const jerseyNoInRangeValidation = check('jerseyNo', 'Jersey number should be between 0 to 999')
  .isInt({
    min: 0,
    max: 999,
  });
const playerCreateValidations = [
  nameExistsValidation,
  jerseyNoInRangeValidation,
  check('name', 'Player Name already taken')
    .custom((name, { req }) => Player
      .findOne({
        name: namify(name),
        creator: req.user._id,
      })
      .exec()
      .then(player => !player)),
  check('jerseyNo', 'This jersey is already taken')
    .custom((jerseyNo, { req }) => Player
      .findOne({
        jerseyNo: jerseyNo,
        creator: req.user._id,
      })
      .exec()
      .then(player => !player)),
];

const playerEditValidations = [
  nameExistsValidation,
  jerseyNoInRangeValidation,
  check('name', 'Player Name already taken')
    .custom((name, { req }) => Player
      .findOne({
        name: namify(name),
        creator: req.user._id,
      })
      .lean()
      .exec()
      .then(player => !(player && player._id.toString() !== req.params.id))),
  check('jerseyNo')
    .custom((jerseyNo, { req }) => Player
      .findOne({
        jerseyNo: jerseyNo,
        creator: req.user._id,
      })
      .lean()
      .exec()
      .then(player => !(player && player._id.toString() !== req.params.id))),
];

const playerGetValidations = [
  check('id', 'Must be a valid id')
    .isMongoId(),
];

/* GET players listing. */
router.get('/', authenticateJwt(), (request, response) => {
  let query;
  if (request.query.search) {
    const regExp = new RegExp(request.query.search, 'i');
    query = Player.aggregate()
      .match({ creator: request.user._id })
      .addFields({ jerseyString: { $toLower: '$jerseyNo' } })
      .match({ $or: [{ name: regExp }, { jerseyString: regExp }] })
      .exec();
  } else {
    query = Player.find({ creator: request.user._id })
      .lean()
      .exec();
  }

  query
    .then(players => response.json(players))
    .catch(err => sendErrorResponse(response, err, responses.players.index.err));
});

/**
 * Get run, numBowl and strikeRate of a particular innings
 * @typedef {Array<{singles, boundary}>} Over
 * @param {Array<Over>} battingInnings
 * @returns {run, numBowl, strikeRate}
 * @private
 */
function _getBattingInningsStats(battingInnings) {
  return battingInnings.map(over => {
    const run = over.reduce((run, bowl) => {
      run += bowl.singles;
      if (bowl.boundary.kind === 'regular' && Number.isInteger(bowl.boundary.run)) {
        run += bowl.boundary.run;
      }
      return run;
    }, 0);
    const numBowl = over.length;
    const strikeRate = run / numBowl;
    return {
      run,
      numBowl,
      strikeRate,
    };
  });
}

/**
 * Get run, wicket and totalBowl of all inningses
 * @typedef {{bowls: {Array}}} Over
 * @typedef {Array<Over>} Innings
 * @param {Array<Innings>} bowlingInningses
 * @returns {{ run, wicket, totalBowl }}
 * @private
 */
function _getBowlingInningsStats(bowlingInningses) {
  return bowlingInningses.map(innings => {
    let run = 0, wicket = 0, totalBowl = 0;
    for (const over of innings) {
      let overRun = 0, overWicket = 0;
      for (const bowl of over.bowls) {
        // assuming bowling strike rate counts wide and no bowls
        const isWicket = bowl.isWicket && bowl.isWicket.kind
          && (bowl.isWicket.kind.toLowerCase() !== 'run out')
          && (bowl.isWicket.kind.toLowerCase() !== 'run-out');

        isWicket && overWicket++;
        bowl.singles && (overRun += bowl.singles);
        bowl.by && (overRun += bowl.by);
        bowl.legBy && (overRun += bowl.legBy);
        bowl.boundary.run && (overRun += bowl.boundary.run);
        (bowl.isWide || bowl.isNo) && overRun++;
      }

      run += overRun;
      wicket += overWicket;
      totalBowl += over.bowls.length;
    }

    return {
      run,
      wicket,
      totalBowl,
    };
  });
}

function _getBattingCareerStat(battingInningsStats, numOuts) {
  const numInningsBatted = battingInningsStats.length;
  const highestRun = battingInningsStats.reduce((hr, innings) => (hr > innings.run) ? hr : innings.run, 0);
  const totalRun = battingInningsStats.reduce((tr, innings) => tr + innings.run, 0);
  const avgRun = totalRun / numOuts;
  const battingStrikeRate = battingInningsStats.reduce((sr, innings) => sr + innings.strikeRate, 0) / numInningsBatted * 100;
  return {
    numInningsBatted,
    highestRun,
    totalRun,
    avgRun,
    battingStrikeRate,
  };
}

function _getBowlingCareerStat(bowlingInningsStats) {
  const numInningsBowled = bowlingInningsStats.length;
  const bestFigure = bowlingInningsStats.reduce(([wicket, run], innings) => {
    if (innings.wicket > wicket) {
      return [innings.wicket, innings.run];
    }
    if ((innings.wicket === wicket) && (innings.run < run)) {
      return [innings.wicket, innings.run];
    }
    return [wicket, run];
  }, [0, Number.POSITIVE_INFINITY]);
  const totalWickets = bowlingInningsStats.reduce((tw, innings) => tw + innings.wicket, 0);
  const totalConcededRuns = bowlingInningsStats.reduce((tcr, innings) => tcr + innings.run, 0);
  const totalBowls = bowlingInningsStats.reduce((tb, innings) => tb + innings.totalBowl, 0);
  const avgWicket = totalConcededRuns / totalWickets;
  const bowlingStrikeRate = totalBowls / totalWickets;
  return {
    numInningsBowled,
    bestFigure,
    totalWickets,
    avgWicket,
    bowlingStrikeRate,
  };
}

/* GET stat of a player */
router.get('/:id', authenticateJwt(), playerGetValidations, (request, response) => {
  const playerId = request.params.id;
  let player;
  const cond = {
    $and: [
      {
        $or: [
          { team1Players: playerId },
          { team2Players: playerId },
        ],
      },
      { state: 'done' },
      { creator: request.user._id },
    ],
  };
  Promise.all([
    Match.find(cond)
      .lean()
      .exec(),
    Player.findById(playerId)
      .lean()
      .exec(),
  ])
  // get the innings in which player with `playerId` has played
    .then(([matches, _player]) => {
      player = _player;
      return matches.map(match => {
        const team1Index = match.team1Players.map(playerId => playerId.toString())
          .indexOf(playerId);
        if (team1Index !== -1) {
          const [battingInnings, bowlingInnings] = match.team1BatFirst
            ? [match.innings1, match.innings2]
            : [match.innings2, match.innings1];
          return {
            battingInnings,
            bowlingInnings,
            playerIndex: team1Index,
          };
        } else {
          const team2Index = match.team2Players.map(playerId => playerId.toString())
            .indexOf(playerId);
          if (team2Index === -1) {
            throw new Error('Error in player stat query');
          }
          const [battingInnings, bowlingInnings] = match.team1BatFirst
            ? [match.innings2, match.innings1]
            : [match.innings1, match.innings2];
          return {
            battingInnings,
            bowlingInnings,
            playerIndex: team1Index,
          };
        }
      });
    })
    // get the bowls of inningses he/she played
    .then(matches => {
      let numOuts = 0;
      const matchWiseBattedBowls = matches.map((match) => {
        return match.battingInnings.overs.reduce((bowls, over) => {
          const filteredBowls = over.bowls.filter(bowl => bowl.playedBy === match.playerIndex);

          // `numOuts` needed to be calculated here
          // because a player can be out in a bowl he/she didn't played
          const isOut = over.bowls.find(bowl => {
            return bowl.isWicket && Number.isInteger(bowl.isWicket.player) && (bowl.isWicket.player === match.playerIndex);
          });
          if (isOut) {
            numOuts++;
          } else if (filteredBowls.find(bowl => bowl.isWicket && !Number.isInteger(bowl.isWicket.player))) {
            // it is a bowl where only on-crease batsman can get out
            numOuts++;
          }

          bowls.push(...filteredBowls);
          return bowls;
        }, []);
      });
      const matchWiseBowledOvers = matches.map(match => {
        return match.bowlingInnings.overs.filter(over => over.bowledBy === match.playerIndex);
      });
      return {
        numOuts,
        matchWiseBattedBowls,
        matchWiseBowledOvers,
      };
    })
    // calculate stat of each innings
    .then(({ numOuts, matchWiseBattedBowls, matchWiseBowledOvers }) => {
      // filter battingInningses whether he/she played
      const battingInningses = matchWiseBattedBowls.filter(innings => innings.length);
      const battingInningsStats = _getBattingInningsStats(battingInningses);

      const bowlingInningses = matchWiseBowledOvers.filter(innings => innings.length);
      const bowlingInningsStats = _getBowlingInningsStats(bowlingInningses);

      return {
        numMatch: matchWiseBattedBowls.length, // same as `matchWiseBowledOvers.length`
        numOuts,
        battingInningsStats,
        bowlingInningsStats,
      };
    })
    // generate the stat
    .then(({ numMatch, numOuts, battingInningsStats, bowlingInningsStats }) => {
      const { numInningsBatted, highestRun, totalRun, avgRun, battingStrikeRate } = _getBattingCareerStat(battingInningsStats, numOuts);

      const { numInningsBowled, bestFigure, totalWickets, avgWicket, bowlingStrikeRate } = _getBowlingCareerStat(bowlingInningsStats);

      return response.json({
        success: true,
        message: responses.players.stat.ok(player.name),
        stat: {
          numMatch,
          bat: {
            numInnings: numInningsBatted,
            totalRun,
            avgRun,
            highestRun,
            strikeRate: battingStrikeRate,
          },
          bowl: {
            numInnings: numInningsBowled,
            totalWickets,
            avgWicket,
            bestFigure: {
              wicket: bestFigure[0],
              run: bestFigure[1],
            },
            strikeRate: bowlingStrikeRate,
          },
        },
        player,
      });
    })
    .catch(err => sendErrorResponse(response, err, responses.players.create.err));
});

/* Create a new player */
router.post('/', authenticateJwt(), playerCreateValidations, (request, response) => {
  const errors = validationResult(request);
  const promise = errors.isEmpty() ? Promise.resolve() : Promise.reject({
    status: 400,
    errors: errors.array(),
  });
  const { name, jerseyNo } = request.body;

  promise
    .then(() => Player.create({
      name: namify(name),
      jerseyNo,
      creator: request.user._id,
    }))
    .then(createdPlayer => {
      return response.json({
        success: true,
        message: responses.players.create.ok(name),
        player: {
          _id: createdPlayer._id,
          name: createdPlayer.name,
          jerseyNo: createdPlayer.jerseyNo,
        },
      });
    })
    .catch(err => sendErrorResponse(response, err, responses.players.create.err));
});

/* Edit an existing player */
router.put('/:id', authenticateJwt(), playerEditValidations, (request, response) => {
  const errors = validationResult(request);
  const promise = errors.isEmpty() ? Promise.resolve() : Promise.reject({
    status: 400,
    errors: errors.array(),
  });
  const { name, jerseyNo } = request.body;

  promise
    .then(() => {
      return Player
        .findOneAndUpdate({
          _id: ObjectId(request.params.id),
          creator: request.user._id,
        }, {
          name: namify(name),
          jerseyNo,
          creator: request.user._id,
        }, { new: true });
    })
    .then(editedPlayer => {
      if (!editedPlayer) {
        return send404Response(response, responses.players.get.err);
      }
      return response.json({
        success: true,
        message: responses.players.edit.ok(name),
        player: {
          _id: editedPlayer._id,
          name: editedPlayer.name,
          jerseyNo: editedPlayer.jerseyNo,
        },
      });
    })
    .catch(err => sendErrorResponse(response, err, responses.players.edit.err));
});

module.exports = router;
