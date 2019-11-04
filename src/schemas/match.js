/**
 * Parvez M Robin
 * parvezmrobin@gmail.com
 * Date: Mar 31, 2019
 */


const { Schema } = require('mongoose');
const schemaOptions = require('./schemaOptions');


const inningsSchema = new Schema({
  overs: [{
    bowledBy: {
      type: Number,
      required: true,
      min: 0,
    },
    bowls: [{
      playedBy: {
        type: Number,
        required: true,
        min: 0,
      },
      isWicket: {
        kind: String,
        player: { // for runout player other than `playedBy` can be out
          type: Number,
          min: 0,
        },
      },
      singles: {
        type: Number,
        default: 0,
      },
      by: {
        type: Number,
        default: 0,
      },
      legBy: {
        type: Number,
        default: 0,
      },
      boundary: {
        run: Number,
        kind: {
          type: String,
          enum: ['regular', 'by', 'legBy'],
          default: 'regular',
        },
      },
      isWide: Boolean,
      isNo: String, // containing the reason of no
    }],
  }],
}, schemaOptions);

module.exports = new Schema({
  name: String,
  overs: {
    type: Number,
    min: 1,
  },
  team1: {
    type: Schema.Types.ObjectId,
    ref: 'Team',
  },
  team2: {
    type: Schema.Types.ObjectId,
    ref: 'Team',
  },
  umpire1: {
    type: Schema.Types.ObjectId,
    default: null,
    ref: 'Umpire',
  },
  umpire2: {
    type: Schema.Types.ObjectId,
    default: null,
    ref: 'Umpire',
  },
  umpire3: {
    type: Schema.Types.ObjectId,
    default: null,
    ref: 'Umpire',
  },
  team1Players: [{
    type: Schema.Types.ObjectId,
    ref: 'Player',
  }],
  team2Players: [{
    type: Schema.Types.ObjectId,
    ref: 'Player',
  }],
  team1Captain: {
    type: Schema.Types.ObjectId,
    ref: 'Player',
  },
  team2Captain: {
    type: Schema.Types.ObjectId,
    ref: 'Player',
  },
  team1WonToss: Boolean,
  team1BatFirst: Boolean,
  state: {
    type: String,
    enum: ['', 'toss', 'innings1', 'innings2', 'done'],
    default: '',
  },
  innings1: {
    type: inningsSchema,
    default: null,
  },
  innings2: {
    type: inningsSchema,
    default: null,
  },
  tags: {
    type: [String],
    default: [],
  },
  creator: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
}, schemaOptions);
