import { useState, useEffect, useCallback } from "react";
import "./App.css";
// --- Configuration ---
const API_BASE_URL = "http://localhost:3000"; // The URL of your Node.js backend

// --- Main App Component ---
export default function App() {
  // --- State Management ---
  const [gameId, setGameId] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // --- API Helper Functions ---
  const apiCall = async (endpoint, method = "GET", body = null) => {
    setIsLoading(true);
    setError("");
    try {
      const options = {
        method,
        headers: { "Content-Type": "application/json" },
      };
      if (body) {
        options.body = JSON.stringify(body);
      }
      const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "An API error occurred.");
      }
      return data;
    } catch (err) {
      setError(err.message);
      console.error("API Call Failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchGameState = useCallback(async () => {
    if (!gameId || !playerId) return;
    const state = await apiCall(`/games/${gameId}/state?playerId=${playerId}`);
    if (state) {
      setGameState(state);
    }
  }, [gameId, playerId]);

  // --- Game Actions ---
  const handleCreateGame = async () => {
    const data = await apiCall("/games", "POST");
    if (data) {
      setGameId(data.gameId);
      setPlayerId(data.playerId);
      localStorage.setItem("battleshipGameId", data.gameId);
      localStorage.setItem("battleshipPlayerId", data.playerId);
    }
  };

  const handleJoinGame = async (idToJoin) => {
    if (!idToJoin) {
      setError("Please enter a Game ID to join.");
      return;
    }
    const data = await apiCall(`/games/${idToJoin}/join`, "POST");
    if (data) {
      setGameId(data.gameId);
      setPlayerId(data.playerId);
      // localStorage.setItem("battleshipGameId", data.gameId);
      // localStorage.setItem("battleshipPlayerId", data.playerId);
    }
  };

  const handlePlaceShips = async (ships) => {
    const data = await apiCall(`/games/${gameId}/ships`, "POST", {
      playerId,
      ships,
    });
    if (data) {
      fetchGameState(); // Refresh state immediately after placing ships
    }
  };

  const handleFireShot = async (row, col) => {
    if (isLoading) return; // Prevent firing multiple shots while one is in progress
    const coordinates = [row, col]; // Construct the coordinates array here
    const data = await apiCall(`/games/${gameId}/shoot`, "POST", {
      playerId,
      position: coordinates,
    });
    if (data) {
      fetchGameState(); // Refresh state to see the result of the shot
    }
  };

  const handleResetGame = () => {
    localStorage.removeItem("battleshipGameId");
    localStorage.removeItem("battleshipPlayerId");
    setGameId(null);
    setPlayerId(null);
    setGameState(null);
    setError("");
  };

  // --- Effects ---
  // Effect to periodically fetch game state (polling)
  useEffect(() => {
    if (gameId && playerId) {
      fetchGameState(); // Fetch immediately on load
      const interval = setInterval(() => {
        // Only poll if the game is in a state that can change
        if (
          gameState &&
          (gameState.gameStatus === "waiting_for_player2" ||
            gameState.gameStatus === "placing_ships" ||
            gameState.gameStatus === "playing")
        ) {
          fetchGameState();
        }
      }, 3000); // Poll every 3 seconds

      return () => clearInterval(interval); // Cleanup on component unmount
    }
  }, [gameId, playerId, fetchGameState, gameState?.gameStatus]);

  // --- Render Logic ---
  const renderContent = () => {
    if (!gameId || !playerId) {
      return (
        <StartScreen
          onCreateGame={handleCreateGame}
          onJoinGame={handleJoinGame}
        />
      );
    }

    if (!gameState) {
      return (
        <div style={{ textAlign: "center", padding: "2rem" }}>
          Loading game state...
        </div>
      );
    }

    switch (gameState.gameStatus) {
      case "waiting_for_player2":
        return <WaitingRoom gameId={gameId} />;
      case "placing_ships":
        return (
          <PlacementScreen
            gameState={gameState}
            onShipsPlaced={handlePlaceShips}
          />
        );
      case "playing":
      case "finished":
        return (
          <GameScreen
            gameState={gameState}
            playerId={playerId}
            onFireShot={handleFireShot}
          />
        );
      default:
        return (
          <div style={{ textAlign: "center", padding: "2rem" }}>
            Unknown game state: {gameState.gameStatus}
          </div>
        );
    }
  };

  return (
    <div
      style={{
        backgroundColor: "#111827",
        color: "white",
        minHeight: "100vh",
        fontFamily: "sans-serif",
        padding: "2rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <header
        style={{
          width: "100%",
          maxWidth: "72rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <h1
          style={{
            fontSize: "2.25rem",
            fontWeight: "bold",
            color: "#22d3ee",
            letterSpacing: "0.05em",
          }}
        >
          BATTLESHIP
        </h1>
        {gameId && (
          <button
            onClick={handleResetGame}
            style={{
              backgroundColor: "#dc2626",
              color: "white",
              fontWeight: "bold",
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "none",
              cursor: "pointer",
            }}
          >
            Reset Game
          </button>
        )}
      </header>

      <main
        style={{
          width: "100%",
          maxWidth: "72rem",
          backgroundColor: "#1f2937",
          borderRadius: "0.75rem",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          padding: "1.5rem",
        }}
      >
        {isLoading && (
          <div
            style={{
              position: "fixed",
              top: "1rem",
              right: "1rem",
              backgroundColor: "#f59e0b",
              color: "black",
              padding: "0.75rem",
              borderRadius: "0.5rem",
            }}
          >
            Loading...
          </div>
        )}
        {error && (
          <div
            style={{
              backgroundColor: "#ef4444",
              color: "white",
              padding: "1rem",
              borderRadius: "0.5rem",
              marginBottom: "1rem",
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}
        {renderContent()}
      </main>
    </div>
  );
}

// --- Child Components ---

function StartScreen({ onCreateGame, onJoinGame }) {
  const [joinId, setJoinId] = useState("");

  return (
    <div className="flex flex-col items-center justify-center p-8">
      <h2 className="text-2xl font-semibold mb-6">Welcome to Battleship</h2>
      <div className="space-y-4 w-full max-w-sm">
        <button
          onClick={onCreateGame}
          className="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 px-4 rounded-lg text-lg transition duration-300"
        >
          Create New Game
        </button>
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            placeholder="Enter Game ID to Join"
            className="flex-grow bg-gray-700 border border-gray-600 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          <button
            onClick={() => onJoinGame(joinId)}
            className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg transition duration-300"
          >
            Join
          </button>
        </div>
      </div>
    </div>
  );
}

function WaitingRoom({ gameId }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(gameId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="text-center p-8">
      <h2 className="text-2xl font-semibold mb-4">Waiting for Opponent...</h2>
      <p className="text-gray-400 mb-6">Share this Game ID with a friend:</p>
      <div className="bg-gray-700 rounded-lg p-4 flex items-center justify-center space-x-4 max-w-md mx-auto">
        <span className="text-lg font-mono text-yellow-400">{gameId}</span>
        <button
          onClick={handleCopy}
          className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-3 rounded-lg transition duration-300"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function PlacementScreen({ gameState, onShipsPlaced }) {
  const FLEET = [
    { type: "Carrier", length: 5 },
    { type: "Battleship", length: 4 },
    { type: "Cruiser", length: 3 },
    { type: "Submarine", length: 3 },
    { type: "Destroyer", length: 2 },
  ];

  const [placements, setPlacements] = useState([]);
  const [selectedShipIndex, setSelectedShipIndex] = useState(0);
  const [orientation, setOrientation] = useState("horizontal");

  const handleGridClick = (row, col) => {
    if (selectedShipIndex >= FLEET.length) return; // All ships placed

    const ship = FLEET[selectedShipIndex];
    const newPositions = [];

    // Check for out of bounds
    if (orientation === "horizontal" && col + ship.length > 10) return;
    if (orientation === "vertical" && row + ship.length > 10) return;

    // Check for overlaps
    const allPlacedPositions = placements.flatMap((p) => p.positions);
    for (let i = 0; i < ship.length; i++) {
      const currentPos =
        orientation === "horizontal" ? [row, col + i] : [row + i, col];
      if (
        allPlacedPositions.some(
          (p) => p[0] === currentPos[0] && p[1] === currentPos[1]
        )
      ) {
        return; // Overlap detected
      }
      newPositions.push(currentPos);
    }

    setPlacements([...placements, { ...ship, positions: newPositions }]);
    setSelectedShipIndex(selectedShipIndex + 1);
  };

  const handleConfirm = () => {
    if (placements.length === FLEET.length) {
      onShipsPlaced(placements);
    }
  };

  if (gameState.playerShipsPlaced) {
    return (
      <div className="text-center p-8 text-xl">
        Your ships are placed. Waiting for the opponent to get ready...
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <h2 className="text-2xl font-semibold mb-4">Place Your Ships</h2>
      <div className="mb-4 flex space-x-4 items-center">
        {selectedShipIndex < FLEET.length ? (
          <p className="text-lg">
            Placing:{" "}
            <span className="font-bold text-cyan-400">
              {FLEET[selectedShipIndex].type}
            </span>{" "}
            ({FLEET[selectedShipIndex].length} squares)
          </p>
        ) : (
          <p className="text-lg text-green-400">
            All ships placed. Ready to confirm.
          </p>
        )}
        <button
          onClick={() =>
            setOrientation((o) =>
              o === "horizontal" ? "vertical" : "horizontal"
            )
          }
          className="bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg"
        >
          Rotate ({orientation})
        </button>
      </div>
      <GameBoard
        boardData={[]}
        myShips={placements}
        onCellClick={handleGridClick}
        isPlacement={true}
        orientation={orientation}
        shipLength={FLEET[selectedShipIndex]?.length}
      />
      {placements.length === FLEET.length && (
        <button
          onClick={handleConfirm}
          className="mt-6 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-lg text-xl transition duration-300"
        >
          Confirm Placement
        </button>
      )}
    </div>
  );
}

function GameScreen({ gameState, playerId, onFireShot }) {
  const { gameStatus, currentTurn, winner, playerShotBoard, myShips } =
    gameState;

  let statusMessage = "";
  if (gameStatus === "playing") {
    statusMessage = currentTurn === playerId ? "Your Turn!" : "Opponent's Turn";
  } else if (gameStatus === "finished") {
    statusMessage = winner === playerId ? "You Win!" : "You Lose!";
  }

  return (
    <div>
      <div className="text-center mb-6">
        <h2
          className={`text-3xl font-bold ${
            currentTurn === playerId && gameStatus === "playing"
              ? "text-green-400 animate-pulse"
              : "text-yellow-400"
          }`}
        >
          {statusMessage}
        </h2>
      </div>
      <div className="flex flex-col md:flex-row justify-around items-center gap-8">
        <div>
          <h3 className="text-xl text-center mb-2">Your Ships</h3>
          <GameBoard boardData={[]} myShips={myShips} />
        </div>
        <div>
          <h3 className="text-xl text-center mb-2">Opponent's Waters</h3>
          <GameBoard
            boardData={playerShotBoard}
            onCellClick={onFireShot}
            isOpponentBoard={true}
            canFire={currentTurn === playerId && gameStatus === "playing"}
          />
        </div>
      </div>
    </div>
  );
}

function GameBoard({
  boardData,
  onCellClick = () => {},
  myShips = [],
  isOpponentBoard = false,
  canFire = false,
  isPlacement = false,
  orientation = "horizontal",
  shipLength = 0,
}) {
  const [hoverPos, setHoverPos] = useState(null);
  const boardSize = Array(10).fill(null);

  const getCellContent = (row, col) => {
    // Find if a placed ship is on this cell
    for (const ship of myShips) {
      for (const pos of ship.positions) {
        if (pos[0] === row && pos[1] === col) {
          const isHit = ship.hits?.some(
            (hit) => hit[0] === row && hit[1] === col
          );
          return (
            <div
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "0.25rem",
                backgroundColor: isHit ? "#B91C1C" : "#6B7280",
              }}
            ></div>
          );
        }
      }
    }

    if (isOpponentBoard && boardData[row][col]) {
      const val = boardData[row][col];
      if (val === "H")
        return (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.875rem",
              color: "#EF4444",
            }}
          >
            🔥
          </div>
        );
      if (val === "M")
        return (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.875rem",
              color: "#93C5FD",
            }}
          >
            ●
          </div>
        );
    }

    return null; // Empty cell
  };

  const getHoverClass = (row, col) => {
    if (
      !isPlacement ||
      !hoverPos ||
      hoverPos.row !== row ||
      hoverPos.col !== col
    )
      return "";

    let isValid = true;
    const allPlacedPositions = myShips.flatMap((p) => p.positions);

    for (let i = 0; i < shipLength; i++) {
      const currentPos =
        orientation === "horizontal" ? [row, col + i] : [row + i, col];
      if (orientation === "horizontal" && col + shipLength > 10)
        isValid = false;
      if (orientation === "vertical" && row + shipLength > 10) isValid = false;
      if (
        allPlacedPositions.some(
          (p) => p[0] === currentPos[0] && p[1] === currentPos[1]
        )
      )
        isValid = false;
    }

    return isValid ? "rgba(34, 197, 94, 0.5)" : "rgba(239, 68, 68, 0.5)";
  };

  const boardStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(10, 1fr)",
    gap: "4px",
    backgroundColor: "#374151",
    padding: "8px",
    borderRadius: "8px",
  };

  return (
    <div style={boardStyle}>
      {boardSize.map((_, row) =>
        boardSize.map((_, col) => {
          const isClickable =
            (isOpponentBoard && canFire && !boardData[row][col]) || isPlacement;

          const cellStyle = {
            width: "clamp(2rem, 5vw, 3rem)",
            height: "clamp(2rem, 5vw, 3rem)",
            backgroundColor: "rgba(30, 64, 175, 0.5)",
            border: "1px solid rgba(30, 58, 138, 1)",
            position: "relative",
            cursor: isClickable ? "pointer" : "not-allowed",
          };

          return (
            <div
              key={`${row}-${col}`}
              style={cellStyle}
              onClick={() => isClickable && onCellClick(row, col)}
              onMouseEnter={() => isPlacement && setHoverPos({ row, col })}
              onMouseLeave={() => isPlacement && setHoverPos(null)}
            >
              {getCellContent(row, col)}
              {isPlacement &&
                hoverPos &&
                hoverPos.row === row &&
                hoverPos.col === col &&
                Array(shipLength)
                  .fill(0)
                  .map((_, i) => {
                    const hoverBoxStyle = {
                      position: "absolute",
                      top: orientation === "vertical" ? `${i * 100}%` : "0",
                      left: orientation === "horizontal" ? `${i * 100}%` : "0",
                      width: "100%",
                      height: "100%",
                      backgroundColor: getHoverClass(row, col),
                      borderRadius: "2px",
                    };
                    return <div key={i} style={hoverBoxStyle}></div>;
                  })}
            </div>
          );
        })
      )}
    </div>
  );
}
