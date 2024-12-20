/**
 * Parvez M Robin
 * parvezmrobin@gmail.com
 * Date: Apr 05, 2019
 */

module.exports = {
  auth: {
    register: {
      ok: 'Successfully registered as a new user.',
      err: 'Error while registering as a new user.',
    },
    login: {
      user: 'user not found with given username',
      password: 'password did not match',
      err: 'Error while logging in',
    },
    password: {
      ok: 'Successfully updated password',
      err: 'Error while updating password',
      mismatch: 'Password did not match',
    },
  },
  players: {
    index: {
      err: 'Error while retrieving player list',
    },
    get: {
      err: 'Player could not found',
    },
    stat: {
      ok: (name) => `Successfully generated stat for player ${name}`,
      err: 'Error while generating stat',
    },
    create: {
      ok: (name) => `Successfully created player ${name}`,
      err: 'Error while creating player',
    },
    edit: {
      ok: (name) => `Successfully edited player ${name}`,
      err: 'Error while editing player',
    },
    delete: {
      ok: (name) => `Successfully deleted player ${name}`,
      err: 'Error while deleting player',
    },
  },
  teams: {
    index: {
      err: 'Error while retrieving team list',
    },
    get: {
      err: 'Team could not found',
    },
    create: {
      ok: (name) => `Successfully created team ${name}`,
      err: 'Error while creating team',
    },
    edit: {
      ok: (name) => `Successfully edited team ${name}`,
      err: 'Error while editing team',
    },
  },
  presets: {
    index: {
      err: 'Error while retrieving preset list',
    },
    get: {
      err: 'Preset could not found',
    },
    create: {
      ok: (name) => `Successfully created preset ${name}`,
      err: 'Error while creating preset',
    },
    delete: {
      ok: 'Successfully deleted preset',
      err: 'Error while deleting preset',
    },
  },
  matches: {
    index: {
      err: 'Error while retrieving match list',
    },
    create: {
      ok: (name) => `Successfully created match ${name}`,
      err: 'Error while creating match',
    },
    edit: {
      ok: (name) => `Successfully edited match ${name}`,
      err: 'Error while editing match',
    },
    delete: {
      ok: (name) => `Successfully deleted match ${name}`,
      err: 'Error while deleting match',
    },
    begin: {
      ok: 'Successfully started match',
      err: 'Error while starting match',
    },
    toss: {
      ok: 'Successfully tossed match',
      err: 'Error while tossing match',
    },
    get: {
      err: 'Error while retrieving match',
    },
    tags: {
      err: 'Error while retrieving tags',
    },
    e404: 'Could not find a match with given id',
  },
  umpires: {
    index: {
      err: 'Error while retrieving umpire list',
    },
    create: {
      ok: (name) => `Successfully created umpire ${name}`,
      err: 'Error while creating umpire',
    },
    edit: {
      ok: (name) => `Successfully edited umpire ${name}`,
      err: 'Error while editing umpire',
    },
    delete: {
      ok: (name) => `Successfully deleted umpire ${name}`,
      err: 'Error while deleting umpire',
    },
    e404: 'Could not find an umpire with given id',
  },
};
