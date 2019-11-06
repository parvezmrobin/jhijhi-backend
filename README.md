# Jhijhi

[![Netlify Status](https://api.netlify.com/api/v1/badges/fa41d613-d50c-4f4b-97ac-f5749d6a3210/deploy-status)](https://app.netlify.com/sites/jhijhi/deploys)

*A simple Express JS app fronted by react to maintain cricket score*

## Live

> You can use the app from https://jhijhi.herokuapp.com.

## Installation
To install the app in your local machine
make sure you have `node` and `yarn` installed. Then run
```bash
yarn install
```

After installation completes, copy `.env.example` to `.env`. 
Replace the value of `DB_CONN` inside `.env` with a mongodb connection string.
 
Finally, run 
```bash
yarn run dev
```

Wait a while. **Bingo!** 

## Seeding
If you don't want to go through the hassle of inserting bunch of new data
and just want to explore the app, run
```bash
yarn run seed <username>
```
Place your desired `username` in place of `<username>`.
Your password is same as the `username`.
A bunch of players, teams and matches are also inserted for you.

Thank me later. Find some bug first.
