import { ChessBoard } from "./ChessBoard.js";
import { PlayerCard } from "./PlayerCard.js";
import { MoveHistory } from "./MoveHistory.js";
import { calculateLocalCandidateMoves } from "../services/chessRulesHelper.js";

export class GameView {
    constructor(handlers = {}) {
        this.handlers = handlers;

        this.element = document.createElement("section");
        this.element.id = "game-view";
        this.element.style.display = "none";

        this.roomCodeSpan = document.createElement("span");
        this.copyCodeBtn = document.createElement("button");
        this.statusBanner = document.createElement("div");
        this.roleBadge = document.createElement("span");
        this.resignBtn = document.createElement("button");
        this.leaveRoomBtn = document.createElement("button");

        this.chessBoard = new ChessBoard((r, c) => this.handleTileClick(r, c));
        this.blackPlayerCard = new PlayerCard("Jugador Negras", "Esperando rival...", "black");
        this.whitePlayerCard = new PlayerCard("Jugador Blancas", "-", "white");
        this.moveHistory = new MoveHistory();
        this.spectatorsCountEl = document.createElement("div");

        this.currentRoomCode = null;
        this.myRole = null;
        this.myColor = null;
        this.gameState = null;
        this.selectedSquare = null;
        this.legalMoves = [];

        this.build();
    }

    build() {
        this.element.appendChild(this.buildTopBar());
        this.element.appendChild(this.buildGameLayout());
    }

    buildTopBar() {
        const topBar = document.createElement("div");
        topBar.className = "game-top-bar";

        const leftGroup = document.createElement("div");
        leftGroup.style.display = "flex";
        leftGroup.style.alignItems = "center";
        leftGroup.style.gap = "8px";

        this.roomCodeSpan.id = "game-room-code";
        this.roomCodeSpan.style.fontSize = "1.1rem";
        this.roomCodeSpan.style.fontWeight = "700";
        this.roomCodeSpan.style.color = "#64B5F6";
        this.roomCodeSpan.textContent = "Sala: ----";

        this.copyCodeBtn.id = "copy-code-btn";
        this.copyCodeBtn.className = "btn btn-secondary";
        this.copyCodeBtn.style.padding = "4px 10px";
        this.copyCodeBtn.style.fontSize = "0.75rem";
        this.copyCodeBtn.textContent = "Copiar";
        this.copyCodeBtn.addEventListener("click", () => {
            if (this.currentRoomCode && navigator.clipboard) {
                navigator.clipboard.writeText(this.currentRoomCode).then(() => {
                    this.copyCodeBtn.textContent = "¡Copiado!";
                    setTimeout(() => {
                        this.copyCodeBtn.textContent = "Copiar";
                    }, 1500);
                });
            }
        });

        leftGroup.appendChild(this.roomCodeSpan);
        leftGroup.appendChild(this.copyCodeBtn);

        this.statusBanner.id = "game-status-banner";
        this.statusBanner.className = "turn-indicator turn-white";
        this.statusBanner.textContent = "Esperando jugadores...";

        const rightGroup = document.createElement("div");
        rightGroup.style.display = "flex";
        rightGroup.style.alignItems = "center";
        rightGroup.style.gap = "12px";

        this.roleBadge.id = "player-role-badge";
        this.roleBadge.className = "role-badge white";
        this.roleBadge.textContent = "BLANCAS";

        this.resignBtn.id = "resign-btn";
        this.resignBtn.className = "btn btn-danger";
        this.resignBtn.textContent = "Rendirse";
        this.resignBtn.addEventListener("click", () => {
            if (this.handlers.onResign) {
                this.handlers.onResign();
            }
        });

        this.leaveRoomBtn.id = "leave-room-btn";
        this.leaveRoomBtn.className = "btn btn-secondary";
        this.leaveRoomBtn.textContent = "Salir";
        this.leaveRoomBtn.addEventListener("click", () => {
            if (this.handlers.onLeaveRoom) {
                this.handlers.onLeaveRoom();
            }
        });

        rightGroup.appendChild(this.roleBadge);
        rightGroup.appendChild(this.resignBtn);
        rightGroup.appendChild(this.leaveRoomBtn);

        topBar.appendChild(leftGroup);
        topBar.appendChild(this.statusBanner);
        topBar.appendChild(rightGroup);

        return topBar;
    }

    buildGameLayout() {
        const layout = document.createElement("div");
        layout.className = "game-layout";

        const sidebar = document.createElement("div");
        sidebar.className = "game-sidebar";

        this.spectatorsCountEl.id = "spectators-count";
        this.spectatorsCountEl.style.textAlign = "center";
        this.spectatorsCountEl.style.fontSize = "0.85rem";
        this.spectatorsCountEl.style.color = "#B0BEC5";
        this.spectatorsCountEl.textContent = "Espectadores en vivo: 0";

        sidebar.appendChild(this.blackPlayerCard.getElement());
        sidebar.appendChild(this.whitePlayerCard.getElement());
        sidebar.appendChild(this.moveHistory.getElement());
        sidebar.appendChild(this.spectatorsCountEl);

        layout.appendChild(this.chessBoard.getElement());
        layout.appendChild(sidebar);

        return layout;
    }

    initSession(roomCode, role, assignedColor, initialGameState) {
        this.currentRoomCode = roomCode;
        this.myRole = role;
        this.myColor = assignedColor;
        this.selectedSquare = null;
        this.legalMoves = [];

        this.roomCodeSpan.textContent = `Sala: ${roomCode}`;
        this.updateRoleBadge();
        this.updateState(initialGameState);
    }

    updateRoleBadge() {
        const roleName = this.extractEnumName(this.myRole, "ROLESPECTATOR");
        if (roleName === "ROLEWHITE") {
            this.roleBadge.className = "role-badge white";
            this.roleBadge.textContent = "TÚ: BLANCAS";
            this.resignBtn.disabled = false;
        } else if (roleName === "ROLEBLACK") {
            this.roleBadge.className = "role-badge black";
            this.roleBadge.textContent = "TÚ: NEGRAS";
            this.resignBtn.disabled = false;
        } else {
            this.roleBadge.className = "role-badge spectator";
            this.roleBadge.textContent = "MODO ESPECTADOR";
            this.resignBtn.disabled = true;
        }
    }

    updateState(gameState) {
        if (!gameState) return;
        this.gameState = gameState;

        // Limpiar selección previa al llegar un estado nuevo
        this.selectedSquare = null;
        this.legalMoves = [];

        const whiteNick = gameState.whitePlayerNickname || gameState.whitePlayer || gameState._whitePlayer || "-";
        const blackNick = gameState.blackPlayerNickname || gameState.blackPlayer || gameState._blackPlayer || "Esperando rival...";

        const whitePts = gameState.whitePoints !== undefined ? gameState.whitePoints : (gameState._whitePoints || 1200);
        const blackPts = gameState.blackPoints !== undefined ? gameState.blackPoints : (gameState._blackPoints || 1200);

        const whiteCap = gameState.whiteCapturedPieces || gameState.whiteCaptured || gameState._whiteCaptured || [];
        const blackCap = gameState.blackCapturedPieces || gameState.blackCaptured || gameState._blackCaptured || [];

        const specCount = gameState.spectatorCount !== undefined ? gameState.spectatorCount : (gameState._spectatorCount || 0);
        const movesList = gameState.moves || gameState._moves || [];

        // 1. Banner superior
        this.updateTurnBanner(gameState);

        // 2. Tarjetas de Jugadores
        if (this.whitePlayerCard) this.whitePlayerCard.update(whiteNick, whitePts, whiteCap);
        if (this.blackPlayerCard) this.blackPlayerCard.update(blackNick, blackPts, blackCap);

        // 3. Historial y espectadores
        if (this.spectatorsCountEl) this.spectatorsCountEl.textContent = `Espectadores en vivo: ${specCount}`;
        if (this.moveHistory) {
            if (typeof this.moveHistory.update === "function") this.moveHistory.update(movesList);
            else if (typeof this.moveHistory.render === "function") this.moveHistory.render(movesList);
        }

        // 4. Renderizar el nuevo tablero de ajedrez
        if (this.chessBoard) {
            this.chessBoard.render(this.gameState, null, []);
        }

        const roleName = this.extractEnumName(this.myRole, "ROLESPECTATOR");
        const sName = this.extractEnumName(gameState.status || gameState._status, "");
        const isActive = sName === "INPROGRESS" || sName === "CHECKWHITE" || sName === "CHECKBLACK";

        if (this.resignBtn) {
            this.resignBtn.disabled = (roleName === "ROLESPECTATOR") || !isActive;
        }
    }

    updateTurnBanner(gameState) {
        const sName = this.extractEnumName(gameState.status || gameState._status, "INPROGRESS");
        const tColor = this.extractEnumName(gameState.currentTurn || gameState._currentTurn, "COLORWHITE");

        const whiteNick = gameState.whitePlayerNickname || gameState._whitePlayerNickname || "";
        const blackNick = gameState.blackPlayerNickname || gameState._blackPlayerNickname || "";

        switch (sName) {
            case "WAITINGFORPLAYERS":
                this.statusBanner.textContent = "Esperando que el segundo jugador se una...";
                this.statusBanner.className = "turn-indicator";
                this.statusBanner.style.color = "var(--accent-amber)";
                break;
            case "INPROGRESS":
                if (tColor === "COLORWHITE") {
                    this.statusBanner.textContent = `Turno de BLANCAS (${whiteNick || 'Blancas'})`;
                    this.statusBanner.className = "turn-indicator turn-white";
                    this.statusBanner.style.color = "#FFFFFF";
                } else {
                    this.statusBanner.textContent = `Turno de NEGRAS (${blackNick || 'Negras'})`;
                    this.statusBanner.className = "turn-indicator turn-black";
                    this.statusBanner.style.color = "#90CAF9";
                }
                break;
            case "CHECKWHITE":
                this.statusBanner.textContent = `¡JAQUE A BLANCAS! (${whiteNick})`;
                this.statusBanner.className = "turn-indicator turn-check";
                this.statusBanner.style.color = "var(--accent-red)";
                break;
            case "CHECKBLACK":
                this.statusBanner.textContent = `¡JAQUE A NEGRAS! (${blackNick})`;
                this.statusBanner.className = "turn-indicator turn-check";
                this.statusBanner.style.color = "var(--accent-red)";
                break;
            case "CHECKMATEWHITEWINS":
                this.statusBanner.textContent = `¡JAQUE MATE! GANAN LAS BLANCAS (${whiteNick})`;
                this.statusBanner.className = "turn-indicator turn-mate";
                this.statusBanner.style.color = "#69F0AE";
                break;
            case "CHECKMATEBLACKWINS":
                this.statusBanner.textContent = `¡JAQUE MATE! GANAN LAS NEGRAS (${blackNick})`;
                this.statusBanner.className = "turn-indicator turn-mate";
                this.statusBanner.style.color = "#69F0AE";
                break;
            case "STALEMATE":
                this.statusBanner.textContent = "TABLAS POR AHOGADO";
                this.statusBanner.className = "turn-indicator";
                this.statusBanner.style.color = "#FFD54F";
                break;
            case "RESIGNEDWHITEWINS":
                this.statusBanner.textContent = "GANAN LAS BLANCAS POR ABANDONO";
                this.statusBanner.className = "turn-indicator turn-mate";
                this.statusBanner.style.color = "#69F0AE";
                break;
            case "RESIGNEDBLACKWINS":
                this.statusBanner.textContent = "GANAN LAS NEGRAS POR ABANDONO";
                this.statusBanner.className = "turn-indicator turn-mate";
                this.statusBanner.style.color = "#69F0AE";
                break;
            default:
                this.statusBanner.textContent = `Estado: ${sName}`;
                break;
        }
    }

    async handleTileClick(row, col) {
        const roleName = this.extractEnumName(this.myRole, "ROLESPECTATOR");
        if (roleName === "ROLESPECTATOR" || !this.gameState) return;

        const currentTurnColor = this.extractEnumName(this.gameState.currentTurn || this.gameState._currentTurn, "");
        const myColorName = this.extractEnumName(this.myColor, "");

        const effectiveMyColor = myColorName || (roleName === "ROLEWHITE" ? "COLORWHITE" : (roleName === "ROLEBLACK" ? "COLORBLACK" : ""));

        if (currentTurnColor && effectiveMyColor && currentTurnColor !== effectiveMyColor) {
            return;
        }

        const board = this.gameState.board || this.gameState._board;
        const clickedPiece = board[row] ? board[row][col] : null;
        const pieceColorName = clickedPiece ? this.extractEnumName(clickedPiece.color || clickedPiece._color, "") : "";
        const isOwnPiece = clickedPiece && pieceColorName === effectiveMyColor;

        if (this.selectedSquare) {
            const isLegalMove = this.legalMoves.some(m => m.row === row && m.col === col);
            if (isLegalMove) {
                const from = { ...this.selectedSquare };
                this.selectedSquare = null;
                this.legalMoves = [];
                this.chessBoard.render(this.gameState, null, []);

                if (this.handlers.onMove) {
                    await this.handlers.onMove(from.row, from.col, row, col);
                }
                return;
            }
        }

        if (isOwnPiece) {
            this.selectedSquare = { row, col };
            this.legalMoves = calculateLocalCandidateMoves(board, row, col, effectiveMyColor);
            this.chessBoard.render(this.gameState, this.selectedSquare, this.legalMoves);
            return;
        }

        this.selectedSquare = null;
        this.legalMoves = [];
        this.chessBoard.render(this.gameState, null, []);
    }

    extractEnumName(obj, defaultVal = "") {
        if (!obj) return defaultVal;
        if (typeof obj === "string") return obj;
        if (obj._name) return obj._name;
        if (obj.name) return obj.name;
        if (typeof obj.value !== "undefined") {
            if (obj.value === 0) return "COLORWHITE";
            if (obj.value === 1) return "COLORBLACK";
        }
        return String(obj);
    }

    show() {
        this.element.style.display = "block";
    }

    hide() {
        this.element.style.display = "none";
    }

    getElement() {
        return this.element;
    }
}