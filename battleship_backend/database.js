import sqlite3Base from "sqlite3";

const sqlite3 = sqlite3Base.verbose();
const DB_SOURCE = "battleship.db";

const db = new sqlite3.Database(DB_SOURCE, (err) => {
  if (err) {
    console.error(err.message);
    throw err;
  } else {
    console.log("Connected to the SQLite database.");
    db.serialize(() => {
      console.log("Initializing database...");

      // Table to store overall game state
      db.run(
        `CREATE TABLE IF NOT EXISTS games (
                    id TEXT PRIMARY KEY,
                    player1_id TEXT,
                    player2_id TEXT,
                    current_turn TEXT,
                    status TEXT NOT NULL,
                    winner_id TEXT
                )`,
        (err) => {
          if (err) {
            console.error("Error creating games table:", err.message);
          } else {
            console.log("Games table ready.");
          }
        }
      );

      // Table to store data for each player, linked to a game
      db.run(
        `CREATE TABLE IF NOT EXISTS players (
                    id TEXT PRIMARY KEY,
                    game_id TEXT NOT NULL,
                    ship_board TEXT,
                    shot_board TEXT,
                    ships_placed INTEGER DEFAULT 0,
                    FOREIGN KEY (game_id) REFERENCES games(id)
                )`,
        (err) => {
          if (err) {
            console.error("Error creating players table:", err.message);
          } else {
            console.log("Players table ready.");
          }
        }
      );

      //table to store detailed information about each ship
      db.run(
        `
            CREATE TABLE IF NOT EXISTS ships (
                id TEXT PRIMARY KEY,
                player_id TEXT NOT NULL,
                game_id TEXT NOT NULL,
                type TEXT NOT NULL,
                length INTEGER NOT NULL,
                positions TEXT NOT NULL,
                hits TEXT DEFAULT '[]',
                is_sunk INTEGER DEFAULT 0,
                FOREIGN KEY (player_id) REFERENCES players(id),
                FOREIGN KEY (game_id) REFERENCES games(id)
            )
        `,
        (err) => {
          if (err) {
            console.error("Error creating ships table:", err.message);
          } else {
            console.log("Ships table ready.");
          }
        }
      );
    });
  }
});

export default db;
