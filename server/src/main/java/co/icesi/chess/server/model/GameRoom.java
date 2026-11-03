package co.icesi.chess.server.model;

import co.icesi.chess.model.ChessRules;
import co.icesi.chess.model.TierManager;

import ChessApp.*;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Representa una sala de juego de ajedrez distribuida.
 * Maneja el ciclo de vida de la partida, control de turnos, observadores en tiempo real
 * (jugadores y espectadores) y actualización del ranking al finalizar.
 */
public class GameRoom {

    private final String roomCode;
    private final TierManager tierManager;

    private String whitePlayer;
    private String blackPlayer;
    private final Set<String> spectators = Collections.synchronizedSet(new LinkedHashSet<>());
    private final Map<String, ChessObserverPrx> observers = new ConcurrentHashMap<>();

    private ChessPiece[][] board;
    private PieceColor currentTurn = PieceColor.COLORWHITE;
    private GameStatus status = GameStatus.WAITINGFORPLAYERS;

    private final List<ChessPiece> whiteCaptured = Collections.synchronizedList(new ArrayList<>());
    private final List<ChessPiece> blackCaptured = Collections.synchronizedList(new ArrayList<>());
    private final List<MoveRecord> moves = Collections.synchronizedList(new ArrayList<>());

    private long version = 1;
    private final ExecutorService notificationExecutor = Executors.newCachedThreadPool();

    public GameRoom(String roomCode, String creatorNickname, TierManager tierManager) {
        this.roomCode = roomCode;
        this.tierManager = tierManager;
        this.whitePlayer = (creatorNickname != null && !creatorNickname.trim().isEmpty()) ? creatorNickname.trim() : "Jugador 1";
        this.board = ChessRules.createInitialBoard();
    }

    public synchronized JoinRoomResult join(String nickname) {
        String nick = (nickname != null && !nickname.trim().isEmpty()) ? nickname.trim() : "Invitado";

        PlayerRole role;
        PieceColor assignedColor;

        if (whitePlayer == null) {
            whitePlayer = nick;
            role = PlayerRole.ROLEWHITE;
            assignedColor = PieceColor.COLORWHITE;
        } else if (whitePlayer.equalsIgnoreCase(nick)) {
            role = PlayerRole.ROLEWHITE;
            assignedColor = PieceColor.COLORWHITE;
        } else if (blackPlayer == null) {
            blackPlayer = nick;
            role = PlayerRole.ROLEBLACK;
            assignedColor = PieceColor.COLORBLACK;
            if (status == GameStatus.WAITINGFORPLAYERS) {
                status = GameStatus.INPROGRESS;
            }
        } else if (blackPlayer.equalsIgnoreCase(nick)) {
            role = PlayerRole.ROLEBLACK;
            assignedColor = PieceColor.COLORBLACK;
        } else {
            spectators.add(nick);
            role = PlayerRole.ROLESPECTATOR;
            assignedColor = PieceColor.COLORNONE;
        }

        version++;
        GameState state = buildGameStateSnapshot();
        dispatchStateNotification(state);

        return new JoinRoomResult(role, assignedColor, state);
    }

    public void registerObserver(String nickname, ChessObserverPrx observer) {
        if (observer != null && nickname != null) {
            String key = nickname.trim();
            observers.put(key, observer);
            System.out.println("[GameRoom BiDir] Observador registrado para " + key + " en sala " + roomCode);

            notificationExecutor.submit(() -> {
                try {
                    observer.onGameStateChanged(getGameStateSnapshot());
                } catch (Exception e) {
                    System.err.println("[GameRoom BiDir Warning] Error enviando estado inicial a " + key + ": " + e.getMessage());
                }
            });
        }
    }

    public void unregisterObserver(String nickname) {
        if (nickname != null) {
            observers.remove(nickname.trim());
            System.out.println("[GameRoom BiDir] Observador removido: " + nickname);
        }
    }

    public synchronized GameState getGameStateSnapshot() {
        return buildGameStateSnapshot();
    }

    public synchronized boolean makeMove(String nickname, Position from, Position to)
            throws InvalidMoveException, NotPlayerTurnException {

        if (status != GameStatus.INPROGRESS && status != GameStatus.CHECKWHITE && status != GameStatus.CHECKBLACK) {
            throw new InvalidMoveException("La partida no está en curso (Estado: " + status + ").");
        }

        if (currentTurn == PieceColor.COLORWHITE) {
            if (whitePlayer == null || !whitePlayer.equalsIgnoreCase(nickname)) {
                throw new NotPlayerTurnException("Es el turno de las piezas Blancas (" + whitePlayer + ").");
            }
        } else if (currentTurn == PieceColor.COLORBLACK) {
            if (blackPlayer == null || !blackPlayer.equalsIgnoreCase(nickname)) {
                throw new NotPlayerTurnException("Es el turno de las piezas Negras (" + blackPlayer + ").");
            }
        } else {
            throw new NotPlayerTurnException("No es el turno de ningún jugador.");
        }

        if (!ChessRules.isInside(from.row, from.col)) {
            throw new InvalidMoveException("Posición de origen fuera del tablero.");
        }
        ChessPiece piece = board[from.row][from.col];
        if (ChessRules.isEmpty(piece) || piece.color != currentTurn) {
            throw new InvalidMoveException("No hay una pieza propia en la casilla seleccionada.");
        }

        List<Position> legalMoves = ChessRules.getLegalMoves(board, from);
        boolean isLegal = legalMoves.stream().anyMatch(p -> p.row == to.row && p.col == to.col);
        if (!isLegal) {
            throw new InvalidMoveException("Movimiento inválido para " + piece.type + " según las reglas.");
        }

        ChessPiece targetPiece = board[to.row][to.col];
        boolean isCapture = !ChessRules.isEmpty(targetPiece);
        if (isCapture) {
            if (currentTurn == PieceColor.COLORWHITE) {
                whiteCaptured.add(targetPiece);
            } else {
                blackCaptured.add(targetPiece);
            }
        }

        board = ChessRules.simulateMove(board, from, to);

        PieceColor opponent = ChessRules.opponentColor(currentTurn);
        boolean isOpponentInCheck = ChessRules.isKingInCheck(board, opponent);
        boolean hasOpponentMoves = ChessRules.hasAnyLegalMove(board, opponent);

        boolean isCheckmate = false;
        String winner = null;
        int pointsDelta = TierManager.POINTS_WIN;

        if (!hasOpponentMoves) {
            if (isOpponentInCheck) {
                isCheckmate = true;
                if (currentTurn == PieceColor.COLORWHITE) {
                    status = GameStatus.CHECKMATEWHITEWINS;
                    winner = whitePlayer;
                } else {
                    status = GameStatus.CHECKMATEBLACKWINS;
                    winner = blackPlayer;
                }
                tierManager.recordGameResult(whitePlayer, blackPlayer, false, winner);
            } else {
                status = GameStatus.STALEMATE;
                tierManager.recordGameResult(whitePlayer, blackPlayer, true, null);
                pointsDelta = TierManager.POINTS_DRAW;
            }
        } else {
            if (isOpponentInCheck) {
                status = (opponent == PieceColor.COLORWHITE) ? GameStatus.CHECKWHITE : GameStatus.CHECKBLACK;
            } else {
                status = GameStatus.INPROGRESS;
            }
        }

        String notation = ChessRules.formatMoveNotation(piece, from, to, isCapture, isOpponentInCheck, isCheckmate);
        moves.add(new MoveRecord(
                notation,
                nickname,
                currentTurn,
                from,
                to,
                System.currentTimeMillis()
        ));

        if (status == GameStatus.INPROGRESS || status == GameStatus.CHECKWHITE || status == GameStatus.CHECKBLACK) {
            currentTurn = opponent;
        }

        version++;
        GameState state = buildGameStateSnapshot();
        dispatchStateNotification(state);

        if (winner != null || status == GameStatus.STALEMATE) {
            dispatchGameFinishedNotification(state, winner, pointsDelta);
        }

        return true;
    }

    public synchronized void resign(String nickname) throws UnauthorizedActionException {
        if (status != GameStatus.INPROGRESS && status != GameStatus.CHECKWHITE && status != GameStatus.CHECKBLACK) {
            throw new UnauthorizedActionException("La partida no está activa.");
        }

        String winner;
        if (whitePlayer != null && whitePlayer.equalsIgnoreCase(nickname)) {
            status = GameStatus.RESIGNEDBLACKWINS;
            winner = blackPlayer;
        } else if (blackPlayer != null && blackPlayer.equalsIgnoreCase(nickname)) {
            status = GameStatus.RESIGNEDWHITEWINS;
            winner = whitePlayer;
        } else {
            throw new UnauthorizedActionException("Solo un jugador activo puede rendirse.");
        }

        tierManager.recordGameResult(whitePlayer, blackPlayer, false, winner);
        version++;

        GameState state = buildGameStateSnapshot();
        dispatchStateNotification(state);
        dispatchGameFinishedNotification(state, winner, TierManager.POINTS_WIN);
    }

    public synchronized void leave(String nickname) {
        if (nickname == null) return;
        spectators.remove(nickname.trim());
        observers.remove(nickname.trim());

        if (status == GameStatus.INPROGRESS || status == GameStatus.CHECKWHITE || status == GameStatus.CHECKBLACK) {
            try {
                if (whitePlayer != null && whitePlayer.equalsIgnoreCase(nickname)) {
                    resign(nickname);
                } else if (blackPlayer != null && blackPlayer.equalsIgnoreCase(nickname)) {
                    resign(nickname);
                }
            } catch (Exception ignored) {
            }
        } else if (status == GameStatus.WAITINGFORPLAYERS) {
            if (whitePlayer != null && whitePlayer.equalsIgnoreCase(nickname)) {
                status = GameStatus.ABORTED;
            }
        }

        version++;
        dispatchStateNotification(buildGameStateSnapshot());
    }

    public synchronized RoomSummary getSummary() {
        return new RoomSummary(
                roomCode,
                whitePlayer != null ? whitePlayer : "-",
                blackPlayer != null ? blackPlayer : "Esperando...",
                spectators.size(),
                status
        );
    }

    private GameState buildGameStateSnapshot() {
        int whitePts = (whitePlayer != null) ? tierManager.getProfile(whitePlayer).points : 1200;
        int blackPts = (blackPlayer != null) ? tierManager.getProfile(blackPlayer).points : 1200;

        return new GameState(
                roomCode,
                ChessRules.cloneBoard(board),
                currentTurn,
                status,
                whitePlayer != null ? whitePlayer : "",
                blackPlayer != null ? blackPlayer : "",
                whitePts,
                blackPts,
                whiteCaptured.toArray(new ChessPiece[0]),
                blackCaptured.toArray(new ChessPiece[0]),
                moves.toArray(new MoveRecord[0]),
                spectators.size(),
                version
        );
    }

    private void dispatchStateNotification(GameState state) {
        Map<String, ChessObserverPrx> targets = new HashMap<>(observers);

        for (Map.Entry<String, ChessObserverPrx> entry : targets.entrySet()) {
            String nick = entry.getKey();
            ChessObserverPrx obsPrx = entry.getValue();

            notificationExecutor.submit(() -> {
                try {
                    obsPrx.onGameStateChanged(state);
                } catch (com.zeroc.Ice.ConnectionLostException | com.zeroc.Ice.ObjectNotExistException e) {
                    System.err.println("[GameRoom BiDir] Conexión totalmente perdida para " + nick + ". Removiendo.");
                    observers.remove(nick);
                } catch (Exception e) {
                    System.err.println("[GameRoom BiDir Warning] Excepción temporal al notificar a " + nick + ": " + e.getMessage());
                }
            });
        }
    }

    private void dispatchGameFinishedNotification(GameState state, String winner, int pointsDelta) {
        Map<String, ChessObserverPrx> targets = new HashMap<>(observers);

        for (Map.Entry<String, ChessObserverPrx> entry : targets.entrySet()) {
            String nick = entry.getKey();
            ChessObserverPrx obsPrx = entry.getValue();

            notificationExecutor.submit(() -> {
                try {
                    obsPrx.onGameFinished(state, winner != null ? winner : "", pointsDelta);
                } catch (Exception e) {
                    observers.remove(nick);
                }
            });
        }
    }

    public String getRoomCode() {
        return roomCode;
    }
}