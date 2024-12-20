/**
 * Parvez M Robin
 * this@parvezmrobin.com
 * Mar 28, 2020
 */

const {
  get,
  post,
  createPlayers,
  createUmpires,
  createTeams,
} = require('../_helpers');

async function startUp() {
  await post('/api/auth/register', {
    username: 'username1',
    password: '1234',
    confirm: '1234',
  });
  const res = await post('/api/auth/login', {
    username: 'username1',
    password: '1234',
  });
  const token1 = res.body.token;

  await post('/api/auth/register', {
    username: 'username2',
    password: '1234',
    confirm: '1234',
  });
  const loginRes = await post('/api/auth/login', {
    username: 'username2',
    password: '1234',
  });
  const token2 = loginRes.body.token;

  const playerIds1 = await createPlayers(token1, 6);
  const playerIds2 = await createPlayers(token2, 6);

  const umpireIds1 = await createUmpires(token1, 3);
  const umpireIds2 = await createUmpires(token2, 3);

  const teamIds1 = await createTeams(token1, 3);
  const teamIds2 = await createTeams(token2, 3);

  return {
    token1,
    token2,
    playerIds1,
    playerIds2,
    umpireIds1,
    umpireIds2,
    teamIds1,
    teamIds2,
  };
}

async function testBasicDataIntegrity(
  matchId,
  token,
  afterToss = false,
  state = 'toss'
) {
  const res = await get(`/api/matches/${matchId}`, token);

  res.should.have.status(200);
  const match = res.body;
  match.name.should.be.equals('Match 1');
  match.overs.should.be.equal(4);
  match.team1.should.include({ name: 'Team0', shortName: 'T0' });
  match.team2.should.include({ name: 'Team1', shortName: 'T1' });
  match.team1Captain.should.include({ name: 'Player0', jerseyNo: 0 });
  match.team2Captain.should.include({ name: 'Player3', jerseyNo: 3 });
  for (let i = 0; i < match.team1Players.length; i++) {
    const team1Player = match.team1Players[i];
    team1Player.should.include({ name: `Player${i}`, jerseyNo: i });
  }
  for (let i = 0; i < match.team2Players.length; i++) {
    const team2Player = match.team2Players[i];
    team2Player.should.include({ name: `Player${i + 3}`, jerseyNo: i + 3 });
  }
  if (afterToss) {
    match.team1WonToss.should.be.true;
    match.team1BatFirst.should.be.false;
  } else {
    match.should.not.have.property('team1WonToss');
    match.should.not.have.property('team1BatFirst');
  }
  match.state.should.be.equals(state);
  match.tags.should.be.an('array').with.length(0);
  return match;
}

module.exports.startUp = startUp;
module.exports.testBasicDataIntegrity = testBasicDataIntegrity;
