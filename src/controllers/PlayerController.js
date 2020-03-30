const express = require('express');

const router = express.Router();
const passport = require('passport');
const {check, validationResult} = require('express-validator/check');
const ObjectId = require('mongoose/lib/types/objectid');
const Player = require('../models/player');
const Match = require('../models/match');
const responses = require('../responses');
const {namify, sendErrorResponse} = require('../lib/utils');
const {Error400, Error404} = require('../lib/errors');

/** @type {RequestHandler} */
const authenticateJwt = passport.authenticate.bind(passport, 'jwt', {session: false});

const nameExistsValidation = check('name', 'Name should not be empty')
  .trim()
  .exists({checkFalsy: true});
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
      .then((player) => !player)),
  check('jerseyNo', 'This jersey is already taken')
    .custom((jerseyNo, {req}) => Player
      .findOne({
        jerseyNo,
        creator: req.user._id,
      })
      .exec()
      .then((player) => !player)),
];

const validMongoIdValidation = check('id', 'Must be a valid id')
  .isMongoId();

const playerEditValidations = [
  validMongoIdValidation,
  nameExistsValidation,
  jerseyNoInRangeValidation,
  check('name', 'Player Name already taken')
    .custom((name, {req}) => Player
      .findOne({
        name: namify(name),
        creator: req.user._id,
      })
      .lean()
      .exec()
      .then((player) => !(player && player._id.toString() !== req.params.id))),
  check('jerseyNo')
    .custom((jerseyNo, {req}) => Player
      .findOne({
        jerseyNo,
        creator: req.user._id,
      })
      .lean()
      .exec()
      .then((player) => !(player && player._id.toString() !== req.params.id))),
];
const playerGetValidations = [
  validMongoIdValidation,
];

const playerDeleteValidations = [
  validMongoIdValidation,
];

/**
 * Get run, numBowl and strikeRate of a particular innings
 * @typedef {Array<{singles, boundary}>} Over
 * @typedef {{run, numBowl, strikeRate}} BattingStat
 * @param {Array<Over>} battingInnings
 * @returns {BattingStat[]}
 * @private
 */
function _getBattingInningsStats(battingInnings) {
  return battingInnings.map((over) => {
    const run = over.reduce(
      (_run, bowl) => (_run + bowl.singles + Number.isInteger(bowl.boundary.run) ? bowl.boundary.run : 0),
      0,
    );
    const numBowl = over.length;
    const strikeRate = run / numBowl;
    return {run, numBowl, strikeRate};
  });
}

/** @typedef {{kind: string, player: number|undefined}} IsWicket */
/** @typedef {{playedBy: number, isBoundary: {run: number, kind: string}, isWicket: IsWicket}} Bowl */
/** @typedef {Bowl[]} Over */
/** @typedef {Over[]} Innings */

/** @typedef {{ run, wicket, totalBowl }} BowlingStat */

/**
 * Get run, wicket and totalBowl of all inningses
 * @param {Array<Innings>} bowlingInningses
 * @returns {BowlingStat[]}
 * @private
 */
function _getBowlingInningsStats(bowlingInningses) {
  return bowlingInningses.map((innings) => {
    let run = 0; let wicket = 0; let
      totalBowl = 0;
    for (const over of innings) {
      let overRun = 0; let
        overWicket = 0;
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
  const highestRun = battingInningsStats.reduce((hr, innings) => ((hr > innings.run) ? hr : innings.run), 0);
  const totalRun = battingInningsStats.reduce((tr, innings) => tr + innings.run, 0);
  const avgRun = totalRun / numOuts;
  const sumOfBattingStrikeRate = battingInningsStats.reduce((sr, innings) => sr + innings.strikeRate, 0);
  const battingStrikeRate = (sumOfBattingStrikeRate / numInningsBatted) * 100;
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

/* GET players listing. */
router.get('/', authenticateJwt(), (request, response) => {
  let query;
  if (request.query.search) {
    const regExp = new RegExp(request.query.search, 'i');
    query = Player.aggregate()
      .match({creator: request.user._id, isDeleted: false})
      .addFields({jerseyString: {$toLower: '$jerseyNo'}})
      .match({$or: [{name: regExp}, {jerseyString: regExp}]})
      .exec();
  } else {
    query = Player.find({creator: request.user._id, isDeleted: false})
      .lean()
      .exec();
  }

  query
    .then((players) => response.json(players))
    .catch((err) => sendErrorResponse(response, err, responses.players.index.err));
});

/* GET stat of a player */
router.get('/:id', [authenticateJwt(), playerGetValidations], async (request, response) => {
  try {
    const playerId = request.params.id;
    const cond = {
      $and: [
        {
          $or: [
            {team1Players: playerId},
            {team2Players: playerId},
          ],
        },
        {state: 'done'},
        {creator: request.user._id},
      ],
    };

    const [matchesOfPlayer, player] = await Promise.all([
      Match.find(cond)
        .lean()
        .exec(),
      Player.findById(playerId)
        .lean()
        .exec(),
    ]);

    // get the innings in which player with `playerId` has contributed (batted or bowled)
    /** @typedef {{battingInnings, bowlingInnings, playerIndex}} Contribution */
    /** @type {Contribution[]} */
    const matchesOfContribution = matchesOfPlayer.map((match) => {
      const team1Index = match.team1Players.map((_playerId) => _playerId.toString())
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
      }
      const team2Index = match.team2Players.map((_playerId) => _playerId.toString())
        .indexOf(playerId);
      if (team2Index === -1) {
        throw new Error('Error in player stat query. '
          + `Player ${player.name}(${player._id}) haven't played in match ${match.name}(${match._id}).`);
      }
      const [battingInnings, bowlingInnings] = match.team1BatFirst
        ? [match.innings2, match.innings1]
        : [match.innings1, match.innings2];
      return {
        battingInnings,
        bowlingInnings,
        playerIndex: team2Index,
      };
    });

    // get the bowls of inningses he/she played
    let numOuts = 0;
    /** @type {Bowl[][]} */
    const matchWiseBattedBowls = matchesOfContribution.map(
      (match) => match.battingInnings.overs.reduce((bowls, over) => {
        // iterating each over of his batting innings
        const onCreaseBowls = over.bowls.filter((bowl) => bowl.playedBy === match.playerIndex);

        /** @type (Bowl) => Boolean */
        const outFilter = ({playedBy, isWicket}) => {
          if (!isWicket || !isWicket.kind) {
            return false;
          }
          if (Number.isInteger(isWicket.player)) {
            // it is an uncertain-wicket
            return isWicket.player === match.playerIndex;
          }
          return playedBy === match.playerIndex;
        };
        // `numOuts` needed to be calculated here
        // because a player can be out in a bowl he/she didn't played
        const isOut = !!over.bowls.find(outFilter);
        isOut && numOuts++;

        bowls.push(...onCreaseBowls);
        return bowls;
      }, []),
    );

    const matchWiseBowledOvers = matchesOfContribution.map(
      (match) => match.bowlingInnings.overs.filter((over) => over.bowledBy === match.playerIndex),
    );

    // calculate stat of each innings
    // filter battingInningses whether he/she played
    const battingInningses = matchWiseBattedBowls.filter((innings) => innings.length);
    const battingInningsStats = _getBattingInningsStats(battingInningses);

    const bowlingInningses = matchWiseBowledOvers.filter((innings) => innings.length);
    const bowlingInningsStats = _getBowlingInningsStats(bowlingInningses);
    const numMatch = matchWiseBattedBowls.length; // same as `matchWiseBowledOvers.length`

    const {
      numInningsBatted, highestRun, totalRun, avgRun, battingStrikeRate,
    } = _getBattingCareerStat(battingInningsStats, numOuts);

    const {
      numInningsBowled, bestFigure, totalWickets, avgWicket, bowlingStrikeRate,
    } = _getBowlingCareerStat(bowlingInningsStats);

    // generate the stat
    response.json({
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
  } catch (err) {
    sendErrorResponse(response, err, responses.players.get.err);
  }
});

/* Create a new player */
router.post('/', [authenticateJwt(), playerCreateValidations], async (request, response) => {
  try {
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      throw new Error400(errors.array(), responses.players.create.err);
    }

    const {name, jerseyNo} = request.body;

    const createdPlayer = await Player.create({
      name: namify(name),
      jerseyNo,
      creator: request.user._id,
    });

    response.status(201).json({
      success: true,
      message: responses.players.create.ok(name),
      player: {
        _id: createdPlayer._id,
        name: createdPlayer.name,
        jerseyNo: createdPlayer.jerseyNo,
      },
    });
  } catch (err) {
    sendErrorResponse(response, err, responses.players.create.err);
  }
});

/* Edit an existing player */
router.put('/:id', [authenticateJwt(), playerEditValidations], async (request, response) => {
  try {
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      throw new Error400(errors.array());
    }
    const {name, jerseyNo} = request.body;

    const editedPlayer = await Player
      .findOneAndUpdate({
        _id: ObjectId(request.params.id),
        creator: request.user._id,
      }, {
        name: namify(name),
        jerseyNo,
        creator: request.user._id,
      }, {new: true})
      .lean();

    if (!editedPlayer) {
      throw new Error404(responses.players.get.err);
    }

    response.json({
      success: true,
      message: responses.players.edit.ok(name),
      player: {
        _id: editedPlayer._id,
        name: editedPlayer.name,
        jerseyNo: editedPlayer.jerseyNo,
      },
    });
  } catch (e) {
    sendErrorResponse(response, e, responses.players.edit.err);
  }
});

router.delete('/:id', [authenticateJwt(), playerDeleteValidations], async (request, response) => {
  try {
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      throw new Error400(errors.array(), responses.players.delete.err);
    }

    const deletedPlayer = await Player.findOneAndUpdate({
      _id: ObjectId(request.params.id),
      creator: request.user._id,
    }, {isDeleted: true});

    if (!deletedPlayer) {
      throw new Error404(responses.players.delete.err);
    }

    response.json({
      success: true,
      message: responses.players.delete.ok(deletedPlayer.name),
    });
  } catch (err) {
    sendErrorResponse(response, err, responses.players.delete.err);
  }
});

module.exports = router;
