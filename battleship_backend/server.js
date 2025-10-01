import express, { json } from "express";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";
import db from "./database.js";

const app = express();

app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3000;

/**
 * @route POST /games
 * @desc Create a new game session
 * @access Public
 */
app.post("/games", (req, res) => {
  const gameId = uuidv4();
  const playerId = uuidv4();

  const initialBoard = Array(10)
    .fill(null)
    .map(() => Array(10).fill(null));
  const initialBoardJson = JSON.stringify(initialBoard);

  const gameSql = `INSERT INTO games (id, player1_id, status) VALUES (?, ?, ?)`;
  const playerSql = `INSERT INTO players (id, game_id, ship_board, shot_board) VALUES (?, ?, ?, ?)`;

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    db.run(gameSql, [gameId, playerId, "waiting_for_player2"], (err) => {
      if (err) {
        db.run("ROLLBACK");
        console.error("Error creating game:", err.message);
        return res
          .status(500)
          .json({ error: "Failed to create game.", details: err.message });
      }
    });

    db.run(
      playerSql,
      [playerId, gameId, initialBoardJson, initialBoardJson],
      (err) => {
        if (err) {
          db.run("ROLLBACK");
          console.error("Error creating player:", err.message);
          return res
            .status(500)
            .json({ error: "Failed to create player.", details: err.message });
        }
      }
    );
    return db.run("COMMIT", (err) => {
      if (err) {
        console.error("Transaction commit failed:", err.message);
        return res
          .status(500)
          .json({ error: "Transaction failed.", details: err.message });
      }
      console.log(`Game ${gameId} created with Player ${playerId}`);
      return res.status(201).json({
        gameId,
        playerId,
        message:
          "New game created! Share the gameId with another player to join.",
      });
    });
  });
});

app.post("/games/:gameId/join", (req, res) => {
  const { gameId } = req.params;

  //first find the game by id
  const findGameSql = `SELECT * FROM games WHERE id = ?`;
  db.get(findGameSql, [gameId], (err, game) => {
    if (err) {
      return res.status(500).json({
        error: "Database error while searching for game.",
        details: err.message,
      });
    }

    if (!game) {
      return res.status(404).json({ error: "Game not found." });
    }
    if (game.player2_id) {
      return res.status(400).json({ error: "Game already has two players." });
    }
    if (game.status !== "waiting_for_player2") {
      return res
        .status(400)
        .json({ error: "This game is not available for joining." });
    }

    //create new player and update game
    const playerId = uuidv4();
    const initialBoard = Array(10)
      .fill(null)
      .map(() => Array(10).fill(null));
    const initialBoardJson = JSON.stringify(initialBoard);

    const createPlayerSql = `INSERT INTO players (id, game_id, ship_board, shot_board) VALUES (?, ?, ?, ?)`;
    const updateGameSql = `UPDATE games SET player2_id = ?, status = ? WHERE id = ?`;

    db.serialize(() => {
      db.run("BEGIN TRANSACTION");
      db.run(
        createPlayerSql,
        [playerId, gameId, initialBoardJson, initialBoardJson],
        (err) => {
          if (err) {
            db.run("ROLLBACK");
            console.error("Error creating player:", err.message);
            return res.status(500).json({
              error: "Failed to create player.",
              details: err.message,
            });
          }
        }
      );

      db.run(updateGameSql, [playerId, "placing_ships", gameId], (err) => {
        if (err) {
          db.run("ROLLBACK");
          console.error("Error updating game:", err.message);
          return res
            .status(500)
            .json({ error: "Failed to update game.", details: err.message });
        }
      });

      return db.run("COMMIT", (err) => {
        if (err) {
          console.error("Transaction commit failed:", err.message);
          return res
            .status(500)
            .json({ error: "Transaction failed.", details: err.message });
        }
        console.log(`Player ${playerId} joined Game ${gameId}`);
        return res.status(200).json({
          gameId,
          playerId,
          message:
            "Successfully joined the game! Place your ships to start playing.",
        });
      });
    });
  });
});

app.post("/games/:gameId/ships", (req, res) => {
  const { gameId } = req.params;
  const { playerId, ships } = req.body;

  if (!playerId || !ships || !Array.isArray(ships) || ships.length === 0) {
    return res
      .status(400)
      .json({ error: "playerId and ships are required in the request body." });
  }

  const findGameSql = `SELECT * from games WHERE id = ?`;
  const findPlayerSql = `SELECT * FROM players WHERE id = ? AND game_id = ?`;

  db.get(findGameSql, [gameId], (err, game) => {
    if (err) {
      return res.status(500).json({
        error: "Database error while searching for game.",
        details: err.message,
      });
    }
    if (!game) {
      return res.status(404).json({ error: "Game not found." });
    }
    if (game.status !== "placing_ships") {
      return res
        .status(400)
        .json({ error: "Cannot place ships at this stage of the game." });
    }
    db.get(findPlayerSql, [playerId, gameId], (err, player) => {
      if (err)
        return res
          .status(500)
          .json({ error: "DB error finding player", details: err.message });
      if (!player) {
        return res.status(404).json({ error: "Player not found in this game" });
      }
      if (player.ships_placed === 1) {
        return res
          .status(400)
          .json({ error: "Ships already placed for this player" });
      }

      const expectedFleet = {
        Carrier: 5,
        Battleship: 4,
        Cruiser: 3,
        Submarine: 3,
        Destroyer: 2,
      };

      if (ships.length !== 5) {
        return res.status(400).json({ error: "All 5 ships must be placed." });
      }

      const board = JSON.parse(player.ship_board);
      const occupiedPositions = new Set();

      for (const ship of ships) {
        if (
          !expectedFleet[ship.type] ||
          expectedFleet[ship.type] !== ship.length
        ) {
          return res
            .status(400)
            .json({ error: `Invalid ship type or length for ${ship.type}.` });
        }
        for (const pos of ship.positions) {
          const [row, col] = pos;
          if (occupiedPositions.has(`${row},${col}`)) {
            return res.status(400).json({ error: "Ships cannot overlap." });
          }
          board[row][col] = ship.type.charAt(0); // Mark ship on board with first letter
          occupiedPositions.add(`${row},${col}`);
        }
      }

      db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        const insertShipSql = `INSERT INTO ships (id, player_id, game_id, type, length, positions) VALUES (?, ?, ?, ?, ?, ?)`;
        for (const ship of ships) {
          const shipId = uuidv4();
          db.run(
            insertShipSql,
            [
              shipId,
              playerId,
              gameId,
              ship.type,
              ship.length,
              JSON.stringify(ship.positions),
            ],
            (err) => {
              if (err) {
                db.run("ROLLBACK");
                console.error("Error inserting ship:", err.message);
                return res.status(500).json({
                  error: "Failed to place ships.",
                  details: err.message,
                });
              }
            }
          );
        }

        const updatePlayerSql = `UPDATE players SET ship_board = ?, ships_placed = 1 WHERE id = ?`;
        db.run(updatePlayerSql, [JSON.stringify(board), playerId], (err) => {
          if (err) {
            db.run("ROLLBACK");
            console.error("Error updating player:", err.message);
            return res.status(500).json({
              error: "Failed to update player.",
              details: err.message,
            });
          }
        });

        return db.run("COMMIT", (err) => {
          if (err) {
            db.run("ROLLBACK");
            return res
              .status(500)
              .json({ error: "Failed to place ships", details: err.message });
          }

          //check if the game can start
          const findOpponentSql = `SELECT id, ships_placed FROM players WHERE game_id = ? AND id != ?`;
          db.get(findOpponentSql, [gameId, playerId], (err, opponent) => {
            if (err) {
              return res.status(500).json({
                error: "DB error finding opponent",
                details: err.message,
              });
            }
            if (opponent && opponent.ships_placed === 1) {
              const updateGameSql = `UPDATE games SET status = "playing", current_turn = ? WHERE id = ?`;
              db.run(updateGameSql, [game.player1_id, gameId], (err) => {
                if (err) {
                  return res.status(500).json({
                    error: "Failed to start game",
                    details: err.message,
                  });
                }
                return res.status(200).json({
                  message: "Ships placed! Game started. Your turn.",
                });
              });
            } else {
              res.status(200).json({
                message:
                  "Ships placed successfully. Waiting for the other player.",
              });
            }
          });
        });
      });
    });
  });
});

app.post("/games/:gameId/shoot", (req, res) => {
  const { gameId } = req.params;
  const { playerId, position } = req.body;

  if (
    !playerId ||
    !position ||
    !Array.isArray(position) ||
    position.length !== 2
  ) {
    return res.status(400).json({
      error:
        "playerId and position [row, col] are required in the request body.",
    });
  }
  const [row, col] = position;
  const findGameSQL = `SELECT * FROM games WHERE id = ?`;
  db.get(findGameSQL, [gameId], (err, game) => {
    if (err) {
      return res.status(500).json({
        error: "DB error finding game",
        details: err.message,
      });
    }
    if (!game) {
      return res.status(404).json({ error: "Game not found." });
    }
    if (game.status !== "playing") {
      return res.status(400).json({ error: "Game is not in playing state." });
    }
    if (game.current_turn !== playerId) {
      return res.status(400).json({ error: "It's not your turn." });
    }

    const opponentId =
      game.player1_id === playerId ? game.player2_id : game.player1_id;

    const findPlayer = `SELECT * FROM players WHERE id = ?`;

    db.get(findPlayer, [playerId], (err, shooter) => {
      if (err || !shooter) {
        return res.status(500).json({
          error: "DB error finding shooter",
          details: err ? err.message : "Shooter not found",
        });
      }

      let shotBoard = JSON.parse(shooter.shot_board);
      if (shotBoard[row][col] !== null) {
        return res
          .status(400)
          .json({ error: "You have already shot at this position." });
      }
      db.get(findPlayer, [opponentId], (err, target) => {
        if (err || !target) {
          return res.status(500).json({
            error: "DB error finding target",
            details: err ? err.message : "Target not found",
          });
        }

        let targetShipBoard = JSON.parse(target.ship_board);
        const result = targetShipBoard[row][col] !== null ? "hit" : "miss";
        shotBoard[row][col] = result === "hit" ? "H" : "M";

        db.serialize(() => {
          db.run("BEGIN TRANSACTION");
          const updateShooterSql = `UPDATE players SET shot_board = ? WHERE id = ?`;
          db.run(
            updateShooterSql,
            [JSON.stringify(shotBoard), playerId],
            (err) => {
              if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({
                  error: "Failed to update shooter's shot board",
                  details: err.message,
                });
              }
            }
          );

          if (result === "miss") {
            const switchTurnSql = `UPDATE games SET current_turn = ? WHERE id = ?`;
            db.run(switchTurnSql, [opponentId, gameId], (err) => {
              if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({
                  error: "Failed to switch turn",
                  details: err.message,
                });
              }
            });
            return db.run("COMMIT", (err) => {
              if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({
                  error: "Transaction commit failed",
                  details: err.message,
                });
              }
              return res.status(200).json({
                result: "miss",
                sunkShip: null,
                message: "You missed! Opponent's turn.",
                winner: null,
              });
            });
          }
          const findShipSql = `SELECT * FROM ships WHERE player_id = ? and positions LIKE ?`;
          const posString = `%[${row},${col}]%`;

          db.get(findShipSql, [opponentId, posString], (err, ship) => {
            if (err || !ship) {
              db.run("ROLLBACK");
              return res.status(500).json({
                error: "Consistency error: Hit detected but no ship found.",
              });
            }

            let hits = JSON.parse(ship.hits);
            hits.push(position);

            let sunkShip = null;
            if (hits.length === ship.length) {
              ship.is_sunk = 1;
              sunkShip = ship.type;
            }

            const updateShipSql = `UPDATE ships SET hits = ?, is_sunk = ? WHERE id = ?`;
            db.run(
              updateShipSql,
              [JSON.stringify(hits), ship.is_sunk, ship.id],
              (err) => {
                if (err) {
                  db.run("ROLLBACK");
                  return res.status(500).json({
                    error: "Failed to update ship hits",
                    details: err.message,
                  });
                }
              }
            );

            if (ship.is_sunk) {
              const checkWinSql = `SELECT COUNT(*) as sunk_count FROM ships WHERE player_id = ? AND is_sunk = 1`;
              db.get(checkWinSql, [opponentId], (err, row) => {
                if (row.sunk_count === 5) {
                  const updateGameSql = `UPDATE games SET status = "finished", winner_id = ?, current_turn = NULL WHERE id = ?`;
                  db.run(updateGameSql, [playerId, gameId], (err) => {
                    if (err) {
                      db.run("ROLLBACK");
                      return res.status(500).json({
                        error: "Failed to update game status",
                        details: err.message,
                      });
                    }
                  });
                  return db.run("COMMIT", (err) => {
                    if (err) {
                      db.run("ROLLBACK");
                      return res.status(500).json({
                        error: "Transaction commit failed",
                        details: err.message,
                      });
                    }
                    return res.status(200).json({
                      result: "hit",
                      sunkShip,
                      message: `You sunk the opponent's ${sunkShip}! You win!`,
                      winner: playerId,
                    });
                  });
                } else {
                  const switchTurnSql = `UPDATE games SET current_turn = ? WHERE id = ?`;
                  db.run(switchTurnSql, [opponentId, gameId], (err) => {
                    if (err) {
                      db.run("ROLLBACK");
                      return res.status(500).json({
                        error: "Failed to switch turn",
                        details: err.message,
                      });
                    }
                  });
                  return db.run("COMMIT", (err) => {
                    if (err) {
                      db.run("ROLLBACK");
                      return res.status(500).json({
                        error: "Transaction commit failed",
                        details: err.message,
                      });
                    }
                    return res.status(200).json({
                      result: "hit",
                      sunkShip,
                      message: `You hit and sunk the opponent's ${sunkShip}! Opponent's turn.`,
                      winner: null,
                    });
                  });
                }
              });
            } else {
              const switchTurnSql = `UPDATE games SET current_turn = ? WHERE id = ?`;
              db.run(switchTurnSql, [opponentId, gameId], (err) => {
                if (err) {
                  db.run("ROLLBACK");
                  return res.status(500).json({
                    error: "Failed to switch turn",
                    details: err.message,
                  });
                }
              });
              return db.run("COMMIT", (err) => {
                if (err) {
                  db.run("ROLLBACK");
                  return res.status(500).json({
                    error: "Transaction commit failed",
                    details: err.message,
                  });
                }
                return res.status(200).json({
                  result: "hit",
                  sunkShip: null,
                  message: `You hit a ship! Opponent's turn.`,
                  winner: null,
                });
              });
            }
          });
        });
      });
    });
  });
});

app.get("/games/:gameId/state", (req, res) => {
  const { gameId } = req.params;
  const { playerId } = req.query;

  if (!playerId) {
    return res
      .status(400)
      .json({ error: "playerId is required as a query parameter." });
  }

  const gameSql = `SELECT * FROM games WHERE id = ?`;
  const playerSql = `SELECT * FROM players WHERE id = ? AND game_id = ?`;
  const opponentSql = `SELECT id, shot_board FROM players WHERE game_id = ? AND id != ?`;
  const shipsSql = `SELECT type, length, positions, hits, is_sunk FROM ships WHERE player_id = ?`;

  db.get(gameSql, [gameId], (err, game) => {
    if (err) {
      return res
        .status(500)
        .json({ error: "DB error finding game", details: err.message });
    }
    if (!game) {
      return res.status(404).json({ error: "Game not found." });
    }
    db.get(playerSql, [playerId, gameId], (err, player) => {
      if (err) {
        return res
          .status(500)
          .json({ error: "DB error finding player", details: err.message });
      }
      if (!player) {
        return res
          .status(404)
          .json({ error: "Player not found in this game." });
      }
      db.all(shipsSql, [playerId], (err, ships) => {
        if (err) {
          return res
            .status(500)
            .json({ error: "DB error finding ships", details: err.message });
        }
        db.get(opponentSql, [gameId, playerId], (err, opponent) => {
          if (err) {
            return res.status(500).json({
              error: "DB error finding opponent",
              details: err.message,
            });
          }
          const opponentId = opponent ? opponent.id : null;
          return res.status(200).json({
            gameStatus: game.status,
            currentTurn: game.current_turn,
            winner: game.winner_id,
            playerId: player.id,
            playerBoard: JSON.parse(player.ship_board),
            playerShotBoard: JSON.parse(player.shot_board),
            playerShipsPlaced: player.ships_placed,
            myShips: ships.map((s) => ({
              ...s,
              positions: JSON.parse(s.positions),
              hits: JSON.parse(s.hits),
            })),
            opponentId: opponentId,
          });
        });
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
