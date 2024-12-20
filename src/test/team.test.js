const { describe, before, it, after } = require('mocha');
const chai = require('chai');
const { put, post, destroy, tearDown } = require('./_helpers');

chai.should();
const { namify } = require('../lib/utils');

describe('Test Team Functionality', function teamTestSuit() {
  this.timeout(10000);
  let token1;
  let token2;
  let teamId;
  let player1;
  let player2;
  let player3;
  let player4;
  let presetId;

  async function createPlayer(token, playerName, playerJerseyNo) {
    const res = await post(
      '/api/players',
      {
        name: playerName,
        jerseyNo: playerJerseyNo,
      },
      token
    );
    const { player } = res.body;
    return player._id;
  }
  before(async () => {
    await post('/api/auth/register', {
      username: 'username',
      password: '1234',
      confirm: '1234',
    });
    const res = await post('/api/auth/login', {
      username: 'username',
      password: '1234',
    });
    token1 = res.body.token;
    token2 = res.body.token;
    player1 = await createPlayer(token1, 'player 1', 1);
    player2 = await createPlayer(token1, 'player 2', 2);
    player3 = await createPlayer(token2, 'player 3', 3);
    player4 = await createPlayer(token2, 'player 4', 4);
  });

  it('should not create a team without authentication', async () => {
    const res = await post('/api/teams', {
      name: 'team',
      shortName: 'tea',
    });
    res.should.have.status(401);
  });

  it('should not create a team without values', async () => {
    const teamInfo = {
      name: 'team',
      shortName: 'tea',
    };

    for (const key in teamInfo) {
      const dumpedTeamInfo = { ...teamInfo, [key]: undefined };
      const res = await post('/api/teams', dumpedTeamInfo, token1);
      res.should.have.status(400);
      res.body.err.map((e) => e.param).should.contain(key);
    }

    const res = await post(
      '/api/teams',
      {
        name: 'team',
        shortName: 't',
      },
      token1
    );
    res.should.have.status(400);
    res.body.err
      .map((e) => e.param)
      .should.contain('shortName')
      .and.not.contain('name');
  });

  async function testCreateTeam(token) {
    const res = await post(
      '/api/teams',
      {
        name: 'team',
        shortName: 'tea',
      },
      token
    );
    res.should.have.status(201);
    const { team } = res.body;
    team.name.should.be.equals('Team'); // name is auto-capitalized
    team.shortName.should.be.equals('TEA'); // short name is auto-capitalized
    team.should.have.property('_id');
    return team._id;
  }

  it('should successfully create a team', async () => {
    teamId = await testCreateTeam(token1);
  });

  it('should not create a duplicate team', async () => {
    let res = await post(
      '/api/teams',
      {
        name: 'team',
        shortName: 'te',
      },
      token1
    );
    res.should.have.status(400);
    res.body.err
      .map((e) => e.param)
      .should.contain('name')
      .and.not.contain('shortName');

    res = await post(
      '/api/teams',
      {
        name: 'team2',
        shortName: 'tea',
      },
      token1
    );
    res.should.have.status(400);
    res.body.err
      .map((e) => e.param)
      .should.contain('shortName')
      .and.not.contain('name');
  });

  it('should create a team by different user', async () => {
    await post('/api/auth/register', {
      username: 'username2',
      password: '1234',
      confirm: '1234',
    });
    const loginRes = await post('/api/auth/login', {
      username: 'username2',
      password: '1234',
    });
    token2 = loginRes.body.token;

    await testCreateTeam(token2);
  });

  it('should not edit a team of another user', async () => {
    const res = await put(
      `/api/teams/${teamId}`,
      {
        name: 'team3',
        shortName: 'tea3',
      },
      token2
    );
    res.should.have.status(404);
  });

  async function testEditTeam(teamObject) {
    const res = await put(`/api/teams/${teamId}`, teamObject, token1);
    res.should.have.status(200);
    const { team } = res.body;
    team.name.should.be.equals(namify(teamObject.name)); // name is auto-capitalized
    team.shortName.should.be.equals(teamObject.shortName.toUpperCase());
    team.should.have.property('_id');
  }

  it('should edit a team without a change', async () => {
    await testEditTeam({
      name: 'team',
      shortName: 'tea',
    });
  });

  it('should edit a team', async () => {
    await testEditTeam({
      name: 'team3',
      shortName: 'TEA3',
    });
  });

  it('should not create a preset without name', async () => {
    const res = await post(`/api/teams/${teamId}/presets`, {}, token1);
    res.should.have.status(400);
    res.body.err
      .map((e) => e.param)
      .should.contain('name')
      .and.contain('players');
  });

  it('should not create a preset without min 2 players', async () => {
    let res = await post(
      `/api/teams/${teamId}/presets`,
      { name: 'team' },
      token1
    );
    res.should.have.status(400);
    res.body.err
      .map((e) => e.param)
      .should.contain('players')
      .and.not.contain('name');

    res = await post(
      `/api/teams/${teamId}/presets`,
      {
        name: 'team',
        players: [player1],
      },
      token1
    );
    res.should.have.status(400);
    res.body.err
      .map((e) => e.param)
      .should.contain('players')
      .and.not.contain('name');
  });
  async function testCreatePreset(token) {
    const res = await post(
      `/api/teams/${teamId}/presets`,
      {
        name: 'team',
        players: [player1, player2],
      },
      token
    );
    res.should.have.status(201);
    const { preset } = res.body;
    preset.name.should.be.equals('Team'); // name is auto-capitalized
    preset.players[0].should.be.equals(player1); // short name is auto-capitalized
    preset.players[1].should.be.equals(player2);
    preset.should.have.property('_id');
    return preset._id;
  }
  it('should successfully create a preset', async () => {
    presetId = await testCreatePreset(token1);
  });

  it('should not create a preset of another user', async () => {
    const res = await post(
      `/api/teams/${teamId}/presets`,
      {
        name: 'team',
        players: [player1, player2],
      },
      token2
    );
    res.should.have.status(404);
  });

  it('should not insert players of another user into a preset', async () => {
    const res = await post(
      `/api/teams/${teamId}/presets`,
      {
        name: 'team',
        players: [player3, player4],
      },
      token1
    );
    res.should.have.status(400);
  });

  it('should not create a duplicate preset', async () => {
    const res = await post(
      `/api/teams/${teamId}/presets`,
      {
        name: 'team',
        players: [player1, player2],
      },
      token1
    );
    res.should.have.status(400);
    res.body.err
      .map((e) => e.param)
      .should.contain('name')
      .and.not.contain('players');
  });
  it('should not insert same player into a preset', async () => {
    const res = await post(
      `/api/teams/${teamId}/presets`,
      {
        name: 'team1',
        players: [player1, player1],
      },
      token1
    );
    res.should.have.status(400);
    res.body.err
      .map((e) => e.param)
      .should.contain('players')
      .and.not.contain('name');
  });
  it('should not delete preset of another user', async () => {
    const res = await destroy(
      `/api/teams/${teamId}/presets/${presetId}`,
      token2
    );
    res.should.have.status(404);
  });
  it('should delete a preset', async () => {
    const res = await destroy(
      `/api/teams/${teamId}/presets/${presetId}`,
      token1
    );
    res.should.have.status(200);
  });
  after(tearDown);
});
